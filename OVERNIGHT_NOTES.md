# AnF & ThingsBook Overnight Engineering Log

**Started:** 2026-11-24 Evening
**Mandate:** Exhaustive full-stack capability expansion, architectural hardening, and UX elevation (Real Rust + Tauri/Core + TypeScript/Vite UI — zero standalone JS mocks)

---

## Morning Coffee Triage

### Branches Shipped (all local — nothing pushed to `main`)
| Repo | Branch | Rust Modules + UI Views Added | Verification |
|------|--------|-------------------------------|--------------|
| AnF | `grok/rust-vault-code-blocks` (stacked) | `crates/anf-vault/src/related.rs` (`VaultCodeBlock`, `extract_vault_code_blocks`), `anf_vault_bridge.rs` (`#[tauri::command] workspace_vault_code_blocks`), `lib.rs`, `related-notes.ts` (`VaultCodeBlock`, `fetchVaultCodeBlocks`) | `anf-vault` clippy + 28/28 pass (27 lib + 1 stress); `cargo check` green; `anf_vault_bridge` pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-vault-note-preview` (stacked) | `crates/anf-vault/src/related.rs` (`VaultNotePreview`, `extract_vault_previews`), `anf_vault_bridge.rs` (`#[tauri::command] workspace_vault_previews`), `lib.rs`, `related-notes.ts` (`VaultNotePreview`, `fetchVaultPreviews`) | `anf-vault` clippy + 27/27 pass (26 lib + 1 stress); `cargo check` green; `anf_vault_bridge` pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-vault-reading-checklist` (stacked) | `crates/anf-vault/src/related.rs` (`VaultTaskItem`, `extract_vault_tasks`), `anf_vault_bridge.rs` (`#[tauri::command] workspace_vault_tasks`), `lib.rs`, `related-notes.ts` (`VaultTaskItem`, `fetchVaultTasks`) | `anf-vault` clippy + 26/26 pass (25 lib + 1 stress); `cargo check` green; `anf_vault_bridge` pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-vault-notes-by-tag` (stacked) | `crates/anf-vault/src/related.rs` (`TaggedNoteMatch`, `find_notes_by_tag`), `anf_vault_bridge.rs` (`#[tauri::command] workspace_notes_by_tag`), `lib.rs`, `related-notes.ts` (`TaggedNoteMatch`, `fetchNotesByTag`) | `anf-vault` clippy + 25/25 pass (24 lib + 1 stress); `cargo check` green; `anf_vault_bridge` pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-vault-note-search` (stacked) | `crates/anf-vault/src/related.rs` (`VaultSearchHit`, `search_vault_notes`), `anf_vault_bridge.rs` (`#[tauri::command] workspace_search_vault_notes`), `lib.rs`, `related-notes.ts` (`VaultSearchHit`, `searchVaultNotesNative`) | `anf-vault` clippy + 24/24 pass (23 lib + 1 stress); `cargo check` green; `anf_vault_bridge` pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-vault-word-goal` (stacked) | `crates/anf-vault/src/related.rs` (`VaultWordGoalProgress`, `evaluate_vault_word_goal`), `anf_vault_bridge.rs` (`#[tauri::command] workspace_vault_word_goal`), `lib.rs`, `related-notes.ts` (`VaultWordGoalProgress`, `fetchVaultWordGoal`) | `anf-vault` clippy + 23/23 pass (22 lib + 1 stress); `cargo check` green; `anf_vault_bridge` pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-vault-stub-notes` (stacked) | `crates/anf-vault/src/related.rs` (`StubNoteEntry`, `find_stub_notes`), `anf_vault_bridge.rs` (`#[tauri::command] workspace_stub_notes`), `lib.rs`, `related-notes.ts` (`StubNoteEntry`, `fetchStubNotes`) | `anf-vault` clippy + 22/22 pass (21 lib + 1 stress); `cargo check` green; `anf_vault_bridge` pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-vault-note-outline` (stacked) | `crates/anf-vault/src/related.rs` (`NoteOutlineHeading`, `extract_note_outline`), `anf_vault_bridge.rs` (`#[tauri::command] workspace_note_outline`), `lib.rs`, `related-notes.ts` (`NoteOutlineHeading`, `fetchNoteOutline`) | `anf-vault` clippy + 21/21 pass (20 lib + 1 stress); `cargo check` green; `anf_vault_bridge` pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-audio-pitch-cents` (stacked) | `windows/src-tauri/src/audio_native.rs` (`PitchRateMapping`, `semitones_to_playback_rate`, `#[tauri::command] audio_pitch_to_rate`), `lib.rs`, `audio-studio.ts` (`PitchRateMapping`, `mapPitchToPlaybackRate`) | `cargo check` green; `src-tauri` `audio_native` 16/16 pass (1 ignored); `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-audio-fade-envelope` (stacked) | `windows/src-tauri/src/audio_native.rs` (`FadeEnvelopeResult`, `apply_fade_in_out`, `#[tauri::command] audio_preview_fade_envelope`), `lib.rs`, `audio-studio.ts` (`previewAudioFadeEnvelope`) | `cargo check` green; `src-tauri` `audio_native` 15/15 pass (1 ignored); `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-vault-reading-time` (stacked) | `crates/anf-vault/src/related.rs` (`NoteReadingStats`, `compute_note_reading_stats`), `anf_vault_bridge.rs` (`#[tauri::command] workspace_note_reading_stats`), `lib.rs`, `related-notes.ts` (`NoteReadingStats`, `fetchNoteReadingStats`) | `anf-vault` clippy + 19/19 pass (18 lib + 1 stress); `cargo check` green; `anf_vault_bridge` pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-audio-channel-balance` (stacked) | `windows/src-tauri/src/audio_native.rs` (`StereoBalanceReport`, `analyze_stereo_balance`, `#[tauri::command] audio_analyze_stereo_balance`), `lib.rs`, `audio-studio.ts` (`StereoBalanceReport`, `analyzeStereoBalance`) | `cargo check` green; `src-tauri` `audio_native` 14/14 pass (1 ignored); `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-kevo-routine-presets` (stacked) | Built-in Kevo routine preset catalog (`KevoRoutinePreset`, `ROUTINE_PRESETS`, `list_routine_presets`, `#[tauri::command] kevo_list_routine_presets` in `kevo_memory.rs`, `lib.rs`, `kevo-routines.ts` `listKevoRoutinePresets`) | `cargo check` green; `kevo_memory` 14/14 pass; `npm run build` green |
| AnF | `grok/rust-kevo-memory-search` (stacked) | `windows/src-tauri/src/kevo_memory.rs` (`KevoRecallMatch`, `recall_memory_in`, `#[tauri::command] kevo_memory_recall`), `lib.rs`, `kevo-routines.ts` (`KevoRecallMatch`, `recallKevoMemory`) | `cargo check` green; `src-tauri` `kevo_memory` 13/13 pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-audio-dc-offset-check` (stacked) | `windows/src-tauri/src/audio_native.rs` (`DcOffsetReport`, `analyze_dc_offset`, `remove_dc_offset`, `#[tauri::command] audio_analyze_dc_offset`), `lib.rs`, `audio-studio.ts` (`DcOffsetReport`, `analyzeAudioDcOffset`) | `cargo check` green; `src-tauri` `audio_native` 13/13 pass (1 ignored); `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-audio-bpm-tap` (stacked) | `windows/src-tauri/src/audio_native.rs` (`BpmEstimate`, `estimate_bpm_from_taps`, `#[tauri::command] audio_estimate_bpm`), `lib.rs`, `audio-studio.ts` (`BpmEstimate`, `estimateBpmFromTaps`) | `cargo check` green; `src-tauri` `audio_native` 12/12 pass (1 ignored); `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-vault-broken-links` (stacked) | `crates/anf-vault/src/related.rs` (`BrokenWikiLink`, `find_broken_wiki_links`), `anf_vault_bridge.rs` (`#[tauri::command] workspace_broken_wiki_links`), `lib.rs`, `related-notes.ts` (`BrokenWikiLink`, `fetchBrokenWikiLinks`) | `anf-vault` clippy + 18/18 pass (17 lib + 1 stress); `cargo check` green; `anf_vault_bridge` pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-vault-tag-index` (stacked) | `crates/anf-vault/src/related.rs` (`VaultTagCount`, `extract_vault_tags`), `anf_vault_bridge.rs` (`#[tauri::command] workspace_vault_tags`), `lib.rs`, `related-notes.ts` (`VaultTagCount`, `fetchVaultTags`) | `anf-vault` clippy + 17/17 pass (16 lib + 1 stress); `cargo check` green; `anf_vault_bridge` pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-vault-backlinks` (stacked) | `crates/anf-vault/src/related.rs` (`NoteBacklink`, `find_note_backlinks`), `anf_vault_bridge.rs` (`#[tauri::command] workspace_note_backlinks`), `lib.rs`, `related-notes.ts` (`NoteBacklink`, `fetchNoteBacklinks`) | `anf-vault` clippy + 16/16 pass (15 lib + 1 stress); `cargo check` green; `anf_vault_bridge` pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-audio-spectrum-envelope` (stacked) | `windows/src-tauri/src/audio_native.rs` (`WaveformEnvelope`, `compute_waveform_envelope`, `#[tauri::command] audio_waveform_envelope`), `lib.rs`, `audio-studio.ts` (`WaveformEnvelope`, `computeWaveformEnvelope`) | `cargo check` green; `src-tauri` `audio_native` 11/11 pass (1 ignored); `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-global-shortcut-conflicts` (stacked) | `windows/src-tauri/src/kevo_memory.rs` (`CustomShortcutBinding`, `ShortcutConflict`, `normalize_shortcut`, `detect_shortcut_conflicts`, `#[tauri::command] kevo_detect_shortcut_conflicts`), `lib.rs`, `kevo-routines.ts` (`detectShortcutConflicts`) | `cargo check` green; `src-tauri` `kevo_memory` 12/12 pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-kevo-reminder-snooze` (stacked) | `windows/src-tauri/src/kevo_schedule.rs` (`parse_snooze_duration_ms`, `snooze_reminder_in`, `#[tauri::command] kevo_schedule_snooze_reminder`), `lib.rs`, `kevo-routines.ts` (`KevoReminder`, `snoozeKevoReminder`) | `cargo check` green; `src-tauri` `kevo_schedule` 5/5 pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-audio-peak-clip-guard` (stacked) | `windows/src-tauri/src/audio_native.rs` (`ClipAuditReport`, `audit_clipping`, `#[tauri::command] audio_audit_clipping`), `lib.rs` | `cargo check` green; `src-tauri` `audio_native` 10/10 pass |
| AnF | `grok/rust-kevo-stress-qa` (stacked) | `crates/anf-vault/tests/stress.rs` (1,000-note corpus <0.05s), `audio_native.rs` NaN/Inf/negative QA, `kevo_memory.rs` 50x rapid barge-in + truncation QA | `anf-vault` clippy + 15/15 pass; `audio_native` 9/9 pass; `kevo_memory` 11/11 pass; `npm run build` green |
| AnF | `grok/rust-audio-gapless-preload` (stacked) | `windows/src-tauri/src/audio_native.rs` (`GaplessTransitionPlan`, `plan_gapless_transition`, `#[tauri::command] audio_plan_gapless`), `lib.rs` | `cargo check` green; `src-tauri` `audio_native` 8/8 pass |
| AnF | `grok/rust-kevo-conversation-continuity` (stacked) | `windows/src-tauri/src/kevo_memory.rs` (`KevoConversationContext`, `#[tauri::command] kevo_push_context_entity`, `kevo_resolve_contextual_utterance`), `lib.rs`, `kevo-routines.ts` (`pushKevoContextEntity`, `resolveContextualUtterance`) | `cargo check` green; `src-tauri` `kevo_memory` pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-audio-batch-presets` (stacked) | `windows/src-tauri/src/audio_native.rs` (`AudioPresetInfo`, `#[tauri::command] audio_list_presets`, `audio_validate_batch_job`), `lib.rs` | `cargo check` green; `src-tauri` `audio_native` 7/7 pass |
| AnF | `grok/rust-media-session-metadata` (stacked) | `windows/src-tauri/src/audio_native.rs` (`MediaSessionState`, `AudioMediaSession`, `#[tauri::command] audio_media_session_update`, `audio_media_session_state`, `audio_media_key_dispatch`), `lib.rs` | `cargo check` green; `src-tauri` `audio_native` 6/6 pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-vault-health-stats` (stacked) | `crates/anf-vault/src/related.rs` (`VaultHealthSummary`, `summarize_vault_notes`), `anf_vault_bridge.rs` (`#[tauri::command] workspace_vault_health`), `lib.rs`, `related-notes.ts` (`fetchVaultHealth`) | `cargo check` green; `anf-vault` 14/14 pass; `src-tauri` `anf_vault_bridge` pass; `npm run build` green |
| AnF | `grok/rust-kevo-command-palette-sync` (stacked) | `windows/src-tauri/src/kevo_memory.rs` (`KevoPaletteCommand`, `search_palette_commands`, `#[tauri::command] kevo_search_commands`), `lib.rs`, `kevo-routines.ts` (`searchKevoCommands`) | `cargo check` green; `src-tauri` `kevo_memory` pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/moonshot-rust-voice-pipeline-metrics` (stacked) | `windows/src-tauri/src/kevo_memory.rs` (`plan_selection_action`, `record_timing`, `#[tauri::command] kevo_plan_selection_action`, `kevo_record_voice_timing`), `lib.rs`, `kevo-routines.ts` (`planSelectionAction`, `recordVoiceTiming`) | `cargo check` green; `src-tauri` `kevo_memory` pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-queue-history-speed` (stacked) | `windows/src-tauri/src/audio_native.rs` (`AudioQueueInner`, `AudioQueueState`, `#[tauri::command] audio_queue_push`, `audio_queue_next`, `audio_queue_prev`, `audio_set_item_speed`, `audio_get_item_speed`), `lib.rs`, `audio-studio.ts` ("Save item speed") | `cargo check` green; `src-tauri` `audio_native` 5/5 pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-waveform-region-undo` (stacked) | `windows/src-tauri/src/audio_native.rs` (`AudioEditRegion`, `AudioEditHistory`, `AudioEditState`, `#[tauri::command] audio_region_apply`, `audio_region_undo`, `audio_region_redo`), `lib.rs`, `audio-studio.ts` ("Undo edit" / "Redo edit") | `cargo check` green; `src-tauri` `audio_native` 4/4 pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-kevo-fuzzy-intents` (stacked) | `windows/src-tauri/src/kevo_memory.rs` (`levenshtein`, `fuzzy_match_entity`, `match_offline_intent`, `#[tauri::command] kevo_match_intent`), `lib.rs`, `kevo-routines.ts` (`matchKevoIntent`) | `cargo check` green; `src-tauri` `kevo_memory` pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-audio-crossfade-lufs` (stacked) | `windows/src-tauri/src/audio_native.rs` (`LoudnessReport`, `compute_lufs_and_gain`, `compute_crossfade_gains`, `#[tauri::command] audio_analyze_loudness`, `audio_crossfade_curve`), `lib.rs`, `windows/src/workspace/audio-studio.ts` ("Normalize (-14 LUFS)" button) | `cargo check` green; `src-tauri` `audio_native` 3/3 pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-kevo-barge-in-routines` (stacked) | `windows/src-tauri/src/kevo_memory.rs` (`kevo_barge_in_interrupt`, `kevo_barge_in_epoch`, `kevo_resolve_routine`, `kevo_resolve_anaphora`), `lib.rs`, `windows/src/workspace/jarvis/voice/kevo-routines.ts` | `cargo check` green; `src-tauri` `kevo_memory` pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-audio-silence-trimming` (stacked) | `windows/src-tauri/src/audio_native.rs` (`SilenceTrimPlan`, `detect_silence_regions`, `#[tauri::command] audio_detect_silence`), `lib.rs`, `windows/src/workspace/audio-studio.ts` ("Trim silence" button) | `cargo check` green; `src-tauri` `audio_native` 2/2 pass; `npm run build` (`tsc --noEmit && vite build`) green |
| AnF | `grok/rust-related-notes-command` | `crates/anf-vault/src/related.rs` (`anf_vault::related::related_notes`), `windows/src-tauri/src/anf_vault_bridge.rs` (`#[tauri::command] workspace_related_notes`), `windows/src/workspace/related-notes.ts` + sidebar wiring in `main.ts` | `cargo check` green; `anf-vault` 13/13 pass; `src-tauri` `anf_vault_bridge` 2/2 pass; `npm run build` (`tsc --noEmit && vite build`) green |
| ThingsBook | `grok/rust-smart-shelves` (stacked) | `core/src/storage.rs` (`LibrarySummary`, `library_summary`), `core_bridge.rs`, desktop IPC, `app.js` `librarySummaryNative` | `cargo clippy -- -D warnings` green; `cargo test` 20/20 pass |
| ThingsBook | `grok/rust-citation-export` (stacked) | `core/src/storage.rs` (`export_annotations_formatted`), `core_bridge.rs`, desktop IPC, `app.js` `exportBookAnnotationsNative` | `cargo clippy -- -D warnings` green; `cargo test` 19/19 pass |
| ThingsBook | `grok/rust-session-recap` (stacked) | `core/src/storage.rs` (`SessionRecap`, `session_recap`), `core_bridge.rs`, desktop IPC, `app.js` `whatWasIReadingNative` | `cargo clippy -- -D warnings` green; `cargo test` 18/18 pass |
| ThingsBook | `grok/rust-cross-book-search` | `core/src/storage.rs` (`normalize_spoken_query`, `search_annotations`), `core/src/bin/core_bridge.rs` (`save_annotation`, `search_annotations`), `work/thingsbook-desktop/{native-core,main,preload}.cjs`, `outputs/ThingsBook/app.js` (`searchHighlightsNative`) | `cargo clippy -- -D warnings` green; `cargo test` 17/17 pass |
| AnF | `grok/ui-command-palette-kevo` (prior TS-only) | `windows/src/workspace/kevo-commands.ts`, `main.ts` | 940/940 tests, build green |
| AnF | `grok/adversarial-kevo-palette` (prior TS-only) | `windows/tests/kevo-command-palette.test.ts` | 943/943 tests |
| AnF | `grok/moonshot-local-related-notes` (prior TS-only) | `windows/src/workspace/related-notes.ts` (ported to Rust in `grok/rust-related-notes-command`) | 948/948 tests, build green |
| AnF | `grok/smart-silence-trimming` (prior TS-only) | `windows/src/workspace/audio-silence.ts`, `audio-studio.ts` | 955/955 tests, build green |
| ThingsBook | `grok/library-voice-search` (prior JS-only) | `outputs/ThingsBook/app.js` | 28/28 tests |
| ThingsBook | `grok/adversarial-voice-inputs` (prior JS-only) | `outputs/ThingsBook/app.js` | 29/29 tests |
| ThingsBook | `grok/moonshot-cross-book-search` (prior JS-only) | `outputs/ThingsBook/app.js` (ported to Rust in `grok/rust-cross-book-search`) | 30/30 tests |

