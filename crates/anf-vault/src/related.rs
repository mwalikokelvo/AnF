//! Local related-notes ranking (port of the earlier TypeScript prototype into the shared core).
//! No network, no model: term frequency weighted by inverse document frequency, cosine similarity.
//! Keeps single-character CJK terms, which are words in Chinese/Japanese/Korean notes.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A note supplied by the host for ranking. Text is title/question/memory joined by the caller.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct NoteInput {
    pub id: String,
    pub title: String,
    pub text: String,
}

/// A ranked result returned to the frontend.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct RelatedNote {
    pub id: String,
    pub title: String,
    pub score: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VaultHealthSummary {
    pub total_notes: usize,
    pub total_words: usize,
    pub empty_notes: usize,
    pub distinct_terms: usize,
}

/// Summarize note corpus health on-device (counts, word totals, empty notes, distinct vocabulary).
pub fn summarize_vault_notes(notes: &[NoteInput]) -> VaultHealthSummary {
    let mut total_words = 0usize;
    let mut empty_notes = 0usize;
    let mut vocab = std::collections::HashSet::new();
    for note in notes {
        let wc = note.text.split_whitespace().count();
        total_words += wc;
        if wc == 0 && note.title.trim().is_empty() {
            empty_notes += 1;
        }
        for term in note_terms(&format!("{} {}", note.title, note.text)) {
            vocab.insert(term);
        }
    }
    VaultHealthSummary {
        total_notes: notes.len(),
        total_words,
        empty_notes,
        distinct_terms: vocab.len(),
    }
}

const STOP: &[&str] = &[
    "the", "and", "for", "with", "that", "this", "from", "are", "was", "were", "have", "has",
    "had", "you", "your", "our", "but", "not", "into", "its", "it", "of", "to", "in", "on", "at",
    "by", "as", "is", "be", "or", "an", "a",
];

/// Lowercase word tokens; a single CJK character is a word and is kept.
pub fn note_terms(text: &str) -> Vec<String> {
    let mut current = String::new();
    let mut out = Vec::new();
    for ch in text.chars() {
        if ch.is_alphanumeric() {
            for lower in ch.to_lowercase() {
                current.push(lower);
            }
        } else if !current.is_empty() {
            push_term(&mut out, &current);
            current.clear();
        }
    }
    if !current.is_empty() {
        push_term(&mut out, &current);
    }
    out
}

fn push_term(out: &mut Vec<String>, term: &str) {
    let cjk = term.chars().any(|c| matches!(c as u32,
        0x3040..=0x30ff | 0x3400..=0x4dbf | 0x4e00..=0x9fff | 0xac00..=0xd7af));
    if (term.chars().count() > 1 || cjk) && !STOP.contains(&term) {
        out.push(term.to_string());
    }
}

fn vector(note: &NoteInput) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    let text = format!("{} {} {}", note.title, note.title, note.text);
    for term in note_terms(&text) {
        *counts.entry(term).or_insert(0) += 1;
    }
    counts
}

