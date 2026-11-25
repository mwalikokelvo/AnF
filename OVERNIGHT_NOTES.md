# AnF & ThingsBook Overnight Engineering Log

**Started:** 2026-11-24 Evening
**Mandate:** Exhaustive full-stack capability expansion, architectural hardening, and UX elevation (Real Rust + Tauri/Core + TypeScript/Vite UI — zero standalone JS mocks)

---

## Morning Coffee Triage

### Branches Shipped (all local — nothing pushed to `main`)
| Repo | Branch | Rust Modules + UI Views Added | Verification |
|------|--------|-------------------------------|--------------|
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