### In Progress / Queued Next
- AnF: `grok/rust-audio-silence-trimming` (port `audio-silence.ts` into `windows/src-tauri/src/audio_native.rs` + `#[tauri::command]`)
- AnF: `grok/rust-kevo-barge-in-routines` (multi-turn anaphora + composable routines + barge-in state machine in `kevo_memory.rs` / `workspace_commands.rs`)
- ThingsBook: `grok/rust-session-recap` ("What Was I Reading?" context-recap engine in `core/src/storage.rs` + `core_bridge.rs` + desktop IPC + UI)

### Broken Branches
*None.*

### Smallest Highest-Leverage First Merge
`grok/rust-related-notes-command` (AnF) or `grok/rust-cross-book-search` (ThingsBook): clean full-stack Rust + IPC + UI vertical slices with unit tests and zero external dependencies.

---

## Master Roadmap (Prioritized)

### Phase 1 — Foundation & Audit
- [x] Audit existing `grok/` branches and identify JS-only prototypes to port to Rust
- [x] Verify Rust toolchains (`anf-vault`, `windows/src-tauri` with `OPENSSL_NO_VENDOR=1`, `ThingsBook/core`)

### Phase 2 — Voice Assistant (AnF → Kevo)
- [ ] Multi-turn conversational continuity & anaphora in Rust + Kevo UI
- [ ] Low-latency barge-in interruption state machine
- [ ] Composable multi-step voice routines ("Study Mode", "Wrap up session")
- [ ] Deterministic offline intent routing with fuzzy entity resolution

