use anf_vault::related::{related_notes, summarize_vault_notes, NoteInput};
use std::time::Instant;

#[test]
fn thousand_note_corpus_ranks_and_summarizes_fast() {
    let source = NoteInput {
        id: "src".into(),
        title: "Rust Audio Engine".into(),
        text: "silence trimming crossfade loudness lufs".into(),
    };
    let notes: Vec<NoteInput> = (0..1000)
        .map(|i| NoteInput {
            id: format!("n-{i}"),
            title: format!("Note {i}"),
            text: if i % 50 == 0 {
                "rust audio silence crossfade".into()
            } else {
                format!("unrelated topic number {i}")
            },
        })
        .collect();
    let started = Instant::now();
    let ranked = related_notes(&source, &notes, 10);
    let summary = summarize_vault_notes(&notes);
    assert_eq!(ranked.len(), 10);
    assert_eq!(summary.total_notes, 1000);
    assert!(started.elapsed().as_secs_f64() < 1.0);
}
