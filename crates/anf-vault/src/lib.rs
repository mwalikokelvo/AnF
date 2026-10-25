//! AnF vault domain (shared).
//!
//! This crate holds the portable rules for projects, schema identity, and sync
//! revisions. Host-specific SQLCipher and keyring stay in the Windows and
//! Android hosts until a later step wires storage through this API.
//!
//! **Not ThingsBook.** Do not depend on `_core`.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Vault `meta.schema` value for contract v1.
pub const SCHEMA_VERSION: &str = "1";

/// SQL used to create an empty vault schema v1 (hosts may run this on SQLCipher).
pub const SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,json TEXT NOT NULL,updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS versions(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL,json TEXT NOT NULL,updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS versions_id ON versions(id,seq);
CREATE VIRTUAL TABLE IF NOT EXISTS project_search USING fts5(id UNINDEXED,title,body,tokenize='unicode61');
"#;

/// Max version rows kept per project.
pub const MAX_VERSIONS_PER_PROJECT: usize = 20;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Part {
    pub text: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Turn {
    pub role: String,
    pub content: Vec<Part>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Source {
    pub name: String,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(default)]
    pub pages: Vec<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reading: Option<serde_json::Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub title: String,
    pub question: String,
    pub draft: String,
    pub history: Vec<Turn>,
    pub sources: Vec<Source>,
    pub memory: String,
    pub model: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Snapshot {
    pub project: Project,
    pub revision: String,
}

pub fn id_valid(id: &str) -> bool {
    id.len() == 64 && id.bytes().all(|b| b.is_ascii_hexdigit())
}

/// Validate project shape and limits (vault contract v1 + host rules).
pub fn validate(p: &Project) -> Result<(), String> {
    if !id_valid(&p.id)
        || p.name.len() > 160
        || p.title.len() > 300
        || p.question.len() > 10_000
        || p.draft.len() > 200_000
        || p.memory.len() > 12_000
        || !matches!(p.model.as_str(), "fast" | "balanced")
        || p.history.len() > 1000
        || p.sources.len() > 4
    {
        return Err(
            "Project is too large or invalid. Start a new project and keep the old one saved."
                .into(),
        );
    }
    if p.history.iter().any(|t| {
        !matches!(t.role.as_str(), "user" | "assistant")
            || t.content.len() != 1
            || t.content[0].text.len() > 200_000
    }) || p.sources.iter().any(|s| s.text.len() > 2_000_000 || s.name.len() > 2000)
    {
        return Err("Project contains invalid conversation or sources.".into());
    }
    Ok(())
}

/// Clean project for sync hashing / wire (sync contract v1).
pub fn clean(mut p: Project, documents: bool) -> Project {
    if !documents {
        p.sources.clear();
    } else {
        for source in &mut p.sources {
            source.path = None;
        }
    }
    p
}

pub fn revision(p: &Project, documents: bool) -> String {
    let cleaned = clean(p.clone(), documents);
    let bytes = serde_json::to_vec(&cleaned).expect("project serializes");
    format!("{:x}", Sha256::digest(bytes))
}

pub fn snapshot(p: Project, documents: bool) -> Snapshot {
    let revision = revision(&p, documents);
    Snapshot {
        project: clean(p, documents),
        revision,
    }
}

pub fn conflict_id(id: &str, revision: &str) -> String {
    format!(
        "{:x}",
        Sha256::digest(format!("coucou-conflict-v1|{id}|{revision}"))
    )
}

pub fn conflict_name(name: &str) -> String {
    let mut s = String::new();
    for c in name.chars() {
        if s.len() + c.len_utf8() > 125 {
            break;
        }
        s.push(c);
    }
    s + " (conflict copy)"
}

/// Bridge operation names (vault-bridge-v1). Hosts implement these.
pub mod ops {
    pub const STATUS: &str = "status";
    pub const BEGIN: &str = "begin";
    pub const COMMIT: &str = "commit";
    pub const PUT: &str = "put";
    pub const GET: &str = "get";
    pub const LIST: &str = "list";
    pub const VERSIONS: &str = "versions";
    pub const VERSION: &str = "version";
    pub const MIGRATION_PUT: &str = "migration_put";
    pub const MIGRATION_GET: &str = "migration_get";
    pub const RECOVERY: &str = "recovery";
    pub const RECOVER: &str = "recover";
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Project {
        Project {
            id: "a".repeat(64),
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
                path: Some("/tmp/secret".into()),
                pages: vec![],
                reading: None,
            }],
            memory: "".into(),
            model: "fast".into(),
        }
    }

    #[test]
    fn validates_sample() {
        validate(&sample()).unwrap();
    }

    #[test]
    fn clean_strips_paths_and_optional_sources() {
        let p = sample();
        let with_docs = clean(p.clone(), true);
        assert!(with_docs.sources[0].path.is_none());
        let no_docs = clean(p, false);
        assert!(no_docs.sources.is_empty());
    }

    #[test]
    fn revision_stable() {
        let p = sample();
        assert_eq!(revision(&p, true), revision(&p, true));
        assert_ne!(revision(&p, true), revision(&p, false));
    }

    #[test]
    fn conflict_helpers() {
        assert!(conflict_name(&"🙂".repeat(100)).len() <= 160);
        assert_eq!(conflict_id("a", "b"), conflict_id("a", "b"));
        assert_ne!(conflict_id("a", "b"), conflict_id("a", "c"));
    }

    #[test]
    fn schema_constant() {
        assert_eq!(SCHEMA_VERSION, "1");
        assert!(SCHEMA_SQL.contains("CREATE TABLE IF NOT EXISTS projects"));
    }
}
