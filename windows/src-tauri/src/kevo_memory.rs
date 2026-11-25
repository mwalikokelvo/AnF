//! Kevo persistent memory store (Phase 3 Step 3.1).
//! Stores structured facts and bounded conversation turn history in `settings::local_dir()/kevo/kevo-memory.json`.

use crate::{platform, settings};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_TURNS: usize = 50;
const MAX_FACTS: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct KevoFact {
    pub id: String,
    pub fact: String,
    pub category: String,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct KevoTurn {
    pub id: String,
    pub role: String,
    pub text: String,
    pub at: u64,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct KevoMemoryStore {
    #[serde(default)]
    pub facts: Vec<KevoFact>,
    #[serde(default)]
    pub turns: Vec<KevoTurn>,
}

static MEMORY_LOCK: Mutex<()> = Mutex::new(());
static BARGE_IN_EPOCH: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KevoRoutineStep {
    pub action: String,
    pub target: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KevoRoutinePlan {
    pub name: String,
    pub steps: Vec<KevoRoutineStep>,
    pub resolved_utterance: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KevoIntentMatch {
    pub intent: String,
    pub entity: Option<String>,
    pub confidence: f64,
}

fn levenshtein(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=b_chars.len()).collect();
    let mut curr = vec![0; b_chars.len() + 1];
    for (i, &ca) in a_chars.iter().enumerate() {
        curr[0] = i + 1;
        for (j, &cb) in b_chars.iter().enumerate() {
            let cost = usize::from(ca != cb);
            curr[j + 1] = (prev[j + 1] + 1).min(curr[j] + 1).min(prev[j] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[b_chars.len()]
}

/// Fuzzy-match a query against candidate entity names (case-insensitive, substring + Levenshtein).
pub fn fuzzy_match_entity(query: &str, candidates: &[String]) -> Option<(String, f64)> {
    let q = query.trim().to_lowercase();
    if q.is_empty() || candidates.is_empty() {
        return None;
    }
    let mut best: Option<(String, f64)> = None;
    for cand in candidates {
        let c = cand.trim();
        if c.is_empty() {
            continue;
        }
        let cl = c.to_lowercase();
        let score = if cl == q {
            1.0
        } else if cl.contains(&q) || q.contains(&cl) {
            0.88
        } else {
            let max_len = q.chars().count().max(cl.chars().count()).max(1);
            let dist = levenshtein(&q, &cl);
            1.0 - (dist as f64 / max_len as f64)
        };
        if score >= 0.52 && best.as_ref().is_none_or(|(_, b)| score > *b) {
            best = Some((c.to_string(), score));
        }
    }
    best
}

/// Deterministically classify offline voice intents with fuzzy entity resolution.
pub fn match_offline_intent(utterance: &str, candidates: &[String]) -> Option<KevoIntentMatch> {
    let lower = utterance.trim().to_lowercase();
    if lower.is_empty() {
        return None;
    }
    if lower.contains("pause") || lower.contains("paws") || lower.contains("stop music") {
        return Some(KevoIntentMatch { intent: "pause_music".into(), entity: None, confidence: 0.95 });
    }
    if lower.contains("next track") || lower.contains("next trak") || lower.contains("skip song") {
        return Some(KevoIntentMatch { intent: "next_track".into(), entity: None, confidence: 0.94 });
    }
    if lower.contains("previous track") || lower.contains("previous song") || lower.contains("go back a song") {
        return Some(KevoIntentMatch { intent: "previous_track".into(), entity: None, confidence: 0.94 });
    }
    if lower.contains("trim silence") {
        return Some(KevoIntentMatch { intent: "trim_silence".into(), entity: None, confidence: 0.93 });
    }
    if lower.contains("normalize") && (lower.contains("audio") || lower.contains("lufs")) {
        return Some(KevoIntentMatch { intent: "normalize_audio".into(), entity: None, confidence: 0.92 });
    }
    if let Some(rest) = lower.strip_prefix("open ").or_else(|| lower.strip_prefix("load ")) {
        let matched = fuzzy_match_entity(rest, candidates);
        let (entity, conf) = match matched {
            Some((name, score)) => (Some(name), score),
            None => (Some(rest.trim().to_string()), 0.7),
        };
        return Some(KevoIntentMatch { intent: "open_entity".into(), entity, confidence: conf });
    }
    if let Some((name, score)) = fuzzy_match_entity(&lower, candidates) {
        return Some(KevoIntentMatch { intent: "open_entity".into(), entity: Some(name), confidence: score });
    }
    None
}

#[tauri::command]
pub fn kevo_match_intent(utterance: String, candidates: Vec<String>) -> Option<KevoIntentMatch> {
    match_offline_intent(&utterance, &candidates)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KevoSelectionAction {
    pub action: String,
    pub prompt: String,
    pub selection_chars: usize,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VoiceTurnTiming {
    pub stt_ms: u64,
    pub intent_ms: u64,
    pub tts_ms: u64,
    pub total_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VoiceLatencyStats {
    pub sample_count: usize,
    pub p50_total_ms: u64,
    pub p95_total_ms: u64,
}

static VOICE_TIMINGS: Mutex<Vec<VoiceTurnTiming>> = Mutex::new(Vec::new());

/// Plan a bounded clipboard/selection-aware voice action without leaking oversized buffers.
pub fn plan_selection_action(utterance: &str, selection: &str) -> Result<KevoSelectionAction, String> {
    let trimmed_sel = selection.trim();
    if trimmed_sel.is_empty() {
        return Err("Select or copy text first.".into());
    }
    let max_chars = 6000;
    let total_chars = trimmed_sel.chars().count();
    let truncated = total_chars > max_chars;
    let bounded: String = trimmed_sel.chars().take(max_chars).collect();
    let lower = utterance.trim().to_lowercase();
    let (action, prefix) = if lower.contains("summarize") {
        ("summarize", "Summarize concisely:")
    } else if lower.contains("action item") || lower.contains("todo") {
        ("extract_actions", "Extract concrete action items:")
    } else if lower.contains("rewrite") || lower.contains("clarify") {
        ("rewrite", "Rewrite clearly while preserving meaning:")
    } else if lower.contains("read") && lower.contains("aloud") {
        ("read_aloud", "")
    } else {
        ("explain", "Explain:")
    };
    let prompt = if prefix.is_empty() {
        bounded
    } else {
        format!("{prefix}\n\n{bounded}")
    };
    Ok(KevoSelectionAction {
        action: action.into(),
        prompt,
        selection_chars: total_chars,
        truncated,
    })
}

pub fn record_timing(stt_ms: u64, intent_ms: u64, tts_ms: u64) -> VoiceLatencyStats {
    let total_ms = stt_ms.saturating_add(intent_ms).saturating_add(tts_ms);
    let mut guard = VOICE_TIMINGS.lock().unwrap_or_else(|e| e.into_inner());
    if guard.len() >= 200 {
        guard.remove(0);
    }
    guard.push(VoiceTurnTiming { stt_ms, intent_ms, tts_ms, total_ms });
    let mut totals: Vec<u64> = guard.iter().map(|t| t.total_ms).collect();
    totals.sort_unstable();
    let n = totals.len();
    let p50_total_ms = totals[n / 2];
    let p95_total_ms = totals[((n * 95) / 100).min(n - 1)];
    VoiceLatencyStats { sample_count: n, p50_total_ms, p95_total_ms }
}

#[tauri::command]
pub fn kevo_plan_selection_action(utterance: String, selection: String) -> Result<KevoSelectionAction, String> {
    plan_selection_action(&utterance, &selection)
}

#[tauri::command]
pub fn kevo_record_voice_timing(stt_ms: u64, intent_ms: u64, tts_ms: u64) -> VoiceLatencyStats {
    record_timing(stt_ms, intent_ms, tts_ms)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KevoPaletteCommand {
    pub id: &'static str,
    pub title: &'static str,
    pub category: &'static str,
    pub shortcut: &'static str,
    pub keywords: &'static str,
}

const PALETTE_COMMANDS: &[KevoPaletteCommand] = &[
    KevoPaletteCommand { id: "kevo.study_mode", title: "Activate Study Mode", category: "Voice", shortcut: "Ctrl+Shift+S", keywords: "focus timer pause music workspace" },
    KevoPaletteCommand { id: "kevo.wrap_up", title: "Wrap Up Session", category: "Voice", shortcut: "", keywords: "save project stop reading reset" },
    KevoPaletteCommand { id: "kevo.morning_briefing", title: "Morning Briefing", category: "Voice", shortcut: "", keywords: "reminders recap ambient" },
    KevoPaletteCommand { id: "kevo.barge_in", title: "Interrupt Kevo (Barge-In)", category: "Voice", shortcut: "Esc", keywords: "stop cancel speech" },
    KevoPaletteCommand { id: "audio.trim_silence", title: "Trim Leading/Trailing Silence", category: "Audio Studio", shortcut: "", keywords: "silence pcm wav" },
    KevoPaletteCommand { id: "audio.normalize_lufs", title: "Normalize Audio (-14 LUFS)", category: "Audio Studio", shortcut: "", keywords: "loudness gain spotify" },
    KevoPaletteCommand { id: "audio.undo_edit", title: "Undo Audio Region Edit", category: "Audio Studio", shortcut: "Ctrl+Z", keywords: "waveform undo" },
    KevoPaletteCommand { id: "audio.redo_edit", title: "Redo Audio Region Edit", category: "Audio Studio", shortcut: "Ctrl+Y", keywords: "waveform redo" },
    KevoPaletteCommand { id: "notes.related", title: "Find Related Notes", category: "Notes", shortcut: "", keywords: "similarity idf vault" },
];

pub fn search_palette_commands(query: &str) -> Vec<KevoPaletteCommand> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return PALETTE_COMMANDS.to_vec();
    }
    PALETTE_COMMANDS
        .iter()
        .filter(|c| {
            c.title.to_lowercase().contains(&q)
                || c.category.to_lowercase().contains(&q)
                || c.keywords.contains(&q)
        })
        .cloned()
        .collect()
}

#[tauri::command]
pub fn kevo_search_commands(query: Option<String>) -> Vec<KevoPaletteCommand> {
    search_palette_commands(query.as_deref().unwrap_or(""))
}

#[derive(Debug, Default)]
pub struct KevoConversationContext {
    pub last_file: Option<String>,
    pub last_note: Option<String>,
    pub last_track: Option<String>,
    pub last_book: Option<String>,
    pub last_any: Option<String>,
}

impl KevoConversationContext {
    pub fn push_entity(&mut self, kind: &str, value: String) -> Result<(), String> {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            return Err("Entity value cannot be empty.".into());
        }
        match kind {
            "file" => self.last_file = Some(trimmed.clone()),
            "note" => self.last_note = Some(trimmed.clone()),
            "track" => self.last_track = Some(trimmed.clone()),
            "book" => self.last_book = Some(trimmed.clone()),
            _ => return Err("Unknown entity kind. Use file, note, track, or book.".into()),
        }
        self.last_any = Some(trimmed);
        Ok(())
    }

    pub fn resolve_utterance(&self, utterance: &str) -> String {
        let lower = utterance.to_lowercase();
        let target = if lower.contains("that file") {
            self.last_file.as_deref()
        } else if lower.contains("that note") {
            self.last_note.as_deref()
        } else if lower.contains("that track") || lower.contains("the previous one") {
            self.last_track.as_deref()
        } else if lower.contains("that book") {
            self.last_book.as_deref()
        } else {
            self.last_any.as_deref()
        };
        resolve_anaphora(utterance, target.or(self.last_any.as_deref()))
    }
}

static CONVO_CONTEXT: Mutex<KevoConversationContext> = Mutex::new(KevoConversationContext {
    last_file: None,
    last_note: None,
    last_track: None,
    last_book: None,
    last_any: None,
});

#[tauri::command]
pub fn kevo_push_context_entity(kind: String, value: String) -> Result<(), String> {
    let mut guard = CONVO_CONTEXT.lock().map_err(|_| "Context lock unavailable.")?;
    guard.push_entity(&kind, value)
}

#[tauri::command]
pub fn kevo_resolve_contextual_utterance(utterance: String) -> Result<String, String> {
    let guard = CONVO_CONTEXT.lock().map_err(|_| "Context lock unavailable.")?;
    Ok(guard.resolve_utterance(&utterance))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomShortcutBinding {
    pub id: String,
    pub title: Option<String>,
    pub shortcut: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutConflict {
    pub normalized_shortcut: String,
    pub command_ids: Vec<String>,
    pub titles: Vec<String>,
}

pub fn normalize_shortcut(raw: &str) -> String {
    let parts: Vec<String> = raw
        .split('+')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect();
    if parts.is_empty() {
        return String::new();
    }
    let mut mods = Vec::new();
    let mut keys = Vec::new();
    for p in parts {
        match p.as_str() {
            "ctrl" | "control" => mods.push("ctrl".to_string()),
            "shift" => mods.push("shift".to_string()),
            "alt" | "option" => mods.push("alt".to_string()),
            "meta" | "cmd" | "super" | "win" => mods.push("meta".to_string()),
            _ => keys.push(p),
        }
    }
    mods.sort();
    mods.dedup();
    mods.extend(keys);
    mods.join("+")
}

pub fn detect_shortcut_conflicts(custom_bindings: Vec<CustomShortcutBinding>) -> Vec<ShortcutConflict> {
    let mut merged: Vec<(String, String, String)> = search_palette_commands("")
        .into_iter()
        .map(|c| (c.id.to_string(), c.title.to_string(), c.shortcut.to_string()))
        .collect();
    for custom in custom_bindings {
        if let Some(existing) = merged.iter_mut().find(|(id, _, _)| *id == custom.id) {
            existing.2 = custom.shortcut;
            if let Some(t) = custom.title.filter(|s| !s.trim().is_empty()) {
                existing.1 = t;
            }
        } else {
            let title = custom.title.unwrap_or_else(|| custom.id.clone());
            merged.push((custom.id, title, custom.shortcut));
        }
    }
    let mut by_chord: std::collections::BTreeMap<String, Vec<(String, String)>> =
        std::collections::BTreeMap::new();
    for (id, title, shortcut) in merged {
        let norm = normalize_shortcut(&shortcut);
        if norm.is_empty() {
            continue;
        }
        by_chord.entry(norm).or_default().push((id, title));
    }
    by_chord
        .into_iter()
        .filter(|(_, entries)| entries.len() > 1)
        .map(|(normalized_shortcut, entries)| ShortcutConflict {
            normalized_shortcut,
            command_ids: entries.iter().map(|(id, _)| id.clone()).collect(),
            titles: entries.iter().map(|(_, title)| title.clone()).collect(),
        })
        .collect()
}

#[tauri::command(rename_all = "camelCase")]
pub fn kevo_detect_shortcut_conflicts(
    custom_bindings: Option<Vec<CustomShortcutBinding>>,
) -> Vec<ShortcutConflict> {
    detect_shortcut_conflicts(custom_bindings.unwrap_or_default())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KevoRecallMatch {
    pub kind: String,
    pub id: String,
    pub text: String,
    pub category_or_role: String,
    pub score: f64,
    pub at: u64,
}

pub fn recall_memory_in(
    path: &Path,
    query: &str,
    limit: usize,
) -> Result<Vec<KevoRecallMatch>, String> {
    let _guard = MEMORY_LOCK.lock().map_err(|e| e.to_string())?;
    let clean = query.trim().to_lowercase();
    if clean.is_empty() {
        return Ok(Vec::new());
    }
    let tokens: Vec<&str> = clean.split_whitespace().collect();
    let store = load_store(path);
    let mut matches = Vec::new();
    let score_text = |text: &str| -> f64 {
        let lower = text.to_lowercase();
        if lower.contains(&clean) {
            1.0
        } else {
            let hits = tokens.iter().filter(|t| lower.contains(**t)).count();
            if hits == 0 {
                0.0
            } else {
                (hits as f64) / (tokens.len().max(1) as f64) * 0.8
            }
        }
    };
    for fact in &store.facts {
        let s = score_text(&fact.fact);
        if s > 0.0 {
            matches.push(KevoRecallMatch {
                kind: "fact".into(),
                id: fact.id.clone(),
                text: fact.fact.clone(),
                category_or_role: fact.category.clone(),
                score: s + 0.1,
                at: fact.created_at,
            });
        }
    }
    for turn in &store.turns {
        let s = score_text(&turn.text);
        if s > 0.0 {
            matches.push(KevoRecallMatch {
                kind: "turn".into(),
                id: turn.id.clone(),
                text: turn.text.clone(),
                category_or_role: turn.role.clone(),
                score: s,
                at: turn.at,
            });
        }
    }
    matches.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.at.cmp(&a.at))
    });
    matches.truncate(limit.clamp(1, 50));
    Ok(matches)
}

#[tauri::command(rename_all = "camelCase")]
pub fn kevo_memory_recall(query: String, limit: Option<usize>) -> Result<Vec<KevoRecallMatch>, String> {
    recall_memory_in(&memory_file_path(), &query, limit.unwrap_or(8))
}

/// Resolve anaphoric references ("that file", "that note", "it", "the previous one") against the last active entity.
pub fn resolve_anaphora(utterance: &str, last_entity: Option<&str>) -> String {
    let trimmed = utterance.trim();
    let Some(entity) = last_entity.map(str::trim).filter(|s| !s.is_empty()) else {
        return trimmed.to_string();
    };
    let lower = trimmed.to_lowercase();
    const REFS: &[&str] = &[
        "the previous one",
        "that file",
        "that note",
        "that track",
        "that book",
        "that",
        " it",
    ];
    for ref_phrase in REFS {
        if let Some(pos) = lower.find(ref_phrase) {
            let prefix = if *ref_phrase == " it" { " " } else { "" };
            let mut out = String::with_capacity(trimmed.len() + entity.len());
            out.push_str(&trimmed[..pos]);
            out.push_str(prefix);
            out.push_str(entity);
            out.push_str(&trimmed[pos + ref_phrase.len()..]);
            return out;
        }
    }
    trimmed.to_string()
}

/// Expand composable multi-step voice routines deterministically on-device.
pub fn resolve_routine_plan(utterance: &str, last_entity: Option<&str>) -> Option<KevoRoutinePlan> {
    let resolved_utterance = resolve_anaphora(utterance, last_entity);
    let lower = resolved_utterance.to_lowercase();
    if lower.contains("study mode") {
        return Some(KevoRoutinePlan {
            name: "Study Mode".into(),
            steps: vec![
                KevoRoutineStep { action: "pause_music".into(), target: String::new(), label: "Pause music".into() },
                KevoRoutineStep { action: "focus_timer".into(), target: "25m".into(), label: "Start 25-minute focus timer".into() },
                KevoRoutineStep { action: "open_view".into(), target: "workspace".into(), label: "Open workspace".into() },
            ],
            resolved_utterance,
        });
    }
    if lower.contains("wrap up session") || lower.contains("end session") {
        return Some(KevoRoutinePlan {
            name: "Wrap Up Session".into(),
            steps: vec![
                KevoRoutineStep { action: "save_project".into(), target: String::new(), label: "Save active project".into() },
                KevoRoutineStep { action: "stop_reading".into(), target: String::new(), label: "Stop narration".into() },
                KevoRoutineStep { action: "barge_in_clear".into(), target: String::new(), label: "Reset voice state".into() },
            ],
            resolved_utterance,
        });
    }
    if lower.contains("morning briefing") {
        return Some(KevoRoutinePlan {
            name: "Morning Briefing".into(),
            steps: vec![
                KevoRoutineStep { action: "list_reminders".into(), target: String::new(), label: "Read due reminders".into() },
                KevoRoutineStep { action: "what_was_i_reading".into(), target: String::new(), label: "Recap last book".into() },
                KevoRoutineStep { action: "play_music".into(), target: String::new(), label: "Resume ambient audio".into() },
            ],
            resolved_utterance,
        });
    }
    None
}

#[tauri::command]
pub fn kevo_barge_in_interrupt() -> u64 {
    BARGE_IN_EPOCH.fetch_add(1, Ordering::SeqCst) + 1
}

#[tauri::command]
pub fn kevo_barge_in_epoch() -> u64 {
    BARGE_IN_EPOCH.load(Ordering::SeqCst)
}

#[tauri::command]
pub fn kevo_resolve_routine(utterance: String, last_entity: Option<String>) -> Option<KevoRoutinePlan> {
    resolve_routine_plan(&utterance, last_entity.as_deref())
}

#[tauri::command]
pub fn kevo_resolve_anaphora(utterance: String, last_entity: Option<String>) -> String {
    resolve_anaphora(&utterance, last_entity.as_deref())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn memory_file_path() -> PathBuf {
    settings::local_dir().join("kevo").join("kevo-memory.json")
}

pub fn load_store(path: &Path) -> KevoMemoryStore {
    if !path.exists() {
        return KevoMemoryStore::default();
    }
    match std::fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str::<KevoMemoryStore>(&raw).unwrap_or_else(|_| {
            // Corrupt file recovery: heal safely without crashing
            KevoMemoryStore::default()
        }),
        Err(_) => KevoMemoryStore::default(),
    }
}

pub fn save_store(path: &Path, store: &KevoMemoryStore) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        platform::ensure_private_dir(parent)?;
    }
    let data = serde_json::to_string_pretty(store)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, data)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

fn generate_id(prefix: &str) -> String {
    let now = now_ms();
    let key = crate::local_ai::random_key().unwrap_or_else(|_| format!("{:x}", now));
    let suffix = if key.len() >= 8 { &key[..8] } else { &key };
    format!("{prefix}_{now}_{suffix}")
}

pub fn remember_fact_in(
    path: &Path,
    fact_text: String,
    category: Option<String>,
) -> Result<KevoFact, String> {
    let _guard = MEMORY_LOCK.lock().map_err(|e| e.to_string())?;
    let mut store = load_store(path);
    let clean = fact_text.trim();
    if clean.is_empty() {
        return Err("Fact cannot be empty.".to_string());
    }

    let cat = category
        .map(|c| c.trim().to_lowercase())
        .filter(|c| !c.is_empty())
        .unwrap_or_else(|| "general".to_string());

    let now = now_ms();

    // Deduplicate identical facts in the same category
    if let Some(existing) = store
        .facts
        .iter_mut()
        .find(|f| f.fact.eq_ignore_ascii_case(clean) && f.category == cat)
    {
        existing.updated_at = now;
        let result = existing.clone();
        save_store(path, &store).map_err(|e| e.to_string())?;
        return Ok(result);
    }

    let new_fact = KevoFact {
        id: generate_id("fact"),
        fact: clean.to_string(),
        category: cat,
        created_at: now,
        updated_at: now,
    };

    store.facts.push(new_fact.clone());
    if store.facts.len() > MAX_FACTS {
        store.facts.remove(0);
    }

    save_store(path, &store).map_err(|e| e.to_string())?;
    Ok(new_fact)
}

pub fn list_facts_in(path: &Path, query: Option<String>) -> Result<Vec<KevoFact>, String> {
    let _guard = MEMORY_LOCK.lock().map_err(|e| e.to_string())?;
    let store = load_store(path);
    let q = query.map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty());

    let filtered = match q {
        Some(needle) => store
            .facts
            .into_iter()
            .filter(|f| {
                f.fact.to_lowercase().contains(&needle)
                    || f.category.to_lowercase().contains(&needle)
            })
            .collect(),
        None => store.facts,
    };

    Ok(filtered)
}

pub fn delete_fact_in(path: &Path, id: &str) -> Result<bool, String> {
    let _guard = MEMORY_LOCK.lock().map_err(|e| e.to_string())?;
    let mut store = load_store(path);
    let initial_len = store.facts.len();
    store.facts.retain(|f| f.id != id);
    let changed = store.facts.len() != initial_len;
    if changed {
        save_store(path, &store).map_err(|e| e.to_string())?;
    }
    Ok(changed)
}

pub fn clear_facts_in(path: &Path) -> Result<bool, String> {
    let _guard = MEMORY_LOCK.lock().map_err(|e| e.to_string())?;
    let mut store = load_store(path);
    let had_facts = !store.facts.is_empty();
    store.facts.clear();
    save_store(path, &store).map_err(|e| e.to_string())?;
    Ok(had_facts)
}

pub fn load_turns_in(path: &Path, limit: Option<usize>) -> Result<Vec<KevoTurn>, String> {
    let _guard = MEMORY_LOCK.lock().map_err(|e| e.to_string())?;
    let store = load_store(path);
    let lim = limit.unwrap_or(MAX_TURNS).min(MAX_TURNS);
    let start = store.turns.len().saturating_sub(lim);
    Ok(store.turns[start..].to_vec())
}

pub fn save_turn_in(path: &Path, role: String, text: String) -> Result<(), String> {
    let _guard = MEMORY_LOCK.lock().map_err(|e| e.to_string())?;
    let clean = text.trim();
    if clean.is_empty() {
        return Ok(());
    }
    let mut store = load_store(path);
    store.turns.push(KevoTurn {
        id: generate_id("turn"),
        role,
        text: clean.to_string(),
        at: now_ms(),
    });
    if store.turns.len() > MAX_TURNS {
        let trim_to = store.turns.len() - MAX_TURNS;
        store.turns.drain(0..trim_to);
    }
    save_store(path, &store).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn clear_turns_in(path: &Path) -> Result<bool, String> {
    let _guard = MEMORY_LOCK.lock().map_err(|e| e.to_string())?;
    let mut store = load_store(path);
    let had_turns = !store.turns.is_empty();
    store.turns.clear();
    save_store(path, &store).map_err(|e| e.to_string())?;
    Ok(had_turns)
}

// Tauri commands

#[tauri::command]
pub fn kevo_memory_remember_fact(
    fact: String,
    category: Option<String>,
) -> Result<KevoFact, String> {
    remember_fact_in(&memory_file_path(), fact, category)
}

#[tauri::command]
pub fn kevo_memory_list_facts(query: Option<String>) -> Result<Vec<KevoFact>, String> {
    list_facts_in(&memory_file_path(), query)
}

#[tauri::command]
pub fn kevo_memory_delete_fact(id: String) -> Result<bool, String> {
    delete_fact_in(&memory_file_path(), &id)
}

#[tauri::command]
pub fn kevo_memory_clear_facts() -> Result<bool, String> {
    clear_facts_in(&memory_file_path())
}

#[tauri::command]
pub fn kevo_memory_load_history(limit: Option<usize>) -> Result<Vec<KevoTurn>, String> {
    load_turns_in(&memory_file_path(), limit)
}

#[tauri::command]
pub fn kevo_memory_save_turn(role: String, text: String) -> Result<(), String> {
    save_turn_in(&memory_file_path(), role, text)
}

#[tauri::command]
pub fn kevo_memory_clear_history() -> Result<bool, String> {
    clear_turns_in(&memory_file_path())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_file(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("kevo-test-memory-{name}-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        dir.join("kevo-memory.json")
    }

    fn cleanup(path: &Path) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::remove_dir_all(parent);
        }
    }

    #[test]
    fn remembers_and_lists_facts() {
        let path = test_file("remember_list");
        cleanup(&path);

        let fact1 = remember_fact_in(&path, "User prefers dark chocolate".to_string(), Some("food".to_string())).unwrap();
        assert_eq!(fact1.fact, "User prefers dark chocolate");
        assert_eq!(fact1.category, "food");

        let fact2 = remember_fact_in(&path, "User works in TypeScript".to_string(), None).unwrap();
        assert_eq!(fact2.category, "general");

        let all = list_facts_in(&path, None).unwrap();
        assert_eq!(all.len(), 2);

        let search = list_facts_in(&path, Some("chocolate".to_string())).unwrap();
        assert_eq!(search.len(), 1);
        assert_eq!(search[0].id, fact1.id);

        cleanup(&path);
    }

    #[test]
    fn deletes_fact_and_clears() {
        let path = test_file("delete_clear");
        cleanup(&path);

        let fact = remember_fact_in(&path, "Temporary fact".to_string(), None).unwrap();
        let deleted = delete_fact_in(&path, &fact.id).unwrap();
        assert!(deleted);

        let remaining = list_facts_in(&path, None).unwrap();
        assert!(remaining.is_empty());

        let _ = remember_fact_in(&path, "Fact to clear".to_string(), None).unwrap();
        let cleared = clear_facts_in(&path).unwrap();
        assert!(cleared);
        assert!(list_facts_in(&path, None).unwrap().is_empty());

        cleanup(&path);
    }

    #[test]
    fn saves_and_bounds_turns() {
        let path = test_file("turns_bounds");
        cleanup(&path);

        for i in 0..60 {
            save_turn_in(&path, "user".to_string(), format!("Query {i}")).unwrap();
        }

        let turns = load_turns_in(&path, None).unwrap();
        assert_eq!(turns.len(), MAX_TURNS);
        assert_eq!(turns.last().unwrap().text, "Query 59");

        cleanup(&path);
    }

    #[test]
    fn recovers_from_corrupt_file() {
        let path = test_file("corrupt");
        cleanup(&path);
        let _ = std::fs::create_dir_all(path.parent().unwrap());
        std::fs::write(&path, "{ not valid json").unwrap();

        let store = load_store(&path);
        assert!(store.facts.is_empty());
        assert!(store.turns.is_empty());

        cleanup(&path);
    }

    #[test]
    fn persists_across_restart_and_purges_deleted() {
        let path = test_file("restart_survival");
        cleanup(&path);

        // Initial process run writes facts and turns
        let f1 = remember_fact_in(&path, "User lives in Evansville".to_string(), Some("location".to_string())).unwrap();
        let _f2 = remember_fact_in(&path, "User likes jazz".to_string(), Some("music".to_string())).unwrap();
        save_turn_in(&path, "user".to_string(), "Where do I live?".to_string()).unwrap();

        // Simulate restart by loading fresh from disk
        let loaded = load_store(&path);
        assert_eq!(loaded.facts.len(), 2);
        assert_eq!(loaded.turns.len(), 1);
        assert_eq!(loaded.facts[0].fact, "User lives in Evansville");
        assert_eq!(loaded.turns[0].text, "Where do I live?");

        // Delete a fact and verify it remains deleted across reload
        let deleted = delete_fact_in(&path, &f1.id).unwrap();
        assert!(deleted);

        let reloaded = load_store(&path);
        assert_eq!(reloaded.facts.len(), 1);
        assert_eq!(reloaded.facts[0].fact, "User likes jazz");
        assert!(!reloaded.facts.iter().any(|f| f.id == f1.id));

        cleanup(&path);
    }

    #[test]
    fn resolves_anaphora_routines_and_barge_in_epoch() {
        assert_eq!(
            resolve_anaphora("convert that file to mp3", Some("lecture.wav")),
            "convert lecture.wav to mp3"
        );
        assert_eq!(
            resolve_anaphora("summarize it", Some("Chapter 4")),
            "summarize Chapter 4"
        );
        let study = resolve_routine_plan("Activate study mode", None).unwrap();
        assert_eq!(study.name, "Study Mode");
        assert_eq!(study.steps.len(), 3);
        let before = kevo_barge_in_epoch();
        let after = kevo_barge_in_interrupt();
        assert_eq!(after, before + 1);
    }

    #[test]
    fn matches_offline_intents_and_fuzzy_entities() {
        let cands = vec!["Rust Audio Notes".to_string(), "Weekly Review".to_string()];
        let open = match_offline_intent("open rust audio note", &cands).unwrap();
        assert_eq!(open.intent, "open_entity");
        assert_eq!(open.entity.as_deref(), Some("Rust Audio Notes"));
        let pause = match_offline_intent("paws the music", &cands).unwrap();
        assert_eq!(pause.intent, "pause_music");
        assert!(match_offline_intent("   ", &cands).is_none());
    }

    #[test]
    fn plans_selection_actions_and_tracks_voice_latency() {
        let plan = plan_selection_action("summarize this", "Long note text").unwrap();
        assert_eq!(plan.action, "summarize");
        assert!(!plan.truncated);
        assert!(plan_selection_action("summarize", "   ").is_err());
        let stats = record_timing(40, 5, 80);
        assert!(stats.sample_count >= 1);
        assert!(stats.p95_total_ms >= stats.p50_total_ms);
    }

    #[test]
    fn palette_commands_have_unique_ids_and_filter_by_keyword() {
        let all = search_palette_commands("");
        let mut ids = std::collections::HashSet::new();
        for cmd in &all {
            assert!(ids.insert(cmd.id));
            assert!(!cmd.title.is_empty());
        }
        let lufs = search_palette_commands("lufs");
        assert_eq!(lufs.len(), 1);
        assert_eq!(lufs[0].id, "audio.normalize_lufs");
    }

    #[test]
    fn conversation_context_resolves_typed_entities() {
        let mut ctx = KevoConversationContext::default();
        ctx.push_entity("file", "lecture.wav".into()).unwrap();
        ctx.push_entity("note", "Sprint Plan".into()).unwrap();
        assert_eq!(ctx.resolve_utterance("convert that file to mp3"), "convert lecture.wav to mp3");
        assert_eq!(ctx.resolve_utterance("open that note"), "open Sprint Plan");
        assert!(ctx.push_entity("unknown", "x".into()).is_err());
    }

    #[test]
    fn rapid_barge_in_and_oversized_selection_are_bounded() {
        let start = kevo_barge_in_epoch();
        for i in 1..=50 {
            assert_eq!(kevo_barge_in_interrupt(), start + i);
        }
        let big = "a".repeat(8000);
        let plan = plan_selection_action("rewrite this", &big).unwrap();
        assert!(plan.truncated);
        assert_eq!(plan.selection_chars, 8000);
    }

    #[test]
    fn shortcut_conflict_detector_catches_reordered_modifiers() {
        assert!(detect_shortcut_conflicts(Vec::new()).is_empty());
        let conflicts = detect_shortcut_conflicts(vec![CustomShortcutBinding {
            id: "audio.normalize_lufs".into(),
            title: Some("Normalize Audio (-14 LUFS)".into()),
            shortcut: "Shift + Ctrl + S".into(),
        }]);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].normalized_shortcut, "ctrl+shift+s");
        assert!(conflicts[0].command_ids.contains(&"kevo.study_mode".to_string()));
        assert!(conflicts[0].command_ids.contains(&"audio.normalize_lufs".to_string()));
    }

    #[test]
    fn recall_memory_ranks_facts_and_turns_by_relevance() {
        let path = test_file("recall");
        let _ = std::fs::remove_file(&path);
        remember_fact_in(&path, "Favorite mic is Shure SM7B".into(), Some("audio".into())).unwrap();
        save_turn_in(&path, "user".into(), "Check microphone gain levels".into()).unwrap();
        let hits = recall_memory_in(&path, "Shure SM7B", 5).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].kind, "fact");
        assert!(hits[0].score > 1.0);
        let _ = std::fs::remove_file(&path);
    }
}