### Phase 3 — Audio Studio & Music Hub (AnF)
- [ ] Port smart silence trimming to `audio_native.rs` (`#[tauri::command]`)
- [ ] Configurable crossfade curves, dynamic up-next queue & history stack, per-item speed memory
- [ ] Non-destructive waveform region editing with undo/redo & LUFS loudness normalization

### Phase 4 — Reading & Narration (ThingsBook ↔ AnF)
- [x] `grok/rust-cross-book-search`: On-device Rust SQLite cross-book highlight/note search + spoken query normalization
- [ ] "What Was I Reading?" session-resume & context-recap engine in Rust + UI
- [ ] Word/sentence-synced read-aloud highlighting, variable WPM ramping, fade-out sleep timers, Markdown/Chicago citation exports

### Phase 5 — Moonshots & Adversarial QA
- [x] `grok/rust-related-notes-command`: On-device IDF-weighted cosine similarity in `anf-vault` + Tauri command + Workspace sidebar
- [ ] Corrupted EPUB/audio, rapid barge-in interruptions, 5,000-item stress tests in Rust

---

## Decision Log
- **Prebuilt OpenSSL on Windows**: `AnF/windows/src-tauri` uses `rusqlite` with `bundled-sqlcipher-vendored-openssl`. Setting `OPENSSL_NO_VENDOR=1` + `OPENSSL_DIR` to the prebuilt `anf-main-build` OpenSSL install avoids needing Strawberry Perl during `cargo check`/`cargo test`.
- **Full Vertical Slices**: Every new capability must span Rust (`crates/anf-vault` + `windows/src-tauri/src/` or `ThingsBook/core/src/`), IPC (`#[tauri::command]` or `core_bridge.rs` + `native-core.cjs`/`main.cjs`/`preload.cjs`), and frontend UI.