/// Rank other notes by IDF-weighted cosine similarity. Highest score first; ties break by title.
pub fn related_notes(source: &NoteInput, notes: &[NoteInput], limit: usize) -> Vec<RelatedNote> {
    let cap = limit.clamp(1, 20);
    let mut docs = Vec::with_capacity(notes.len() + 1);
    docs.push(source.clone());
    docs.extend_from_slice(notes);
    let mut df: HashMap<String, usize> = HashMap::new();
    for doc in &docs {
        for term in note_terms(&format!("{} {}", doc.title, doc.text)) {
            df.entry(term).or_insert(0);
        }
    }
    // A document contributes once per distinct term (set semantics), like the prototype.
    for doc in &docs {
        let mut seen = std::collections::HashSet::new();
        for term in note_terms(&format!("{} {}", doc.title, doc.text)) {
            seen.insert(term);
        }
        for term in seen {
            *df.entry(term).or_insert(0) += 1;
        }
    }
    let idf = |term: &str| ((1 + docs.len()) as f64 / (1 + df.get(term).copied().unwrap_or(0)) as f64).ln() + 1.0;

    let source_vector = vector(source);
    let mut norm = 0.0;
    for (term, count) in &source_vector {
        let weight = *count as f64 * idf(term);
        norm += weight * weight;
    }
    if norm == 0.0 {
        return Vec::new();
    }
    let norm = norm.sqrt();

    let mut found: Vec<RelatedNote> = notes
        .iter()
        .filter(|note| !note.id.is_empty() && note.id != source.id)
        .filter_map(|note| {
            let other = vector(note);
            let mut dot = 0.0;
            let mut other_norm = 0.0;
            for (term, count) in &other {
                let weight = *count as f64 * idf(term);
                other_norm += weight * weight;
                if let Some(source_count) = source_vector.get(term) {
                    dot += *source_count as f64 * idf(term) * weight;
                }
            }
            if other_norm == 0.0 || dot <= 0.0 {
                return None;
            }
            Some(RelatedNote {
                id: note.id.clone(),
                title: note.title.clone(),
                score: dot / (norm * other_norm.sqrt()),
            })
        })
        .collect();
    found.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal)
        .then_with(|| a.title.cmp(&b.title)));
    found.truncate(cap);
    found
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NoteBacklink {
    pub id: String,
    pub title: String,
    pub snippet: String,
}

/// Find notes referencing `target_title` (or `[[target_title]]`) or `target_id` in their body, excluding self.
pub fn find_note_backlinks(
    target_id: &str,
    target_title: &str,
    notes: &[NoteInput],
) -> Vec<NoteBacklink> {
    let clean_title = target_title.trim();
    let title_lower = clean_title.to_lowercase();
    let wiki_lower = if clean_title.is_empty() {
        String::new()
    } else {
        format!("[[{title_lower}]]")
    };
    let mut out = Vec::new();
    for note in notes {
        if note.id == target_id || note.id.trim().is_empty() {
            continue;
        }
        let body_lower = note.text.to_lowercase();
        let matched = (!wiki_lower.is_empty() && body_lower.contains(&wiki_lower))
            || (title_lower.len() >= 3 && body_lower.contains(&title_lower))
            || (!target_id.trim().is_empty() && note.text.contains(target_id));
        if matched {
            let snippet: String = note.text.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(120).collect();
            out.push(NoteBacklink {
                id: note.id.clone(),
                title: note.title.clone(),
                snippet,
            });
        }
    }
    out.sort_by(|a, b| a.title.cmp(&b.title).then_with(|| a.id.cmp(&b.id)));
    out
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VaultTagCount {
    pub tag: String,
    pub count: usize,
    pub note_ids: Vec<String>,
}

/// Extract `#hashtag` tokens across vault notes, grouped and sorted by frequency.
pub fn extract_vault_tags(notes: &[NoteInput]) -> Vec<VaultTagCount> {
    let mut map: std::collections::BTreeMap<String, Vec<String>> = std::collections::BTreeMap::new();
    for note in notes {
        if note.id.trim().is_empty() {
            continue;
        }
        let mut seen_in_note = std::collections::HashSet::new();
        for token in note.text.split_whitespace() {
            let trimmed = token.trim_matches(|c: char| !c.is_alphanumeric() && c != '#' && c != '_' && c != '-');
            if let Some(rest) = trimmed.strip_prefix('#') {
                let clean = rest.trim_end_matches(|c: char| !c.is_alphanumeric() && c != '_' && c != '-');
                if clean.len() < 2 || clean.chars().all(|c| c.is_ascii_hexdigit()) && clean.len() == 6 {
                    continue;
                }
                if !clean.chars().next().is_some_and(|c| c.is_alphabetic()) {
                    continue;
                }
                let tag = clean.to_lowercase();
                if seen_in_note.insert(tag.clone()) {
                    map.entry(tag).or_default().push(note.id.clone());
                }
            }
        }
    }
    let mut out: Vec<VaultTagCount> = map
        .into_iter()
        .map(|(tag, note_ids)| VaultTagCount {
            tag,
            count: note_ids.len(),
            note_ids,
        })
        .collect();
    out.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.tag.cmp(&b.tag)));
    out
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BrokenWikiLink {
    pub source_id: String,
    pub source_title: String,
    pub target: String,
}

