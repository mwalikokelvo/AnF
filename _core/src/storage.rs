//! SQLx/SQLite stays exclusively in memory; persistence is an AES-GCM snapshot.
//! The caller writes only export_snapshot() ciphertext to its private storage.
use crate::{CoreError, VaultSession};
use sqlx::{
    sqlite::{SqliteConnection, SqliteOwnedBuf},
    Connection, Row,
};
use std::sync::{Arc, Mutex};
use tokio::runtime::{Builder, Runtime};
use zeroize::Zeroizing;

const MAX_SNAPSHOT: usize = 128 * 1024 * 1024;
const SCHEMA: &str = r#"
PRAGMA temp_store=MEMORY;
PRAGMA journal_mode=MEMORY;
PRAGMA secure_delete=ON;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS books (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL,
 filepath TEXT NOT NULL, cover_path TEXT NOT NULL, format TEXT NOT NULL,
 file_size INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reading_progress (
 book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
 last_read_position TEXT NOT NULL, chapter_index INTEGER NOT NULL,
 percentage REAL NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS annotations (
 id TEXT PRIMARY KEY, book_id TEXT REFERENCES books(id) ON DELETE CASCADE,
 cfi_range TEXT NOT NULL, selected_text TEXT NOT NULL,
 color TEXT NOT NULL, note TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS passage_index USING fts5(book_id UNINDEXED, location UNINDEXED, content, tokenize='unicode61');
PRAGMA user_version=1;
"#;

#[derive(Clone, Debug, uniffi::Record)]
pub struct LibraryBook {
    pub id: String,
    pub title: String,
    pub author: String,
    pub filepath: String,
    pub cover_path: String,
    pub format: String,
    pub file_size: u64,
    pub created_at: i64,
}
#[derive(Clone, Debug, uniffi::Record)]
pub struct PassageMatch {
    pub book_id: String,
    pub location: String,
    pub text: String,
    pub score: f64,
}
#[derive(Clone, Debug, uniffi::Record)]
pub struct ReadingPosition {
    pub book_id: String,
    pub position: String,
    pub chapter: u32,
    pub percentage: f64,
    pub updated_at: i64,
}
#[derive(Clone, Debug, uniffi::Record)]
pub struct LibraryAnnotation {
    pub id: String,
    pub book_id: String,
    pub range: String,
    pub text: String,
    pub color: String,
    pub note: String,
    pub created_at: i64,
}
#[derive(uniffi::Object)]
pub struct LibrarySession {
    runtime: Runtime,
    connection: Mutex<Option<SqliteConnection>>,
    vault: Arc<VaultSession>,
}

fn database(_error: sqlx::Error) -> CoreError {
    CoreError::Database
}
fn validate_string(s: &str, max: usize) -> Result<(), CoreError> {
    if s.len() > max || s.contains('\0') {
        Err(CoreError::InvalidInput)
    } else {
        Ok(())
    }
}
fn quoted_query(query: &str) -> Result<String, CoreError> {
    validate_string(query, 1024)?;
    let words: Vec<_> = query.split_whitespace().take(33).collect();
    if words.is_empty() || words.len() > 32 {
        return Err(CoreError::InvalidInput);
    }
    Ok(words
        .into_iter()
        .map(|w| format!("\"{}\"", w.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" AND "))
}

impl LibrarySession {
    fn connect(
        vault: Arc<VaultSession>,
        snapshot: Option<Vec<u8>>,
    ) -> Result<Arc<Self>, CoreError> {
        // Also validates that the vault has not already been locked.
        vault.encrypt(Vec::new())?;
        let runtime = Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|_| CoreError::Database)?;
        let connection = runtime.block_on(async {
            let mut db = SqliteConnection::connect("sqlite::memory:")
                .await
                .map_err(database)?;
            if let Some(snapshot) = snapshot {
                if snapshot.len() > MAX_SNAPSHOT + 28 {
                    return Err(CoreError::InvalidInput);
                }
                let clear = Zeroizing::new(vault.decrypt(snapshot)?);
                if !clear.starts_with(b"SQLite format 3\0") {
                    return Err(CoreError::InvalidInput);
                }
                let data = SqliteOwnedBuf::try_from(clear.as_slice()).map_err(database)?;
                db.deserialize(None, data, false).await.map_err(database)?;
                let version: i64 = sqlx::query_scalar("PRAGMA user_version")
                    .fetch_one(&mut db)
                    .await
                    .map_err(database)?;
                if version != 1 {
                    return Err(CoreError::InvalidInput);
                }
                let valid: String = sqlx::query_scalar("PRAGMA quick_check")
                    .fetch_one(&mut db)
                    .await
                    .map_err(database)?;
                if valid != "ok" {
                    return Err(CoreError::Database);
                }
            }
            sqlx::raw_sql(SCHEMA)
                .execute(&mut db)
                .await
                .map_err(database)?;
            Ok(db)
        })?;
        Ok(Arc::new(Self {
            runtime,
            connection: Mutex::new(Some(connection)),
            vault,
        }))
    }
    fn unlocked(&self) -> Result<(), CoreError> {
        if self.vault.is_locked() {
            Err(CoreError::Locked)
        } else {
            Ok(())
        }
    }
}

#[uniffi::export]
impl LibrarySession {
    #[uniffi::constructor]
    pub fn new(vault: Arc<VaultSession>) -> Result<Arc<Self>, CoreError> {
        Self::connect(vault, None)
    }
    #[uniffi::constructor]
    pub fn from_snapshot(
        vault: Arc<VaultSession>,
        snapshot: Vec<u8>,
    ) -> Result<Arc<Self>, CoreError> {
        Self::connect(vault, Some(snapshot))
    }

    pub fn upsert_book(&self, book: LibraryBook) -> Result<(), CoreError> {
        if book.id.is_empty() || book.title.is_empty() || book.file_size > i64::MAX as u64 {
            return Err(CoreError::InvalidInput);
        }
        for s in [
            &book.id,
            &book.title,
            &book.author,
            &book.filepath,
            &book.cover_path,
        ] {
            validate_string(s, 4096)?;
        }
        if !matches!(book.format.as_str(), "EPUB" | "PDF" | "TXT") {
            return Err(CoreError::InvalidInput);
        }
        let mut guard = self.connection.lock().map_err(|_| CoreError::Locked)?;
        self.unlocked()?;
        let db = guard.as_mut().ok_or(CoreError::Locked)?;
        self.runtime.block_on(sqlx::query("INSERT INTO books(id,title,author,filepath,cover_path,format,file_size,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,author=excluded.author,filepath=excluded.filepath,cover_path=excluded.cover_path,format=excluded.format,file_size=excluded.file_size")
            .bind(book.id).bind(book.title).bind(book.author).bind(book.filepath).bind(book.cover_path).bind(book.format)
            .bind(book.file_size as i64).bind(book.created_at).execute(db)).map_err(database)?;
        Ok(())
    }
    pub fn books(&self) -> Result<Vec<LibraryBook>, CoreError> {
        let mut guard = self.connection.lock().map_err(|_| CoreError::Locked)?;
        self.unlocked()?;
        let db = guard.as_mut().ok_or(CoreError::Locked)?;
        let rows = self
            .runtime
            .block_on(
                sqlx::query("SELECT * FROM books ORDER BY title COLLATE NOCASE LIMIT 10000")
                    .fetch_all(db),
            )
            .map_err(database)?;
        rows.into_iter()
            .map(|r| {
                Ok(LibraryBook {
                    id: r.try_get("id").map_err(database)?,
                    title: r.try_get("title").map_err(database)?,
                    author: r.try_get("author").map_err(database)?,
                    filepath: r.try_get("filepath").map_err(database)?,
                    cover_path: r.try_get("cover_path").map_err(database)?,
                    format: r.try_get("format").map_err(database)?,
                    file_size: r.try_get::<i64, _>("file_size").map_err(database)? as u64,
                    created_at: r.try_get("created_at").map_err(database)?,
                })
            })
            .collect()
    }
    pub fn index_passages(
        &self,
        book_id: String,
        locations: Vec<String>,
        texts: Vec<String>,
    ) -> Result<(), CoreError> {
        if locations.len() != texts.len() || locations.len() > 10000 {
            return Err(CoreError::InvalidInput);
        }
        validate_string(&book_id, 4096)?;
        for location in &locations {
            validate_string(location, 4096)?;
        }
        for text in &texts {
            validate_string(text, 64 * 1024)?;
        }
        if texts.iter().map(String::len).sum::<usize>() > 32 * 1024 * 1024 {
            return Err(CoreError::InvalidInput);
        }
        let mut guard = self.connection.lock().map_err(|_| CoreError::Locked)?;
        self.unlocked()?;
        let db = guard.as_mut().ok_or(CoreError::Locked)?;
        self.runtime.block_on(async {
            let mut tx = db.begin().await.map_err(database)?;
            let count: i64 = sqlx::query_scalar("SELECT count(*) FROM books WHERE id=?")
                .bind(&book_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(database)?;
            if count != 1 {
                return Err(CoreError::InvalidInput);
            }
            sqlx::query("DELETE FROM passage_index WHERE book_id=?")
                .bind(&book_id)
                .execute(&mut *tx)
                .await
                .map_err(database)?;
            for (location, text) in locations.into_iter().zip(texts) {
                sqlx::query("INSERT INTO passage_index(book_id,location,content) VALUES(?,?,?)")
                    .bind(&book_id)
                    .bind(location)
                    .bind(text)
                    .execute(&mut *tx)
                    .await
                    .map_err(database)?;
            }
            tx.commit().await.map_err(database)
        })
    }
    pub fn search(&self, query: String, limit: u32) -> Result<Vec<PassageMatch>, CoreError> {
        let query = quoted_query(&query)?;
        let mut guard = self.connection.lock().map_err(|_| CoreError::Locked)?;
        self.unlocked()?;
        let db = guard.as_mut().ok_or(CoreError::Locked)?;
        let rows=self.runtime.block_on(sqlx::query("SELECT book_id,location,content,bm25(passage_index) AS score FROM passage_index WHERE passage_index MATCH ? ORDER BY score LIMIT ?")
            .bind(query).bind(limit.clamp(1,100) as i64).fetch_all(db)).map_err(database)?;
        rows.into_iter()
            .map(|r| {
                Ok(PassageMatch {
                    book_id: r.try_get("book_id").map_err(database)?,
                    location: r.try_get("location").map_err(database)?,
                    text: r.try_get("content").map_err(database)?,
                    score: r.try_get("score").map_err(database)?,
                })
            })
            .collect()
    }
    pub fn export_snapshot(&self) -> Result<Vec<u8>, CoreError> {
        let mut guard = self.connection.lock().map_err(|_| CoreError::Locked)?;
        self.unlocked()?;
        let db = guard.as_mut().ok_or(CoreError::Locked)?;
        let mut snapshot = self
            .runtime
            .block_on(db.serialize(None))
            .map_err(database)?;
        if snapshot.len() > MAX_SNAPSHOT {
            snapshot.fill(0);
            return Err(CoreError::InvalidInput);
        }
        let encrypted = self.vault.encrypt(snapshot.to_vec());
        snapshot.fill(0);
        encrypted
    }
    pub fn set_position(&self, p: ReadingPosition) -> Result<(), CoreError> {
        validate_string(&p.book_id, 4096)?;
        validate_string(&p.position, 4096)?;
        if !p.percentage.is_finite() || !(0.0..=100.0).contains(&p.percentage) {
            return Err(CoreError::InvalidInput);
        }
        let mut guard = self.connection.lock().map_err(|_| CoreError::Locked)?;
        self.unlocked()?;
        let db = guard.as_mut().ok_or(CoreError::Locked)?;
        self.runtime.block_on(sqlx::query("INSERT INTO reading_progress(book_id,last_read_position,chapter_index,percentage,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(book_id) DO UPDATE SET last_read_position=excluded.last_read_position,chapter_index=excluded.chapter_index,percentage=excluded.percentage,updated_at=excluded.updated_at")
            .bind(p.book_id).bind(p.position).bind(p.chapter as i64).bind(p.percentage).bind(p.updated_at).execute(db)).map_err(database)?;
        Ok(())
    }
    pub fn position(&self, book_id: String) -> Result<Option<ReadingPosition>, CoreError> {
        validate_string(&book_id, 4096)?;
        let mut guard = self.connection.lock().map_err(|_| CoreError::Locked)?;
        self.unlocked()?;
        let db = guard.as_mut().ok_or(CoreError::Locked)?;
        let row = self
            .runtime
            .block_on(
                sqlx::query("SELECT * FROM reading_progress WHERE book_id=?")
                    .bind(book_id)
                    .fetch_optional(db),
            )
            .map_err(database)?;
        row.map(|r| {
            Ok(ReadingPosition {
                book_id: r.try_get("book_id").map_err(database)?,
                position: r.try_get("last_read_position").map_err(database)?,
                chapter: r.try_get::<i64, _>("chapter_index").map_err(database)? as u32,
                percentage: r.try_get("percentage").map_err(database)?,
                updated_at: r.try_get("updated_at").map_err(database)?,
            })
        })
        .transpose()
    }
    pub fn save_annotation(&self, n: LibraryAnnotation) -> Result<(), CoreError> {
        for s in [&n.id, &n.book_id, &n.range] {
            validate_string(s, 4096)?;
        }
        validate_string(&n.text, 20000)?;
        validate_string(&n.note, 20000)?;
        if n.id.is_empty()
            || !matches!(
                n.color.as_str(),
                "yellow" | "green" | "coral" | "blue" | "underline"
            )
        {
            return Err(CoreError::InvalidInput);
        }
        let mut guard = self.connection.lock().map_err(|_| CoreError::Locked)?;
        self.unlocked()?;
        let db = guard.as_mut().ok_or(CoreError::Locked)?;
        let result=self.runtime.block_on(sqlx::query("INSERT INTO annotations(id,book_id,cfi_range,selected_text,color,note,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET cfi_range=excluded.cfi_range,selected_text=excluded.selected_text,color=excluded.color,note=excluded.note WHERE annotations.book_id=excluded.book_id")
            .bind(n.id).bind(n.book_id).bind(n.range).bind(n.text).bind(n.color).bind(n.note).bind(n.created_at).execute(db)).map_err(database)?;
        if result.rows_affected() != 1 {
            return Err(CoreError::InvalidInput);
        }
        Ok(())
    }
    pub fn annotations(&self, book_id: String) -> Result<Vec<LibraryAnnotation>, CoreError> {
        validate_string(&book_id, 4096)?;
        let mut guard = self.connection.lock().map_err(|_| CoreError::Locked)?;
        self.unlocked()?;
        let db = guard.as_mut().ok_or(CoreError::Locked)?;
        let rows = self
            .runtime
            .block_on(
                sqlx::query(
                    "SELECT * FROM annotations WHERE book_id=? ORDER BY created_at LIMIT 10000",
                )
                .bind(book_id)
                .fetch_all(db),
            )
            .map_err(database)?;
        rows.into_iter()
            .map(|r| {
                Ok(LibraryAnnotation {
                    id: r.try_get("id").map_err(database)?,
                    book_id: r.try_get("book_id").map_err(database)?,
                    range: r.try_get("cfi_range").map_err(database)?,
                    text: r.try_get("selected_text").map_err(database)?,
                    color: r.try_get("color").map_err(database)?,
                    note: r.try_get("note").map_err(database)?,
                    created_at: r.try_get("created_at").map_err(database)?,
                })
            })
            .collect()
    }
    pub fn remove_book(&self, book_id: String) -> Result<(), CoreError> {
        validate_string(&book_id, 4096)?;
        let mut guard = self.connection.lock().map_err(|_| CoreError::Locked)?;
        self.unlocked()?;
        let db = guard.as_mut().ok_or(CoreError::Locked)?;
        self.runtime.block_on(async {
            let mut tx = db.begin().await.map_err(database)?;
            sqlx::query("DELETE FROM passage_index WHERE book_id=?")
                .bind(&book_id)
                .execute(&mut *tx)
                .await
                .map_err(database)?;
            sqlx::query("DELETE FROM books WHERE id=?")
                .bind(book_id)
                .execute(&mut *tx)
                .await
                .map_err(database)?;
            tx.commit().await.map_err(database)
        })
    }
    pub fn lock(&self) -> Result<(), CoreError> {
        let mut guard = self.connection.lock().map_err(|_| CoreError::Locked)?;
        self.vault.lock()?;
        let connection = guard.take();
        if let Some(connection) = connection {
            self.runtime
                .block_on(connection.close())
                .map_err(database)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn book() -> LibraryBook {
        LibraryBook {
            id: "book-1".into(),
            title: "Secret title".into(),
            author: "Private writer".into(),
            filepath: "encrypted-book.bin".into(),
            cover_path: String::new(),
            format: "EPUB".into(),
            file_size: 123,
            created_at: 1,
        }
    }
    #[test]
    fn encrypted_snapshot_preserves_fts_and_rejects_tampering() {
        let salt = crate::new_salt();
        let vault = VaultSession::new("test-password".into(), salt.clone()).unwrap();
        let library = LibrarySession::new(vault).unwrap();
        library.upsert_book(book()).unwrap();
        library
            .index_passages(
                "book-1".into(),
                vec!["chapter:1".into(), "chapter:2".into()],
                vec![
                    "Private observations about starlight".into(),
                    "A distant lighthouse".into(),
                ],
            )
            .unwrap();
        assert_eq!(
            library.search("starlight".into(), 10).unwrap()[0].location,
            "chapter:1"
        );
        library
            .set_position(ReadingPosition {
                book_id: "book-1".into(),
                position: "epubcfi(/6/2!/4/2:5)".into(),
                chapter: 1,
                percentage: 12.5,
                updated_at: 10,
            })
            .unwrap();
        library
            .save_annotation(LibraryAnnotation {
                id: "note-1".into(),
                book_id: "book-1".into(),
                range: "epubcfi(/6/2!/4/2:5)".into(),
                text: "A highlighted passage".into(),
                color: "green".into(),
                note: "Confidential interpretation".into(),
                created_at: 11,
            })
            .unwrap();
        let snapshot = library.export_snapshot().unwrap();
        for secret in [
            "Secret title",
            "Private writer",
            "starlight",
            "SQLite format 3",
            "Confidential interpretation",
        ] {
            assert!(!snapshot
                .windows(secret.len())
                .any(|v| v == secret.as_bytes()));
        }
        library.lock().unwrap();
        assert!(library.books().is_err());
        let restored = LibrarySession::from_snapshot(
            VaultSession::new("test-password".into(), salt.clone()).unwrap(),
            snapshot.clone(),
        )
        .unwrap();
        assert_eq!(restored.books().unwrap()[0].title, "Secret title");
        assert_eq!(
            restored
                .position("book-1".into())
                .unwrap()
                .unwrap()
                .percentage,
            12.5
        );
        assert_eq!(
            restored.annotations("book-1".into()).unwrap()[0].note,
            "Confidential interpretation"
        );
        assert_eq!(restored.search("lighthouse".into(), 10).unwrap().len(), 1);
        let mut corrupt = snapshot.clone();
        corrupt[20] ^= 1;
        assert!(LibrarySession::from_snapshot(
            VaultSession::new("test-password".into(), salt.clone()).unwrap(),
            corrupt
        )
        .is_err());
        assert!(LibrarySession::from_snapshot(
            VaultSession::new("wrong-password".into(), salt).unwrap(),
            snapshot
        )
        .is_err());
    }
    #[test]
    fn indexing_is_transactional_and_query_operators_are_literal() {
        let library = LibrarySession::new(
            VaultSession::new("test-password".into(), crate::new_salt()).unwrap(),
        )
        .unwrap();
        library.upsert_book(book()).unwrap();
        library
            .index_passages("book-1".into(), vec!["1".into()], vec!["alpha beta".into()])
            .unwrap();
        assert!(library
            .index_passages(
                "missing".into(),
                vec!["1".into()],
                vec!["corruption".into()]
            )
            .is_err());
        assert_eq!(library.search("alpha".into(), 5).unwrap().len(), 1);
        assert_eq!(library.search("alpha OR beta".into(), 5).unwrap().len(), 0);
        assert!(library.search(String::new(), 5).is_err());
        library.remove_book("book-1".into()).unwrap();
        assert!(library.books().unwrap().is_empty());
        assert!(library.search("alpha".into(), 5).unwrap().is_empty());
        assert!(library.annotations("book-1".into()).unwrap().is_empty());
    }
}
