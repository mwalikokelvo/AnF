//! Build a deterministic AnF vault v1 SQLCipher fixture.
//! AnF only — do not use ThingsBook / `_core`.
use rusqlite::{params, Connection};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{env, fs, path::PathBuf};

const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PROJECT_ID: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

#[derive(Serialize)]
struct Part {
    text: String,
}
#[derive(Serialize)]
struct Turn {
    role: String,
    content: Vec<Part>,
}
#[derive(Serialize)]
struct Source {
    name: String,
    text: String,
    path: Option<String>,
    pages: Vec<()>,
}
#[derive(Serialize)]
struct Project {
    id: String,
    name: String,
    title: String,
    question: String,
    draft: String,
    history: Vec<Turn>,
    sources: Vec<Source>,
    memory: String,
    model: String,
}

fn main() -> Result<(), String> {
    let out = env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("contracts/fixtures/vault-v1-fixture.db"));
    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if out.exists() {
        fs::remove_file(&out).map_err(|e| e.to_string())?;
    }

    let db = Connection::open(&out).map_err(|e| e.to_string())?;
    db.execute_batch(&format!(
        "PRAGMA key=\"x'{KEY}'\"; PRAGMA temp_store=MEMORY; PRAGMA foreign_keys=ON;"
    ))
    .map_err(|e| format!("SQLCipher unlock failed: {e}"))?;
    db.execute_batch(
        "CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
         CREATE TABLE projects(id TEXT PRIMARY KEY,json TEXT NOT NULL,updated INTEGER NOT NULL);
         CREATE TABLE versions(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL,json TEXT NOT NULL,updated INTEGER NOT NULL);
         CREATE INDEX versions_id ON versions(id,seq);
         CREATE VIRTUAL TABLE project_search USING fts5(id UNINDEXED,title,body,tokenize='unicode61');
         INSERT INTO meta VALUES('schema','1');",
    )
    .map_err(|e| e.to_string())?;

    let project = Project {
        id: PROJECT_ID.into(),
        name: "Phase 3 fixture".into(),
        title: "Fixture title".into(),
        question: "What is the vault schema version?".into(),
        draft: "Local draft text for contract tests.".into(),
        history: vec![
            Turn {
                role: "user".into(),
                content: vec![Part {
                    text: "Hello from the fixture.".into(),
                }],
            },
            Turn {
                role: "assistant".into(),
                content: vec![Part {
                    text: "Schema is 1.".into(),
                }],
            },
        ],
        sources: vec![Source {
            name: "note.txt".into(),
            text: "Short source text.".into(),
            path: None,
            pages: vec![],
        }],
        memory: "".into(),
        model: "fast".into(),
    };
    let json = serde_json::to_string(&project).map_err(|e| e.to_string())?;
    let updated: i64 = 1_724_000_000_000;
    db.execute(
        "INSERT INTO projects(id,json,updated) VALUES(?1,?2,?3)",
        params![PROJECT_ID, json, updated],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO versions(id,json,updated) VALUES(?1,?2,?3)",
        params![PROJECT_ID, json, updated],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO project_search(id,title,body) VALUES(?1,?2,?3)",
        params![PROJECT_ID, project.name, format!("{} {}", project.draft, project.question)],
    )
    .map_err(|e| e.to_string())?;

    drop(db);
    let bytes = fs::read(&out).map_err(|e| e.to_string())?;
    if bytes.starts_with(b"SQLite format 3") {
        return Err("Fixture is not encrypted (plain SQLite header).".into());
    }
    if bytes
        .windows(b"Local draft text".len())
        .any(|w| w == b"Local draft text")
    {
        return Err("Plaintext draft visible in fixture bytes.".into());
    }

    let db = Connection::open(&out).map_err(|e| e.to_string())?;
    db.execute_batch(&format!("PRAGMA key=\"x'{KEY}'\";"))
        .map_err(|e| e.to_string())?;
    let schema: String = db
        .query_row("SELECT value FROM meta WHERE key='schema'", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if schema != "1" {
        return Err(format!("schema={schema}"));
    }
    let loaded: String = db
        .query_row(
            "SELECT json FROM projects WHERE id=?1",
            params![PROJECT_ID],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !loaded.contains("Phase 3 fixture") {
        return Err("round-trip read failed".into());
    }

    let digest = format!("{:x}", Sha256::digest(&bytes));
    let meta = format!(
        "AnF vault fixture v1\n\
         file: {}\n\
         schema: 1\n\
         key (test only): {}\n\
         project_id: {}\n\
         sha256: {}\n\
         recovery: the key above is the recovery secret for this fixture only.\n\
         scope: AnF only. Not ThingsBook. Not for production keys.\n",
        out.display(),
        KEY,
        PROJECT_ID,
        digest
    );
    let meta_path = out.with_extension("db.txt");
    fs::write(&meta_path, meta).map_err(|e| e.to_string())?;
    println!("wrote {}", out.display());
    println!("wrote {}", meta_path.display());
    println!("sha256 {digest}");
    Ok(())
}