/// Find `[[wiki-link]]` targets in notes that do not resolve to any existing note title or ID.
pub fn find_broken_wiki_links(notes: &[NoteInput]) -> Vec<BrokenWikiLink> {
    let mut known: std::collections::HashSet<String> = std::collections::HashSet::new();
    for note in notes {
        let id = note.id.trim().to_lowercase();
        if !id.is_empty() {
            known.insert(id);
        }
        let title = note.title.trim().to_lowercase();
        if !title.is_empty() {
            known.insert(title);
        }
    }
    let mut broken = Vec::new();
    for note in notes {
        let mut rest = note.text.as_str();
        while let Some(start) = rest.find("[[") {
            let after = &rest[start + 2..];
            if let Some(end) = after.find("]]") {
                let raw_target = after[..end].split('|').next().unwrap_or("").trim();
                if !raw_target.is_empty() && !known.contains(&raw_target.to_lowercase()) {
                    broken.push(BrokenWikiLink {
                        source_id: note.id.clone(),
                        source_title: note.title.clone(),
                        target: raw_target.to_string(),
                    });
                }
                rest = &after[end + 2..];
            } else {
                break;
            }
        }
    }
    broken.sort_by(|a, b| a.source_title.cmp(&b.source_title).then_with(|| a.target.cmp(&b.target)));
    broken
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NoteReadingStats {
    pub id: String,
    pub word_count: usize,
    pub reading_minutes: u32,
    pub heading_count: usize,
    pub link_count: usize,
}

/// Compute word count, estimated reading minutes, Markdown heading count, and `[[wiki-link]]` count for a note.
pub fn compute_note_reading_stats(note: &NoteInput, wpm: u32) -> NoteReadingStats {
    let rate = wpm.clamp(60, 1000) as usize;
    let word_count = note.text.split_whitespace().count();
    let reading_minutes = if word_count == 0 {
        0
    } else {
        word_count.div_ceil(rate) as u32
    };
    let heading_count = note
        .text
        .lines()
        .filter(|line| line.trim_start().starts_with('#'))
        .count();
    let mut link_count = 0usize;
    let mut rest = note.text.as_str();
    while let Some(start) = rest.find("[[") {
        let after = &rest[start + 2..];
        if let Some(end) = after.find("]]") {
            if !after[..end].trim().is_empty() {
                link_count += 1;
            }
            rest = &after[end + 2..];
        } else {
            break;
        }
    }
    NoteReadingStats {
        id: note.id.clone(),
        word_count,
        reading_minutes,
        heading_count,
        link_count,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(id: &str, title: &str, text: &str) -> NoteInput {
        NoteInput { id: id.into(), title: title.into(), text: text.into() }
    }

    #[test]
    fn keeps_unicode_words_and_drops_stop_words() {
        let terms = note_terms("The café and the rain — 雨 42");
        assert!(terms.contains(&"café".to_string()));
        assert!(terms.contains(&"雨".to_string()));
        assert!(terms.contains(&"42".to_string()));
        assert!(!terms.contains(&"the".to_string()));
        assert!(!terms.contains(&"and".to_string()));
    }

    #[test]
    fn ranks_by_shared_distinctive_terms() {
        let source = note("a", "Gardens in spring", "pruning roses and soil with compost");
        let notes = vec![
            note("b", "Rose pruning", "pruning roses with sharp shears"),
            note("c", "Ocean tides", "waves and salt water at the shore"),
            note("d", "Compost and soil", "soil fertility from compost heaps"),
        ];
        let found = related_notes(&source, &notes, 5);
        assert_eq!(found.len(), 2);
        assert!(found[0].id == "b" || found[0].id == "d");
        assert!(found.windows(2).all(|w| w[0].score >= w[1].score));
    }

    #[test]
    fn common_words_do_not_win() {
        let source = note("a", "Notes about the", "the and with for are in on at by");
        let notes = vec![note("b", "The and with", "the and with for are in on at by")];
        assert!(related_notes(&source, &notes, 5).is_empty());
    }

    #[test]
    fn bounded_deterministic_and_never_self() {
        let source = note("a", "Dune", "desert spice dunes and paul atreides");
        let notes: Vec<NoteInput> = (0..12)
            .map(|i| note(&format!("n{i}"), &format!("Dune {i}"), "desert spice dunes"))
            .collect();
        let first = related_notes(&source, &notes, 4);
        assert_eq!(first.len(), 4);
        assert_eq!(first, related_notes(&source, &notes, 4));
        assert_eq!(related_notes(&source, &notes, 999).len(), 12);
        assert!(!first.iter().any(|r| r.id == "a"));
    }

    #[test]
    fn empty_and_malformed_input_is_safe() {
        assert!(related_notes(&note("a", "", ""), &[note("b", "text", "words")], 5).is_empty());
        assert!(related_notes(&note("a", "hello", "world"), &[], 5).is_empty());
        let notes = vec![note("", "no id", "hello world"), note("b", "plain", "hello world")];
        let found = related_notes(&note("a", "hello", "world"), &notes, 5);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].id, "b");
    }

    #[test]
    fn summarizes_vault_health_counts() {
        let notes = vec![
            note("1", "Alpha", "rust audio engine"),
            note("2", "", ""),
        ];
        let summary = summarize_vault_notes(&notes);
        assert_eq!(summary.total_notes, 2);
        assert_eq!(summary.total_words, 3);
        assert_eq!(summary.empty_notes, 1);
        assert!(summary.distinct_terms >= 4);
    }

    #[test]
    fn find_note_backlinks_matches_wiki_links_and_excludes_self() {
        let notes = vec![
            note("n1", "Rust Audio", "Self mention [[Rust Audio]]"),
            note("n2", "DSP Notes", "See [[Rust Audio]] for LUFS details"),
            note("n3", "Cooking", "Tomato soup recipe"),
        ];
        let links = find_note_backlinks("n1", "Rust Audio", &notes);
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].id, "n2");
        assert!(links[0].snippet.contains("LUFS"));
    }

    #[test]
    fn extract_vault_tags_groups_hashtags_and_ignores_hex_colors() {
        let notes = vec![
            note("n1", "A", "Working on #Rust and #Audio with color #ff00aa"),
            note("n2", "B", "More #rust tips and #12345"),
        ];
        let tags = extract_vault_tags(&notes);
        assert_eq!(tags.len(), 2);
        assert_eq!(tags[0].tag, "rust");
        assert_eq!(tags[0].count, 2);
        assert_eq!(tags[1].tag, "audio");
    }

    #[test]
    fn find_broken_wiki_links_reports_unresolved_targets() {
        let notes = vec![
            note("n1", "Index", "See [[Existing]] and [[Missing Note|alias]]"),
            note("n2", "Existing", "Valid target"),
        ];
        let broken = find_broken_wiki_links(&notes);
        assert_eq!(broken.len(), 1);
        assert_eq!(broken[0].source_id, "n1");
        assert_eq!(broken[0].target, "Missing Note");
    }

    #[test]
    fn compute_note_reading_stats_counts_words_headings_and_links() {
        let n = note("n1", "Title", "# Heading\nBody with [[Link One]] and [[Link Two]].");
        let stats = compute_note_reading_stats(&n, 200);
        assert_eq!(stats.word_count, 9);
        assert_eq!(stats.reading_minutes, 1);
        assert_eq!(stats.heading_count, 1);
        assert_eq!(stats.link_count, 2);
    }
}
