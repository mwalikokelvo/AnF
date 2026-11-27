//! Thin bridge to the shared AnF vault domain crate.
//! Host storage (SQLCipher) stays in `vault.rs`. Not ThingsBook / `_core`.
use anf_vault::{
    related::{
        compute_note_reading_stats, evaluate_vault_word_goal, extract_note_outline,
        extract_vault_tags, find_broken_wiki_links, find_note_backlinks, find_stub_notes,
        related_notes, summarize_vault_notes, BrokenWikiLink, NoteBacklink, NoteInput,
        NoteOutlineHeading, NoteReadingStats, RelatedNote, StubNoteEntry, VaultHealthSummary,
        VaultTagCount, VaultWordGoalProgress,
    },
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

/// Find backlinks referencing a target note by title, `[[wiki-link]]`, or ID.
#[tauri::command(rename_all = "camelCase")]
pub fn workspace_note_backlinks(
    target_id: String,
    target_title: String,
    notes: Vec<NoteInput>,
) -> Vec<NoteBacklink> {
    find_note_backlinks(&target_id, &target_title, &notes)
}

/// Extract `#hashtag` counts across vault notes on-device.
#[tauri::command]
pub fn workspace_vault_tags(notes: Vec<NoteInput>) -> Vec<VaultTagCount> {
    extract_vault_tags(&notes)
}

/// Report unresolved `[[wiki-link]]` references across vault notes.
#[tauri::command]
pub fn workspace_broken_wiki_links(notes: Vec<NoteInput>) -> Vec<BrokenWikiLink> {
    find_broken_wiki_links(&notes)
}

/// Compute reading time, word count, heading count, and wiki-link count for a note.
#[tauri::command(rename_all = "camelCase")]
pub fn workspace_note_reading_stats(note: NoteInput, wpm: Option<u32>) -> NoteReadingStats {
    compute_note_reading_stats(&note, wpm.unwrap_or(220))
}

/// Extract Markdown heading outline for a single note on-device.
#[tauri::command]
pub fn workspace_note_outline(note: NoteInput) -> Vec<NoteOutlineHeading> {
    extract_note_outline(&note)
}

/// Find stub or empty notes with fewer than `min_words` words on-device.
#[tauri::command(rename_all = "camelCase")]
pub fn workspace_stub_notes(notes: Vec<NoteInput>, min_words: Option<usize>) -> Vec<StubNoteEntry> {
    find_stub_notes(&notes, min_words.unwrap_or(15))
}

/// Evaluate vault word count against a target word goal on-device.
#[tauri::command(rename_all = "camelCase")]
pub fn workspace_vault_word_goal(
    notes: Vec<NoteInput>,
    target_words: Option<usize>,
) -> VaultWordGoalProgress {
    evaluate_vault_word_goal(&notes, target_words.unwrap_or(1000))
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
