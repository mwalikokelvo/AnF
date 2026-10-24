//! SQLCipher project repository. Legacy files remain available for recovery.
use crate::{
    local_ai::random_key,
    platform,
    projects::{validate, Entry, Project},
    settings,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

fn error(e: impl std::fmt::Display) -> String {
    format!("Encrypted storage: {e}")
}
fn path() -> PathBuf {
    settings::local_dir().join("vault").join("coucou.db")
}
pub fn enabled() -> bool {
    path().is_file() || path().with_extension("active").exists()
}
#[derive(Serialize)]
pub struct Status {
    pub encrypted: bool,
    pub projects: usize,
    pub legacy_retained: bool,
    pub engine: String,
}
fn credential() -> Result<keyring::Entry, String> {
    let id = format!(
        "{:x}",
        Sha256::digest(settings::local_dir().to_string_lossy().as_bytes())
    );
    keyring::Entry::new("Coucou SQLCipher vault", &id).map_err(error)
}
fn key(create: bool) -> Result<String, String> {
    let entry = credential()?;
    match entry.get_password(){Ok(value) if valid_key(&value)=>Ok(value),Err(keyring::Error::NoEntry) if create=>{let value=random_key()?;entry.set_password(&value).map_err(error)?;Ok(value)},_=>Err("The vault key is unavailable. Restore its recovery pack; no replacement key was generated.".into())}
}
fn valid_key(k: &str) -> bool {
    k.len() == 64 && k.bytes().all(|c| c.is_ascii_hexdigit())
}
pub fn connect(file: &Path, key: &str, create: bool) -> Result<Connection, String> {
    if !valid_key(key) {
        return Err("Invalid vault key.".into());
    }
    let flags = rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE
        | if create {
            rusqlite::OpenFlags::SQLITE_OPEN_CREATE
        } else {
            rusqlite::OpenFlags::empty()
        };
    let db = Connection::open_with_flags(file, flags).map_err(error)?;
    db.execute_batch(&format!("PRAGMA key=\"x'{key}'\"; PRAGMA temp_store=MEMORY; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; PRAGMA journal_mode=DELETE;")).map_err(|_|"Cannot unlock the encrypted vault. Check its key or restore a backup.".to_string())?;
    db.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(error)?;
    let cipher: String = db
        .query_row("PRAGMA cipher_version", [], |r| r.get(0))
        .map_err(error)?;
    if cipher.is_empty() {
        return Err("SQLCipher is unavailable; plaintext storage was refused.".into());
    }
    db.query_row("SELECT count(*) FROM sqlite_master", [], |r| {
        r.get::<_, i64>(0)
    })
    .map_err(|_| "Cannot unlock the encrypted vault. No data was changed.".to_string())?;
    Ok(db)
}
fn schema(db: &Connection) -> Result<(), String> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,json TEXT NOT NULL,updated INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS versions(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL,json TEXT NOT NULL,updated INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS versions_id ON versions(id,seq); CREATE VIRTUAL TABLE IF NOT EXISTS project_search USING fts5(id UNINDEXED,title,body,tokenize='unicode61');").map_err(error)
}
fn open() -> Result<Connection, String> {
    let db = connect(&path(), &key(false)?, false)?;
    let version: String = db
        .query_row("SELECT value FROM meta WHERE key='schema'", [], |r| {
            r.get(0)
        })
        .map_err(error)?;
    if version != "1" {
        return Err("Unsupported vault schema. Update Coucou.".into());
    }
    Ok(db)
}
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}
fn write(db: &Connection, p: &Project) -> Result<(), String> {
    write_at(db, p, now())
}
fn write_at(db: &Connection, p: &Project, stamp: i64) -> Result<(), String> {
    validate(p)?;
    let json = serde_json::to_string(p).map_err(error)?;
    if json.len() > 16_000_000 {
        return Err("Project exceeds 16 MB.".into());
    }
    let existing: Option<String> = db
        .query_row("SELECT json FROM projects WHERE id=?1", [&p.id], |r| {
            r.get(0)
        })
        .optional()
        .map_err(error)?;
    if existing.as_deref() == Some(json.as_str()) {
        return Ok(());
    }
    db.execute("INSERT INTO projects VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET json=excluded.json,updated=excluded.updated",params![p.id,json,stamp]).map_err(error)?;
    let recent: Option<(i64, i64)> = db
        .query_row(
            "SELECT seq,updated FROM versions WHERE id=?1 ORDER BY seq DESC LIMIT 1",
            [&p.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(error)?;
    if let Some((seq, _)) = recent.filter(|(_, updated)| *updated / 60_000 == stamp / 60_000) {
        db.execute(
            "UPDATE versions SET json=?1,updated=?2 WHERE seq=?3",
            params![json, stamp, seq],
        )
        .map_err(error)?;
    } else {
        db.execute(
            "INSERT INTO versions(id,json,updated) VALUES(?1,?2,?3)",
            params![p.id, json, stamp],
        )
        .map_err(error)?;
    }
    db.execute("DELETE FROM versions WHERE id=?1 AND seq NOT IN (SELECT seq FROM versions WHERE id=?1 ORDER BY seq DESC LIMIT 20)",[&p.id]).map_err(error)?;
    let body = std::iter::once(p.draft.as_str())
        .chain(std::iter::once(p.title.as_str()))
        .chain(std::iter::once(p.question.as_str()))
        .chain(std::iter::once(p.memory.as_str()))
        .chain(
            p.history
                .iter()
                .flat_map(|t| t.content.iter().map(|c| c.text.as_str())),
        )
        .chain(p.sources.iter().map(|s| s.text.as_str()))
        .collect::<Vec<_>>()
        .join("\n");
    db.execute("DELETE FROM project_search WHERE id=?1", [&p.id])
        .map_err(error)?;
    db.execute(
        "INSERT INTO project_search(id,title,body) VALUES(?1,?2,?3)",
        params![p.id, p.name, body],
    )
    .map_err(error)?;
    Ok(())
}
pub fn save(p: &Project) -> Result<(), String> {
    let mut db = open()?;
    let tx = db.transaction().map_err(error)?;
    write(&tx, p)?;
    tx.commit().map_err(error)
}
pub fn load(id: &str) -> Result<Project, String> {
    let db = open()?;
    let json: String = db
        .query_row("SELECT json FROM projects WHERE id=?1", [id], |r| r.get(0))
        .map_err(|_| "Saved project is unavailable.".to_string())?;
    let p: Project = serde_json::from_str(&json).map_err(error)?;
    validate(&p)?;
    if p.id != id {
        return Err("Project identity mismatch.".into());
    }
    Ok(p)
}
pub fn list(query: &str) -> Result<Vec<Entry>, String> {
    if query.len() > 1024 {
        return Err("Use a shorter search phrase.".into());
    }
    let db = open()?;
    let sql = if query.trim().is_empty() {
        "SELECT id,json_extract(json,'$.name'),updated,substr(json_extract(json,'$.draft'),1,160) FROM projects ORDER BY updated DESC"
    } else {
        "SELECT p.id,json_extract(p.json,'$.name'),p.updated,snippet(project_search,2,'','', '…',24) FROM project_search JOIN projects p ON p.id=project_search.id WHERE project_search MATCH ?1 ORDER BY rank,p.updated DESC"
    };
    let term = query
        .split_whitespace()
        .map(|s| format!("\"{}\"", s.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" AND ");
    let mut stmt = db.prepare(sql).map_err(error)?;
    let read = |r: &rusqlite::Row<'_>| {
        Ok(Entry {
            id: r.get(0)?,
            name: r.get(1)?,
            updated: r.get::<_, i64>(2)?.max(0) as u128,
            snippet: r.get(3)?,
        })
    };
    if term.is_empty() {
        stmt.query_map([], read)
            .map_err(error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)
    } else {
        stmt.query_map([term], read)
            .map_err(error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)
    }
}
pub fn status() -> Result<Status, String> {
    let legacy = settings::local_dir().join("projects").is_dir();
    if !enabled() {
        return Ok(Status {
            encrypted: false,
            projects: 0,
            legacy_retained: legacy,
            engine: "Not enabled".into(),
        });
    }
    let db = open()?;
    Ok(Status {
        encrypted: true,
        projects: db
            .query_row("SELECT count(*) FROM projects", [], |r| r.get::<_, i64>(0))
            .map_err(error)? as usize,
        legacy_retained: legacy,
        engine: db
            .query_row("PRAGMA cipher_version", [], |r| r.get(0))
            .map_err(error)?,
    })
}
pub fn migrate(
    ids: &[String],
    load: impl Fn(&str) -> Result<Project, String>,
) -> Result<Status, String> {
    if enabled() {
        return status();
    }
    let dest = path();
    platform::ensure_private_dir(dest.parent().unwrap()).map_err(error)?;
    let secret = key(true)?;
    // Random staging names never replace another attempt or the legacy source.
    let stage = dest.with_file_name(format!("migration-{}.db", random_key()?));
    let mut db = connect(&stage, &secret, true)?;
    schema(&db)?;
    let tx = db.transaction().map_err(error)?;
    let mut expected = Vec::with_capacity(ids.len());
    for id in ids {
        let p = load(id)?;
        let json = serde_json::to_string(&p).map_err(error)?;
        expected.push((id.clone(), Sha256::digest(json.as_bytes())));
        write(&tx, &p)?;
    }
    tx.execute("INSERT INTO meta VALUES('schema','1')", [])
        .map_err(error)?;
    tx.commit().map_err(error)?;
    drop(db);
    // All content is read and compared after closing/reopening before the switch.
    let check = connect(&stage, &secret, false)?;
    for (id, digest) in &expected {
        let json: String = check
            .query_row("SELECT json FROM projects WHERE id=?1", [id], |r| r.get(0))
            .map_err(error)?;
        if Sha256::digest(json.as_bytes()) != *digest {
            return Err("Migration comparison failed. Legacy files are unchanged.".into());
        }
    }
    let count: i64 = check
        .query_row("SELECT count(*) FROM projects", [], |r| r.get(0))
        .map_err(error)?;
    if count != ids.len() as i64 {
        return Err("Migration count mismatch.".into());
    }
    let integrity: String = check
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(error)?;
    if integrity != "ok" {
        return Err("Vault integrity check failed. Legacy files are unchanged.".into());
    }
    drop(check);
    std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(&stage)
        .and_then(|f| f.sync_all())
        .map_err(error)?;
    std::fs::rename(stage, &dest).map_err(error)?;
    std::fs::write(dest.with_extension("active"), b"Coucou encrypted vault v1").map_err(error)?;
    status()
}
#[cfg(test)]
fn build_migration(file: &Path, secret: &str, items: &[Project]) -> Result<(), String> {
    let mut db = connect(file, secret, true)?;
    schema(&db)?;
    let tx = db.transaction().map_err(error)?;
    for p in items {
        write(&tx, p)?;
    }
    tx.execute("INSERT INTO meta VALUES('schema','1')", [])
        .map_err(error)?;
    tx.commit().map_err(error)
}
#[derive(Serialize)]
pub struct Version {
    pub seq: i64,
    pub updated: i64,
}
pub fn versions(id: &str) -> Result<Vec<Version>, String> {
    let db = open()?;
    let mut stmt = db
        .prepare("SELECT seq,updated FROM versions WHERE id=?1 ORDER BY seq DESC LIMIT 20")
        .map_err(error)?;
    let result = stmt
        .query_map([id], |r| {
            Ok(Version {
                seq: r.get(0)?,
                updated: r.get(1)?,
            })
        })
        .map_err(error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(error)?;
    Ok(result)
}
pub fn version(id: &str, seq: i64) -> Result<Project, String> {
    let db = open()?;
    let json: String = db
        .query_row(
            "SELECT json FROM versions WHERE id=?1 AND seq=?2",
            params![id, seq],
            |r| r.get(0),
        )
        .map_err(|_| "Snapshot is no longer available.".to_string())?;
    let p: Project = serde_json::from_str(&json).map_err(error)?;
    validate(&p)?;
    if p.id != id {
        return Err("Snapshot identity mismatch.".into());
    }
    Ok(p)
}
pub fn recovery_key() -> Result<String, String> {
    let _ = open()?;
    key(false)
}
pub fn recover(secret: &str) -> Result<(), String> {
    let db = connect(&path(), secret, false)?;
    let version: String = db
        .query_row("SELECT value FROM meta WHERE key='schema'", [], |r| {
            r.get(0)
        })
        .map_err(error)?;
    if version != "1" {
        return Err("Recovery pack does not match this vault.".into());
    }
    credential()?.set_password(secret).map_err(error)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn project() -> Project {
        Project {
            id: "a".repeat(64),
            name: "Secret title".into(),
            title: "Title".into(),
            question: "".into(),
            draft: "private-token-74328 café reading".into(),
            history: vec![],
            sources: vec![],
            memory: "".into(),
            model: "fast".into(),
        }
    }
    #[test]
    fn snapshots_coalesce_and_keep_twenty() {
        let file = std::env::temp_dir().join(format!(
            "coucou-vault-versions-{}.db",
            random_key().unwrap()
        ));
        let db = connect(&file, &random_key().unwrap(), true).unwrap();
        schema(&db).unwrap();
        let mut p = project();
        for i in 0..50 {
            p.draft = format!("Draft {i}");
            write_at(&db, &p, i * 30_000).unwrap();
        }
        let count: i64 = db
            .query_row("SELECT count(*) FROM versions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 20);
        let latest: String = db
            .query_row(
                "SELECT json FROM versions ORDER BY seq DESC LIMIT 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(latest.contains("Draft 49"));
        drop(db);
        std::fs::remove_file(file).unwrap();
    }
    #[test]
    fn encrypted_roundtrip_fts_wrong_key_and_transaction() {
        let file =
            std::env::temp_dir().join(format!("coucou-vault-test-{}.db", random_key().unwrap()));
        let secret = random_key().unwrap();
        let p = project();
        build_migration(&file, &secret, &[p.clone()]).unwrap();
        let mut db = connect(&file, &secret, false).unwrap();
        assert_eq!(
            db.query_row(
                "SELECT count(*) FROM project_search WHERE project_search MATCH 'café'",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
        {
            let tx = db.transaction().unwrap();
            let mut bad = p.clone();
            bad.id = "b".repeat(64);
            write(&tx, &bad).unwrap();
        }
        assert_eq!(
            db.query_row("SELECT count(*) FROM projects", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        drop(db);
        assert!(connect(&file, &random_key().unwrap(), false).is_err());
        let bytes = std::fs::read(&file).unwrap();
        assert!(!bytes.starts_with(b"SQLite format 3"));
        assert!(!bytes
            .windows(b"private-token-74328 ".len())
            .any(|b| b == b"private-token-74328 "));
        std::fs::remove_file(file).unwrap();
    }
    #[test]
    #[ignore = "Requires an isolated Coucou data directory and OS credential store"]
    fn legacy_migration_key_recovery_and_restore() {
        let requested =
            std::env::var("COUCOU_VAULT_TEST_DIR").expect("Set an isolated test directory");
        assert_eq!(std::env::var("LOCALAPPDATA").unwrap(), requested);
        assert!(requested.contains("vault-check-"));
        assert!(!settings::local_dir().exists());
        let store = crate::projects::Store::default();
        let p = project();
        store.save(p.clone()).unwrap();
        let legacy = std::fs::read_dir(settings::local_dir().join("projects"))
            .unwrap()
            .map(|e| e.unwrap().path())
            .collect::<Vec<_>>();
        let before = legacy
            .iter()
            .map(|p| std::fs::read(p).unwrap())
            .collect::<Vec<_>>();
        let status = store.enable_vault().unwrap();
        assert!(status.encrypted);
        assert_eq!(status.projects, 1);
        assert_eq!(load(&p.id).unwrap().draft, p.draft);
        assert_eq!(list("café").unwrap().len(), 1);
        for (path, bytes) in legacy.iter().zip(before) {
            assert_eq!(std::fs::read(path).unwrap(), bytes);
        }
        let secret = recovery_key().unwrap();
        credential().unwrap().delete_credential().unwrap();
        assert!(load(&p.id).is_err());
        assert!(save(&p).is_err());
        recover(&secret).unwrap();
        assert_eq!(load(&p.id).unwrap().draft, p.draft);
        let saved = versions(&p.id).unwrap();
        let mut restored = version(&p.id, saved[0].seq).unwrap();
        restored.id = random_key().unwrap();
        store.save(restored).unwrap();
        assert_eq!(list("").unwrap().len(), 2);
        let db = path();
        let moved = db.with_extension("test-recovery");
        std::fs::rename(&db, &moved).unwrap();
        assert!(enabled());
        assert!(load(&p.id).is_err());
        std::fs::rename(moved, db).unwrap();
        credential().unwrap().delete_credential().unwrap();
    }
}
