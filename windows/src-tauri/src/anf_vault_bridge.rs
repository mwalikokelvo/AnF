//! Thin bridge to the shared AnF vault domain crate.
//! Host storage (SQLCipher) stays in `vault.rs`. Not ThingsBook / `_core`.
use anf_vault::{
    related::{related_notes, summarize_vault_notes, NoteInput, RelatedNote, VaultHealthSummary},
    MAX_VERSIONS_PER_PROJECT, SCHEMA_SQL, SCHEMA_VERSION,
};

#[allow(dead_code)]
pub fn schema_version() -> &'static str {
    SCHEMA_VERSION
}

#[allow(dead_code)]
pub fn schema_sql() -> &'static str {
    SCHEMA_SQL
}

#[allow(dead_code)]
pub fn max_versions() -> usize {
    MAX_VERSIONS_PER_PROJECT
}

/// Operation names expected by the Android/Web bridge (vault-bridge-v1).
#[allow(dead_code, unused_imports)]
pub mod bridge_ops {
    pub use anf_vault::ops::*;
}

/// Rank related notes/projects on-device using IDF-weighted cosine similarity.
#[tauri::command]
pub fn workspace_related_notes(
    source: NoteInput,
    notes: Vec<NoteInput>,
    limit: Option<usize>,
) -> Vec<RelatedNote> {
    related_notes(&source, &notes, limit.unwrap_or(5))
}

/// Summarize vault note corpus health on-device.
#[tauri::command]
pub fn workspace_vault_health(notes: Vec<NoteInput>) -> VaultHealthSummary {
    summarize_vault_notes(&notes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use anf_vault::ops;
    #[test]
    fn schema_matches_contract() {
        assert_eq!(schema_version(), "1");
        assert!(schema_sql().contains("CREATE TABLE IF NOT EXISTS projects"));
        assert_eq!(max_versions(), 20);
        assert_eq!(ops::STATUS, "status");
        assert_eq!(ops::PUT, "put");
    }

    #[test]
    fn related_notes_command_ranks_relevant_notes() {
        let source = NoteInput {
            id: "a".into(),
            title: "Rust Audio".into(),
            text: "silence trimming and crossfade".into(),
        };
        let notes = vec![
            NoteInput {
                id: "b".into(),
                title: "Audio Studio".into(),
                text: "silence trimming in rust".into(),
            },
            NoteInput {
                id: "c".into(),
                title: "Grocery List".into(),
                text: "apples and milk".into(),
            },
        ];
        let ranked = workspace_related_notes(source, notes, Some(5));
        assert_eq!(ranked.len(), 1);
        assert_eq!(ranked[0].id, "b");
        let health = workspace_vault_health(vec![NoteInput { id: "x".into(), title: "T".into(), text: "one two".into() }]);
        assert_eq!(health.total_notes, 1);
        assert_eq!(health.total_words, 2);
    }
}