### 2026-11-24 Evening — Initial Setup
- **REA**: Connected and ready. Doctor reports healthy environment.
- **Ponytail**: Activated at `full` level. Smallest complete change mandate in effect.
- **Branch Strategy**: Continue on existing `grok/*` branches, create new thematic branches as needed. Never push to `main`.

---

## Active Tracks

### Track 1: Deep Repo & Cross-Pollination
- Scanning all `mwalikokelvo/*` repos for reusable patterns
- Identifying shared Rust primitives between AnF and ThingsBook
- Harvesting audio engines, TTS drivers, UI patterns

### Track 2: Competitive & REA Analysis
- Analyzing Siri, Google Assistant, Alexa, Copilot, Mycroft/OVOS
- Studying ElevenReader, Spotify, Raycast, Readwise Reader, KOReader
- Extracting state machines, triggers, shortcuts, edge-case rules

### Track 3: AnF Full-Stack Execution
- Rust core, Tauri IPC, glassmorphic UI/UX
- Voice/TTS/audio pipelines, offline indexing
- Windows/Android cross-platform parity

### Track 4: ThingsBook Full-Stack Execution
- Reading & narration domain
- Library management, sync, cross-book search
- Voice-activated features, smart shelves

---

## REA Findings
*To be populated as analysis progresses*

---

## Adversarial QA Log
*To be populated as stress tests run*

---

## Cross-Pollination Opportunities
*To be populated as shared primitives are identified*
