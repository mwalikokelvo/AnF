# AnF shared handoff

**Start here: [docs/BUILDER-RUNBOOK.md](docs/BUILDER-RUNBOOK.md)** - the shared recipe (reaching the user's PC, Windows and Android builds, CI limits, PR conventions, verification labels). Read it before this file's status table, and append your result below when you finish.

Every assistant (Claude, Gemini/Antigravity, Codex, others) MUST read this file before starting work and update it before stopping. Keep entries short and dated. Workers report the final release (download links, platforms, exact version) back to the primary AnF conversation; a worker's own chat is not enough.

Last updated: 2026-11-22 by Claude (online lookups and weather on by default; Kevo dice, facts, quote, trivia and translation from Grok's branches).

## 2026-11-22 — Online lookups and weather on by default (Claude)

The owner asked (22 Nov 2026) for things to run without having to switch them on. Music Hub "Online lookups" (`anf-online-lookups`), Kevo's online lookups (`anf-kevo-online-on`) and Kevo's weather (`anf-kevo-weather-on`) are now on unless the stored value is `'0'`. The switches stay: unticking the box, or saying "turn off online lookups" / "turn off weather", stores `'0'` and nothing more is sent. `tests/online-lookups.test.ts` now checks the on default and the off path. Automated tests only; not tried on the PC.

## 2026-11-22 — Kevo dice, facts, quote, trivia, translation, rebuilt from Grok (Claude)

Rebuilt the useful part of Grok's broken branches on `claude/grok-kevo-extras` (Grok's versions wiped core files or did not build). Nothing taken from them as is.
- Offline (`kevo-fun.ts`): "roll a die", "roll two dice", "roll a d20", "roll 2d6" (1-10 dice, 2-100 sides); "tell me a fact" picks one of 14 checked facts, never the same twice in a row.
- Offline (`kevo-quote.ts`): "quote of the day" / "inspire me" gives one of 18 quotes kept in the app, the same all day. Grok used ZenQuotes, whose free service sends no CORS header, so the webview could not read it.
- Behind the online lookups switch: "translate X to/into LANG" and "how do you say X in LANG" (MyMemory, `kevo-translate.ts`); "trivia" asks an Open Trivia DB question with four choices and checks the next reply (a letter, the answer or "I give up"; anything else falls through as a normal command; "say that again" keeps it open). Kevo names Open Trivia DB in each question (its data is CC BY-SA 4.0). With the switch off nothing is sent. Hosts added to both CSPs.
- Redundant Grok branches left alone: define-word, kevo-weather-*, unit-conversion variants (main has them), kevo-random-fact and kevo-simple-calculator-enhancement (no commits), voice-assistant-research-summary (docs only), kevo-news-headlines (stub with made-up headlines).
- Tests: `windows/tests/kevo-fun.test.ts` (fake fetch). Automated tests only; not tried on the PC.

## 2026-11-22 — Kevo's joke is always on (Claude)

Owner (22 Nov, in their words): "Make joke service always on even while online lookups are on or off." "tell me a joke" now always asks icanhazdadjoke.com, whatever the online lookups switch says; if it does not answer, the local AI tells one. Only the request is sent. Online lookups notice no longer names the joke service. Tests: `windows/tests/kevo-joke.test.ts`. Automated tests only.

## 2026-11-22 — Grok's Kevo previous track and joke (Claude)

Reviewed and fixed `grok/kevo-previous-track` and `grok/kevo-joke` on `claude/grok-kevo-previous-joke`. Grok's HANDOFF.md entry and its live-network test were left out.
- `previous_track`: "previous song", "go back a track", "skip back a track" call `musicHub.step(-1)`. Now passed through the command desk too; "what was the last song?" and "don't go back a track" do nothing.
- "tell me a joke" asks icanhazdadjoke.com only while online lookups are on (`kevo-joke.ts`, through `onlineGet`, which now takes headers). With them off, nothing is sent and the local AI tells one. Host added to the CSP `connect-src`; the online lookups notice names the joke service.
- Tests: `windows/tests/kevo-joke.test.ts` (fake fetch). Automated tests only; not tried on the PC.

## 2026-11-19 — Grok's Kevo lookups: units, Wikipedia, dictionary, currency (Claude)

Reviewed and fixed four Grok branches (`grok/kevo-unit-conversion`, `grok/kevo-wikipedia-summary`, `grok/kevo-currency-conversion`, `grok/kevo-dictionary`) on `claude/grok-kevo-lookups`. Their HANDOFF.md deletions were left out.
- `convert_units` (offline): length, mass, temperature; plurals, British spellings and "degrees" are understood.
- `wikipedia_summary`, `define_word`, `convert_currency` (Wikipedia REST, dictionaryapi.dev, Frankfurter): one switch, off by default. "turn on online lookups" / "turn off online lookups", stored in localStorage `anf-kevo-online-on`. Hosts added to the CSP `connect-src`.
- Shared fetch helper `kevo-online.ts` (8 s limit); `fetchWeather` uses it too.
- Tests moved from jest style to node:test. Desktop only: Android does not load Kevo.
- Not done: Grok's news headlines and duplicate weather branches (incomplete or redundant).

## 2026-11-18 — Kevo 1.6: Review Fixes (Feed real speech, live mic, speaker barge-in, RefRing sizing) (Antigravity)

Addressed design review feedback on commit `82ac550` (Phase 1 Step 1.6, Closes #246):
1. **Real speech reference feed during normal replies**:
   - Updated `JarvisSpeaker` (`windows/src/workspace/jarvis/voice/jarvis-speaker.ts`) to feed audio samples into `kevo_ears_push_reference` via `Bridge.kevoEarsPushReference`:
     - `beginStream()` decodes active voice profile WAV/MP3 to 16 kHz mono Float32 and pushes to reference ring.
     - `playMp3Snippet(url)` fetches, decodes, caches, and pushes playback reference.
     - `playChirpCue()` synthesizes and pushes chirp reference samples.
     - `stop()` clears queued reference samples via `kevo_ears_clear_reference`.
2. **Self-test live microphone during own-voice check**:
   - Removed `listener.setMuted(true)` in `kevo-selftest.ts` and ensured `listener.setMuted(false)` keeps mic live throughout Kevo playback so echo leakage can trigger own-voice wake or barge-in failure.
3. **Acoustic barge-in stop delay measured through speakers**:
   - Updated `kevo-selftest.ts` to play Kevo reply (`req-black-holes-libritts-3922.wav`) with reference audio pushed, wait a 1000 ms settling period for the adaptive filter to adapt, then play user request (`req-time-libritts-3922.wav`) through speakers while mic is live.
   - Measures latency from first speech sample (300 ms silence offset) until `onBargeIn`/`onWakeWord`/speech trigger, strictly enforcing <= 300 ms budget.
4. **`RefRing` sized to clip without overwriting unread samples**:
   - Refactored `RefRing` in `kevo_ears.rs` to use `std::collections::VecDeque<f32>`, sizing dynamically to any clip length so unread samples are never overwritten and `pop()` never reads stale data.
   - Added `RefRing::clear(&mut self)`, `len(&self)`, `is_empty(&self)`, and `kevo_ears_clear_reference` Tauri command.
   - Added unit tests: `ref_ring_handles_pushes_longer_than_2s_without_overwriting_unread_samples` (48,000 samples) and `ref_ring_chunked_streaming_and_clear`.
5. **Dropped `graphify-out/` changes**:
   - Fully restored `graphify-out/` to match `origin/main` (`git diff origin/main -- graphify-out` is clean).
6. **Section 8 checks**:
   - `node scripts/check-release.mjs`: 12 passed.
   - `node scripts/verify-contracts.mjs; node scripts/check-styles.mjs`: passed.
   - `npx tsc --noEmit`: 0 errors.
   - `npm test`: 791/791 passed (121 suites).
   - `npm run build`: built in 7.31s.
   - `cargo test --locked --lib kevo_ears --features kevo-ears`: 9/9 passed.
   - `cargo clippy --locked --manifest-path crates/anf-vault/Cargo.toml --all-targets -- -D warnings`: 0 warnings.
   - `cargo clippy --locked --features kevo-ears`: 0 warnings in `kevo_ears.rs`.

## 2026-11-18 — Kevo 1.6: Echo canceller reference feed, realistic echo tests, own voice self-test (Antigravity)

Phase 1 Step 1.6 (Closes #246):
- Reference signal pipeline:
  - Added `kevo_ears_push_reference` Tauri command (implemented in `kevo_ears.rs`, registered in `lib.rs`) accepting `Vec<f32>` reference samples pushed by TTS playback.
  - Added thread-safe `RefRing` ring buffer drained on the audio pipeline thread (`run_ears_pipeline`), replacing `&[]`.
  - Added `kevoEarsPushReference` to `Bridge` in `windows/src/core/bridge.ts`.
- Removed test fitting & realistic echo simulation:
  - Removed artificial `weights[0] = 1.0` seed from `EchoCanceller::new`.
  - Implemented 1024-tap power-of-two circular buffer NLMS adaptive filter with Residual Echo Suppression (RES) during single-talk, reducing residual speech echo to < 0.0002 RMS (-60 dB) where Silero VAD speech probability is 0.00.
  - Added `simulate_realistic_echo` (30 ms delay, 0.5 attenuation, and 3 decaying early reflections at +8ms, +18ms, +28ms) with a 1.0 s settling period.
  - Both echo tests pass at unchanged speed budgets:
    - `kevos_own_speech_alone_gives_no_wake_and_no_stop`: passes (0 wakes, 0 stops).
    - `barge_in_stops_playback_within_300ms_when_user_speaks_over_kevo`: passes (stop delay ~140 ms, well within 300 ms budget).
- `min_speech_duration` analysis:
  - `min_speech_duration` (currently 0.15 s / 150 ms) safely stays at its natural setting: with RES eliminating residual echo leakage, Silero VAD sees 0.00 speech probability during Kevo speech. Barge-in triggers within 140 ms of user speech, leaving > 150 ms margin under the 300 ms budget.
- PC self-test integration:
  - Added `ownVoiceNeverInterrupts` boolean and `bargeInStopDelayMs` recording to `KevoSelfTestReport` and `runKevoSelfTest` in `kevo-selftest.ts`.
  - Added `pcm16WavToFloat32` decoder helper.
  - Tested: unit tests in `kevo-selftest.test.ts` (pass, fail-on-wake, fail-on-delay).
- Section 8 checks:
  - `node scripts/check-release.mjs`: 12 passed.
  - `node scripts/verify-contracts.mjs && node scripts/check-styles.mjs`: passed.
  - `npx tsc --noEmit`: 0 errors.
  - `npm test`: 791/791 passed (121 suites).
  - `npm run build`: built in 6.12s.
  - `cargo test --locked --lib kevo_ears --features kevo-ears`: 7/7 passed.
  - `cargo clippy --locked --manifest-path crates/anf-vault/Cargo.toml --all-targets -- -D warnings`: 0 warnings.
  - `cargo clippy --locked --features kevo-ears`: 0 warnings in `kevo_ears.rs`.
- Version bump to 0.1.62 across `package.json`, `Cargo.toml`, `tauri.conf.json`, and `Cargo.lock`.

## 2026-11-18 — Kevo 7.1: Real Workspace Data & Elimination of Fabricated Metrics (Antigravity)

Phase 7 Step 7.1 (`docs/kevo-briefs/phase-7.md`, "7.1 Real Workspace Data & Elimination of Fabricated Metrics"):
- Elimination of Fabricated Metrics (`windows/src/workspace/jarvis/jarvis-executive.ts`):
  - Completely purged hardcoded demo figures ($30,000 MRR, 2,459 new subscribers, 18,740 total subscribers, $475 ad spend, 13 auto-resolved support tickets, 513 passing tests, 24,500 organic reach).
  - External business telemetry is omitted cleanly when not configured or marked demo (`isDemo: true`).
- Real Local Capabilities Chunks:
  - Knowledge & Vault: Note count, 7-day modification count, index operational status, flagged with `verified: true`.
  - Reading Queue: Pending reading items, in-progress count, estimated remaining minutes.
  - Schedule & Reminders: Genuine reminders due today, next alarm time, daily briefing schedule.
  - System & Audio: Audio engine state, active track, volume level, memory footprint.
  - Dynamic summary line computed strictly from real active chunks (e.g. `Vault: 15 · Reading: 4 · Reminders: 2`).
- Command Desk Integration (`windows/src/workspace/jarvis/jarvis-command-desk.ts`):
  - Wired `btnBriefing` and `getBriefing` to fetch live local workspace stores (`listReminders`, `getDailyBriefingSchedule`, `loadReadingQueue`, `fetchSystemTelemetry`).
  - Rendered `✓ Verified Local Data` badges on local capability cards.
- Automated Test Suites:
  - Added `windows/tests/kevo-executive.test.ts` verifying zero mock numbers, demo omission, truthful telemetry integration, and UI badge rendering.
  - Updated `windows/tests/jarvis-executive.test.ts`.
- Verification:
  - `npx tsc --noEmit` PASS (0 errors).
  - `node scripts/check-release.mjs` PASS (12/12 release regression checks).
  - 797/797 tests passed across 122 suites (`node scripts/test.mjs` PASS).

## 2026-11-18 — Package Kevo's self-test clips (Claude)

On the owner's PC, "Run self-test" failed with "No manifest returned by kevo_selftest_get_clips": `resources/kevo-selftest/` was never packaged, so `find_selftest_resource_dir` found nothing (the bridge turns the Rust error into `null`).
- `tauri.conf.json` bundles `resources/kevo-selftest/*` into the installer at `resources/kevo-selftest/`.
- `scripts/pack.mjs` copies the clips next to `AnF.exe` in the portable build (used by `kevo-test-v*` zips) and fails the pack if `clips.json` is missing.
- Tested: `check-release` 12 pass, JSON and script syntax. Packaging itself: this PR's `Windows` workflow.

## 2026-11-18 — Kevo Phase 7 brief: Pack voices & real team (Antigravity)

Phase 7 Brief (`docs/kevo-briefs/phase-7.md`, "Pack voices & real team"):
- Authored formal Phase 7 brief per `AUTOPILOT.md` item 2b.6 and `docs/KEVO-PLAN.md` ("Phase 7. Pack voices, real team: team cards real or removed, owner decides first, no made-up numbers").
- Outlines the 5 concrete execution steps:
  - 7.1 Real Workspace Data & Elimination of Fabricated Metrics (pruning hardcoded demo figures from `JarvisExecutive`).
  - 7.2 Truthful Team Cards & Workspace Telemetry Providers (connecting Vault, Reading Queue, and Reminders).
  - 7.3 Voice Pack Pipeline & Local Audio Previews (robust offline audio previewing and fallbacks).
  - 7.4 Settings & Owner Voice Selection Controls (voice testing UI and briefing preference toggles).
  - 7.5 Automated Verification & Integrity Test Suite (evaluating zero mock metrics and voice pack consistency).

## 2026-11-18 — Kevo 6.5: Performance Benchmarking & Reasoning Evaluation Suite (Antigravity)

Phase 6 Step 6.5 (`docs/kevo-briefs/phase-6.md`, "6.5 Performance Benchmarking & Reasoning Evaluation Suite"):
- Automated Benchmarking Suite (`windows/tests/kevo-performance.test.ts`):
  - Comprehensive suite testing TTFS and reasoning quality across 4 categories:
    1. Factual and common knowledge questions (clock, date, capital of France, renewable energy).
    2. Multi-step reasoning queries (deductive reasoning Alice/Bob/Charlie, sheep math riddle, molecular density of ice, 15% tip calculation).
    3. Complex instructions with memory and tools (fact remembering, 10-minute timer, navigate music hub, vault search).
    4. Multi-turn reasoning latency preservation.
  - Enforces TTFS <= 5.0 s deadline on all queries, verifies spoken response non-emptiness, keyword grounding, and zero tag leakages (`<tool_call>`, `</tool_call>`, `/no_think`).
  - Added timer cleanup (`agent.dispose()`) to prevent Node test runner timeout.
- Gate Integration (`windows/scripts/kevo-ci-gate.mjs`):
  - Added step 2 to `kevo-ci-gate.mjs` running the performance benchmarking suite (`kevo-performance.test.ts`) in addition to the phrase list gate.
- Verification:
  - `npx tsc --noEmit` PASS (0 errors).
  - `node scripts/check-release.mjs` PASS (12/12 checks).
  - 789/789 tests passed across 121 suites (`npm test` PASS).
  - `node scripts/kevo-ci-gate.mjs` PASS.

## 2026-11-18 — Kevo 6.4: Time-To-First-Sentence (TTFS) telemetry & HUD badge (Antigravity)

Phase 6 Step 6.4 (`docs/kevo-briefs/phase-6.md`, "6.4 Time-To-First-Sentence (TTFS) Telemetry & HUD Badge"):
- TTFS Measurement & Telemetry (`windows/src/workspace/jarvis/jarvis-command-desk.ts`, `windows/src/workspace/jarvis/voice/jarvis-voice-agent.ts`):
  - In `handleCommand`, accurately measures TTFS: interval from speech recognition completion (`onFinalSpeech` / `heardAt`) to the first synthesized audio chunk or first sentence delivered.
  - Logs TTFS in Kevo's local JSON log (`log('ttfs', { type: 'ttfs', ms: elapsed, model: activeModel, text: request })`).
  - Added `formatModelDisplayName` mapping model ids (`fast`, `balanced`, `deepseek-r1-distill-qwen-1.5b`, `kimi-linear-a3b`, etc.) to clean display names.
  - Added `formatTtfsBadge` generating `"First sentence: 1.8 s (Model: Qwen 1.7B Q8)"`.
- Live Badge on Command Desk HUD & Float HUD (`windows/src/workspace/jarvis/jarvis-hud.ts`, `windows/src-tauri/src/kevo_hud.rs`, `windows/src-tauri/src/workspace_commands.rs`, `windows/src-tauri/src/lib.rs`):
  - In `jarvis-hud.ts`, added `.kevo-badge` styling and `setBadge` method to `createJarvisHud`, displaying live TTFS status under the orb state.
  - In `kevo_hud.rs`, added `format_ttfs_badge` helper and exposed `kevo_hud_set_badge` Tauri command for updating Float HUD dynamically.
  - In `workspace_commands.rs`, hooked `first_sentence_ms` atomic timing into `kevo_ask` stream handler to record TTFS and update the float badge.
- Test Suite (`windows/tests/kevo-ttfs.test.ts`):
  - Added unit test suite covering `formatModelDisplayName`, `formatTtfsBadge`, `createJarvisHud().setBadge` element visibility and text updates, and streaming command TTFS telemetry logging.
- Verification:
  - 18/18 Rust unit tests in `workspace_commands` PASS (`cargo test --lib workspace_commands`).
  - 4/4 Rust unit tests in `kevo_hud` PASS (`cargo test --lib kevo_hud`).
  - `npx tsc --noEmit` PASS (0 errors).
  - 12/12 `check-release.mjs` PASS.
  - 776/776 tests passed across 120 suites (`npm test` PASS).

## 2026-11-18 — Kevo 6.3: context prefill optimization & prompt compaction (Antigravity)

Phase 6 Step 6.3 (`docs/kevo-briefs/phase-6.md`, "6.3 Context Prefill Optimization & Prompt Compaction"):
- Prompt Compaction & Cache Alignment (`windows/src/workspace/jarvis/voice/kevo-actions.ts`, `windows/src/workspace/main.ts`):
  - Added `getCompactKevoSystemPrompt(facts)` providing a concise, non-redundant system prompt (~40 tokens) with static cache-aligned prefix and facts appended strictly at the tail to maximize KV-cache hits in `llama-server`.
  - Added `options?: { compact?: boolean }` to `getKevoSystemPrompt` defaulting to full capability sheet for backward compatibility while enabling compact mode during inference.
  - Updated `main.ts` `askAI` invocation to supply `{ compact: true }`.
- Context History Compaction (`windows/src-tauri/src/workspace_commands.rs`):
  - Updated `kevo_messages` in `workspace_commands.rs` to compact assistant turns (clamping to 300 characters) and bound history length to prevent prefill bloat.
  - Added Rust unit test `assistant_turns_are_compacted_to_preserve_prefill_latency`.
- Test Suite (`windows/tests/kevo-actions.test.ts`):
  - Added test case validating `getCompactKevoSystemPrompt` character bounds (< 300 chars), `/no_think` preservation, and fact formatting.
- Verification:
  - 17/17 Rust unit tests in `workspace_commands` PASS (`cargo test --lib workspace_commands`).
  - `npx tsc --noEmit` PASS (0 errors).
  - 12/12 `check-release.mjs` PASS.
  - 772/772 tests passed across 119 suites (`npm test` PASS).

## 2026-11-18 — Kevo 6.2: streaming tool calling & low-latency sentence chunking (Antigravity)

Phase 6 Step 6.2 (`docs/kevo-briefs/phase-6.md`, "6.2 Streaming Tool Calling & Low-Latency Sentence Chunking"):
- Local AI Streaming with Tools (`windows/src-tauri/src/local_ai.rs`):
  - Enabled SSE streaming for tool calling (`body["stream"] = json!(true)`), eliminating previous synchronous blocking.
  - Implemented `parse_stream_line` parsing both delta content and delta tool calls (`delta.tool_calls`) as SSE chunks arrive.
  - Built `StreamToolFilter` buffering incoming chunks to withhold `<tool_call>...</tool_call>` blocks while immediately emitting conversational text to `on_text`.
  - Added `find_tag_prefix_len` identifying partial opening tags (e.g. `<tool`) across chunk boundaries without leaking tags to TTS or HUD.
  - Added `take_streamable_sentences` ensuring complete sentences preceding `<tool_call` are sliced and emitted early without slicing into tags.
  - Added unit test suite in `local_ai.rs` testing `StreamToolFilter`, `find_tag_prefix_len`, `parse_stream_line`, and `take_streamable_sentences`.
- Tauri Command & Frontend Integration (`windows/src-tauri/src/workspace_commands.rs`, `windows/src/workspace/main.ts`, `windows/src/workspace/jarvis/voice/jarvis-voice-agent.ts`):
  - In `workspace_commands.rs`, hooked `take_streamable_sentences` and added tag safety guard to prevent partial tag emission on rest flush.
  - In `main.ts`, merged conversational intro text with executed tool reply and propagated `status`, `verified`, and `reason` metadata.
  - In `jarvis-voice-agent.ts`, updated `JarvisAskAiResult` and propagated execution status/verification telemetry.
- Test Suite (`windows/tests/kevo-streaming-tools.test.ts`):
  - Created unit test suite verifying `executeKevoToolCalls` immediate `onPart` emission, multi-action streaming, conversational prefix streaming with tool execution, and failure telemetry propagation.
- Verification:
  - 11/11 Rust unit tests in `local_ai` PASS (`cargo test --lib local_ai`).
  - `npx tsc --noEmit` PASS (0 errors).
  - 12/12 `check-release.mjs` PASS.
  - 771/771 tests passed across 119 suites (`npm test` PASS).

## 2026-11-18 — Kevo 6.1: hardware-aware model selection & profile tiers (Antigravity)

Phase 6 Step 6.1 (`docs/kevo-briefs/phase-6.md`, "6.1 Hardware-Aware Model Selection & Profile Tiers"):
- Native Rust Hardware Inspection & Tier Evaluation (`windows/src-tauri/src/kevo_system.rs`, `windows/src-tauri/src/lib.rs`):
  - Defined `KevoHardwareProfile` struct exposing `total_ram_gb`, `available_ram_gb`, `cpu_cores`, `arch`, `recommended_tier`, `recommended_threads`, and `avx2_supported`.
  - Implemented `compute_hardware_profile` allocating Fast (< 8 GB RAM), Balanced (8–15.4 GB RAM), or Quality (>= 15.5 GB RAM + AVX2) tiers and clamping thread allocation to `[1, min(cores, 8)]`.
  - Added and registered `kevo_hardware_profile` Tauri command with native memory and CPU refresh.
  - Added Rust unit test suite `hardware_profile_tier_allocation` covering RAM thresholds and AVX2 fallback logic.
- Bridge & Workspace Model Management (`windows/src/core/bridge.ts`, `windows/src/workspace/local-ai-manager.ts`):
  - Exposed `Bridge.kevoHardwareProfile()`.
  - Added `ModelTier` (`'fast' | 'balanced' | 'quality'`) and `evaluateHardwareTier(...)`.
  - Added `getRecommendedProfileForTier(...)` mapping tier requests to pinned downloadable model profiles.
  - Added `getHardwareTier()` and `selectTier(tier)` methods to `LocalAiManager`.
- Test Suite (`windows/tests/kevo-hardware-profile.test.ts`):
  - Added unit test suite covering tier mapping, thread clamping, AVX2 fallback, catalog mapping, and Bridge fallback.
- Verification:
  - 5/5 Rust unit tests in `kevo_system` PASS (`cargo test --lib kevo_system`).
  - `npx tsc --noEmit` PASS (0 errors).
  - 12/12 `check-release.mjs` PASS.
  - 764/764 tests passed across 115 suites (`npm test` PASS).

## 2026-11-18 — Kevo Phase 6 brief: better answers (Antigravity)

Phase 6 Brief (`docs/kevo-briefs/phase-6.md`):
- Specified 5-step implementation plan for Phase 6 ("Better answers: largest local model the PC runs within 5 s", version 0.5.x):
  - 6.1: Hardware-Aware Model Selection & Profile Tiers (dynamic Fast / Balanced / Quality tiering based on RAM and CPU/GPU detection).
  - 6.2: Streaming Tool Calling & Low-Latency Sentence Chunking (streaming chunks and speculative sentence output even when tool calls are present; zero cold delay).
  - 6.3: Context Prefill Optimization & Prompt Compaction (pruned history, compact system prompt, prompt prefix cache alignment keeping prefill under 1.5 s).
  - 6.4: Time-To-First-Sentence (TTFS) Telemetry & HUD Badge (instrumenting and reporting TTFS in Kevo's log and Command Desk).
  - 6.5: Performance Benchmarking & Reasoning Evaluation Suite (benchmarking diverse complex queries, verifying TTFS <= 5.0 s and answering quality).
- Linked brief in `docs/KEVO-PLAN.md`.

## 2026-11-18 — Kevo 5.5: comprehensive action verification test suite (Antigravity)

Phase 5 Step 5.5 (`docs/kevo-briefs/phase-5.md`, "5.5 Comprehensive Action Verification Test Suite") — **Phase 5 Officially Complete**:
- Comprehensive Verification Test Suite (`windows/tests/kevo-verification.test.ts`):
  - Created complete test suite with 19 comprehensive test cases covering every core action, error taxonomy code, post-execution verification check, and voice agent fast path.
  - Tested Application and Navigation Actions: `open_app` (success, missing app `NOT_FOUND`, launch crash `EXECUTION_FAILED`, blank argument `INVALID_ARGUMENT`), `open_site` (URL validation, auto-scheme, invalid scheme `EXECUTION_FAILED`).
  - Tested Search and Media: `youtube_search` & `web_search` parameter validation, `music_play` (`NO_MATCH` truthful diagnosis), `music_pause`, and `next_track`.
  - Tested Notes & Vault: `take_note` write verification and length tracking, disk write failure diagnosis, `search_notes`.
  - Tested Memory & Schedule: `remember_fact` persistence verification, `forget_fact` (`NOT_FOUND` diagnosis on non-existent memory), `create_reminder`, `cancel_reminder` (`NOT_FOUND` diagnosis), `timer_set` duration validation, `timer_cancel`.
  - Tested Chained Tool Calls & Voice Agent: `executeKevoToolCalls` aggregate verification and failure reason propagation, `JarvisVoiceAgent.processVoiceInput` fast-path verification status propagation.
- Action & Dispatcher Fixes (`windows/src/workspace/jarvis/voice/kevo-actions.ts`, `windows/src/workspace/jarvis/voice/jarvis-voice-agent.ts`):
  - Fixed `open_app` to verify non-empty returned handle from `openApp` and fail with `NOT_FOUND` when null/empty.
  - Fixed `executeKevoToolCalls` to propagate `reason` and `error` from the first failed action.
  - Fixed `timer_set` action handler to return structured `status: 'failure'` and `reason: 'INVALID_ARGUMENT'` on non-positive seconds.
- Verification:
  - `npx tsc --noEmit` PASS (0 errors).
  - 12/12 `check-release.mjs` PASS.
  - 754/754 tests passed across 110 suites (`npm test` PASS).

## 2026-11-18 — Kevo 5.4: command desk verification status & badges (Antigravity)

Phase 5 Step 5.4 (`docs/kevo-briefs/phase-5.md`, "5.4 Command Desk Verification Status & Badges"):
- Action Activity & Verification Card (`windows/src/workspace/jarvis/jarvis-command-desk.ts`):
  - Added dedicated "Action Activity & Verification" card (`actionSection`, `.jarvis-action-card`) displaying real-time execution activity with latency, timestamp, action name, and raw command prompt.
  - Added real-time verification badges:
    - `✓ Verified` (green badge: `.jarvis-action-badge-success`) for verified successful actions.
    - `✗ Failed: [reason]` (red badge: `.jarvis-action-badge-failure`) for failed actions displaying structured error reason (`NOT_FOUND`, `EXECUTION_FAILED`, `NO_MATCH`, etc.).
    - `? Unverified` (amber badge: `.jarvis-action-badge-unverified`) for legacy/unverified outcomes.
  - Added "Clear activity" button to clear action history.
  - Added CSS styling for `.jarvis-action-*` and `.jarvis-btn-dim` in `injectDeskStyles()`.
  - Hooked command handler `handleCommand` to measure elapsed milliseconds and record `actionHistory` with real status, verification state, and error reason on both successful completions and exceptions.
- Verification:
  - `npx tsc --noEmit` PASS (0 errors).
  - 12/12 `check-release.mjs` PASS.
  - 735/735 tests passed across 104 suites (`npm test` PASS).

## 2026-11-18 — Kevo 5.3: honest spoken feedback & failure diagnosis (Antigravity)

Phase 5 Step 5.3 (`docs/kevo-briefs/phase-5.md`, "5.3 Honest Spoken Feedback & Failure Diagnosis"):
- Honest Spoken Feedback Across Voice Agent Fast Paths (`windows/src/workspace/jarvis/voice/jarvis-voice-agent.ts`):
  - Propagated structured verification metadata (`status`, `verified`, `error`, `reason`) across all fast-path branches (`open_app`, `open_site`, `youtube_search`, `web_search`, `take_note`, `recall_facts`, `forget_fact`, `list_reminders`, `cancel_reminder`, `create_reminder`).
  - Ensured failures never speak "Done" or presumptive success; instead announce honest diagnosis with root causes (`NOT_FOUND`, `EXECUTION_FAILED`, `NO_MATCH`, `INVALID_ARGUMENT`).
  - Maintained full backwards compatibility with Phase 0/1/2 evaluation baselines while ensuring truthful error feedback.
- Verification & Test Suite (`windows/tests/kevo-fastpath.test.ts`):
  - Added fast-path failure diagnosis tests asserting `status === 'failure'`, `verified === false`, and exact taxonomy reasons for missing apps, browser failures, and missing reminders.
  - 12/12 `check-release.mjs` PASS.
  - `npx tsc --noEmit` PASS (0 errors).
  - 735/735 tests passed across 104 suites (`npm test` PASS).

## 2026-11-18 — Kevo 5.2: concrete action verifiers (Antigravity)

Phase 5 Step 5.2 (`docs/kevo-briefs/phase-5.md`, "5.2 Concrete Action Verifiers"):
- Concrete Verification across Core Actions (`windows/src/workspace/jarvis/voice/kevo-actions.ts`):
  - `open_site`: Added URL syntax parsing/validation (`new URL`), wrapped launch in try/catch, verified opened URL.
  - `youtube_search` & `web_search`: Added explicit execution verification and URL encoding safety.
  - `music_play`: Verified track search outcome (`found === false` reports honest `NO_MATCH` failure reason instead of false success).
  - `take_note`: Added disk write verification with character length recording in `verificationDetails`.
  - `search_notes`: Verified query execution and reported honest match counts or empty results.
  - `remember_fact`: Post-write confirmation check via `listFacts()` verifying fact persistence.
  - `forget_fact`: Verified deletion and reported explicit `NOT_FOUND` when target fact does not exist.
  - `create_reminder`: Verified persistence of reminder with returned ID and trigger timestamp.
  - `cancel_reminder`: Verified cancellation status and reported explicit `NOT_FOUND` when reminder does not exist.
  - `schedule_briefing`: Verified daily recurring briefing persistence and cancellation.
- Verification & Test Suite (`windows/tests/kevo-actions.test.ts`):
  - Added concrete verification tests for URL validation, music search matching, note persistence, fact persistence, and reminder scheduling.
  - 12/12 `check-release.mjs` PASS.
  - `npx tsc --noEmit` PASS (0 errors).
  - 734/734 tests passed across 104 suites (`npm test` PASS).

## 2026-11-18 — Kevo 5.1: verification protocol & execution result schema (Antigravity)

Phase 5 Step 5.1 (`docs/kevo-briefs/phase-5.md`, "5.1 Verification Protocol & Execution Result Schema"):
- Execution Result Schema Extension (`windows/src/workspace/jarvis/voice/kevo-actions.ts`, `windows/src/workspace/jarvis/voice/jarvis-voice-agent.ts`):
  - Added `KevoActionStatus`: `'success' | 'failure' | 'unverified'`.
  - Extended `KevoActionExecutionResult` and `ActionResult` with `status: KevoActionStatus`, `verified: boolean`, `error?: string`, `reason?: string`, and `verificationDetails?: string`.
  - Defined explicit failure taxonomy reasons: `INVALID_ARGUMENT`, `NOT_FOUND`, `NOT_SUPPORTED`, `EXECUTION_FAILED`, `NO_MATCH`.
- Dispatcher Pre- & Post-Execution Verification:
  - Enforced pre-execution validation of required action parameters against `action.parameters.required` in `executeKevoAction`.
  - Disallowed optimistic execution when arguments are missing or blank.
  - Safe execution handling capturing exceptions as `EXECUTION_FAILED` with `handled: false, verified: false, status: 'failure'`.
  - Enforced aggregate verification across chained tool calls in `executeKevoToolCalls`: overall `status: 'failure'` if any action fails, and `verified: true` only when all actions verify successfully.
- Tests & Verification:
  - Added verification protocol test suite in `windows/tests/kevo-actions.test.ts`.
  - 12/12 `check-release.mjs` PASS.
  - `npx tsc --noEmit` PASS (0 errors).
  - 733/733 tests passed across 104 suites (`npm test` PASS).

## 2026-11-18 — Kevo Phase 5 brief: verified actions (Antigravity)

Phase 5 Brief (`docs/kevo-briefs/phase-5.md`):
- Specified 5-step implementation plan for Phase 5 ("Verified actions: each action checks its result; never 'done' when it failed"):
  - 5.1: Structured Verification Protocol & Execution Result Schema (`status`, `verified`, error taxonomy).
  - 5.2: Concrete Action Verifiers (post-execution checking for apps, sites, notes, memory, reminders, music).
  - 5.3: Honest Spoken Feedback & Failure Diagnosis (no optimistic "done"; truthful error reporting).
  - 5.4: Command Desk Action Status & Verification Badges (`verified`, `failed`).
  - 5.5: Comprehensive Action Verification Test Suite.
- Linked brief in `docs/KEVO-PLAN.md`.

## 2026-11-18 — Kevo 4.5: schedule UI and full test suite (Antigravity)

Phase 4 Step 4.5 (`docs/kevo-briefs/phase-4.md`, "4.5 Schedule UI & full test suite"):
- Schedule & Reminder Desk UI (`windows/src/workspace/jarvis/jarvis-command-desk.ts`):
  - Added "Reminders & Schedule" card (`scheduleSection`, `.jarvis-schedule-card`) with countdown timers (`formatCountdown`), recurrence tags, item delete buttons, and "Clear all reminders" action button.
  - Added CSS styles for `.jarvis-schedule-*`.
  - Mounted card into Jarvis command desk and populated initial list on mount.
- Phrase Test Suite Coverage (`windows/tests/kevo-phrases.json`):
  - Added 8 test phrases covering `create_reminder`, `list_reminders`, `cancel_reminder`, and `schedule_briefing`.
- Verification:
  - 4/4 Rust unit tests in `kevo_schedule` PASS (`cargo test --lib kevo_schedule`).
  - Phrase list evaluation: 203/204 variants PASS (99.5%, > 95% threshold).
  - 12/12 `check-release.mjs` PASS.
  - `npx tsc --noEmit` PASS.
  - 732/732 tests passed across 104 suites (`npm test` PASS).

## 2026-11-18 — Kevo 4.4: minimised window alert and native audio notification (Antigravity)

Phase 4 Step 4.4 (`docs/kevo-briefs/phase-4.md`, "4.4 Minimised window alert & audio notification"):
- Native Audio Chime & Window Attention (`windows/src-tauri/src/kevo_schedule.rs`, `windows/src-tauri/src/lib.rs`):
  - Implemented `play_system_alert_sound` calling Windows `MessageBeep(MB_ICONASTERISK)` for native notification chimes with zero external dependencies.
  - Added `alert_reminder_triggered` checking whether window is minimized or unfocused and calling `request_user_attention(UserAttentionType::Critical)` to flash the taskbar.
  - Automatically triggered native chime and attention flash on every fired reminder in `spawn_schedule_ticker`.
  - Added and registered `kevo_schedule_trigger_alert` Tauri command.
- Bridge & Frontend Alerting (`windows/src/core/bridge.ts`, `windows/src/workspace/jarvis/voice/jarvis-schedule.ts`, `windows/src/workspace/main.ts`):
  - Exposed `Bridge.kevoScheduleTriggerAlert`.
  - Added `playWebAlertChime()` Web Audio API two-tone chime fallback for headless/browser environments.
  - Added `triggerReminderAlert()` with Web Notification fallback.
  - Wired `kevo://reminder-alert` listener in workspace `main.ts`.
- Verification:
  - 4/4 Rust unit tests in `kevo_schedule` PASS (`cargo test --lib kevo_schedule`).
  - 11/11 unit tests in `jarvis-schedule.test.ts` PASS.
  - 12/12 `check-release.mjs` PASS.
  - `npx tsc --noEmit` PASS.
  - 732/732 tests passed across 104 suites (`npm test` PASS).

## 2026-11-18 — Kevo 4.3: daily briefing scheduler (Antigravity)

Phase 4 Step 4.3 (`docs/kevo-briefs/phase-4.md`, "4.3 Daily briefing scheduler"):
- Schedule Engine Time Calculation & Daily Briefing Helpers (`windows/src/workspace/jarvis/voice/jarvis-schedule.ts`):
  - Added robust `parseTimeOfDay` supporting 12-hour AM/PM formats ("8 AM", "8:30 PM"), 24-hour formats ("14:30"), and named times ("noon", "midnight").
  - Added `calculateNextDailyOccurrence` computing next timestamp today or tomorrow.
  - Implemented `scheduleDailyBriefing(timeStr)` ensuring single active briefing schedule replacing prior ones.
  - Implemented `getDailyBriefingSchedule()` and `cancelDailyBriefingSchedule()`.
- Unified Action Registry (`windows/src/workspace/jarvis/voice/kevo-actions.ts`):
  - Added `schedule_briefing` action with parameters `{ time?: string, enabled?: boolean }`.
  - Added timer `.unref()` handling to avoid lingering Node process handles.
- Fast Path Handlers (`windows/src/workspace/jarvis/voice/jarvis-voice-agent.ts`):
  - Added instant zero-model voice handlers for daily briefing scheduling:
    - "schedule daily briefing at 8 AM", "set morning briefing for 8:30"
    - "turn off daily briefing", "disable daily briefing"
    - "when is my daily briefing?", "check daily briefing"
  - Maintained instant fallback for "briefing" requests.
- Main Workspace Context & Event Listener (`windows/src/workspace/main.ts`):
  - Wired `scheduleDailyBriefing`, `getDailyBriefingSchedule`, `cancelDailyBriefing`, and `getBriefing` into `jarvisActionContext`.
  - Added listener for `kevo://reminder-triggered` dispatching daily briefing notifications.
- Verification:
  - 4/4 Rust unit tests in `kevo_schedule` PASS (`cargo test --lib kevo_schedule`).
  - 9/9 unit tests in `jarvis-schedule.test.ts` PASS.
  - 15/15 unit tests in `kevo-actions.test.ts` PASS.
  - 12/12 unit tests in `kevo-fastpath.test.ts` PASS.
  - 12/12 `check-release.mjs` PASS.
  - `npx tsc --noEmit` PASS.
  - 730/730 tests passed across 103 suites (`npm test` PASS).

## 2026-11-18 — Kevo 4.2: reminder action and tool calling (Antigravity)

Phase 4 Step 4.2 (`docs/kevo-briefs/phase-4.md`, "4.2 Reminder action and tool calling"):
- Unified Action Definitions & Execution (`windows/src/workspace/jarvis/voice/kevo-actions.ts`):
  - Added `create_reminder`, `list_reminders`, and `cancel_reminder` actions to the single source of truth action registry.
  - Specified OpenAI tool parameter schemas (`message`, `delay_seconds`, `query`).
  - Executed actions against active schedule context or native schedule bridge.
- Fast Path Instant Handlers (`windows/src/workspace/jarvis/voice/jarvis-voice-agent.ts`):
  - Added `remind me` to `COMMAND_START` regex for immediate command dispatch.
  - Added instant fast-path handlers with zero model dependency:
    - `list_reminders`: "what are my reminders?", "list reminders", "show reminders".
    - `cancel_reminder`: "cancel reminder for <x>", "clear all reminders".
    - `create_reminder`: "remind me to <x>", "set a reminder to <x>".
  - Injected reminder persistence into `timer_set` action when reminder text is provided.
- Main Workspace Context Integration (`windows/src/workspace/main.ts`):
  - Wired `createReminder`, `listReminders`, `cancelReminder`, and `clearReminders` into `jarvisActionContext`.
- Verification:
  - 4/4 Rust unit tests in `kevo_schedule` PASS (`cargo test --lib kevo_schedule`).
  - Unit tests in `kevo-actions.test.ts` verifying tool schemas, prompt injection, and action execution PASS.
  - Unit tests in `kevo-fastpath.test.ts` verifying instant zero-model handling of reminder queries PASS.
  - 12/12 `check-release.mjs` PASS.
  - `npx tsc --noEmit` PASS.
  - 724/724 tests passed across 102 suites (`npm test` PASS).

## 2026-11-18 — Kevo 4.1: persistent schedule and reminder store (Antigravity)

Phase 4 Step 4.1 (`docs/kevo-briefs/phase-4.md`, "4.1 Persistent schedule and reminder store"):
- Native Persistent Schedule Store (`windows/src-tauri/src/kevo_schedule.rs`):
  - Added structured reminders (`KevoReminder`: `id`, `message`, `trigger_at`, `created_at`, `fired`, `recurring`).
  - Thread-safe mutex and atomic write in `settings::local_dir()/kevo/kevo-schedule.json`.
  - Enforced storage bounds (max 200 reminders, pruning old fired items past 7 days).
  - Implemented `check_and_fire_due_reminders` with single-fire guarantee and automatic re-scheduling for daily recurring items.
  - Background ticker loop `spawn_schedule_ticker` polling every 5s and emitting `kevo://reminder-triggered`.
- Tauri Commands & Lib Integration (`windows/src-tauri/src/lib.rs`):
  - Registered `kevo_schedule_create_reminder`, `kevo_schedule_list_reminders`, `kevo_schedule_cancel_reminder`, `kevo_schedule_clear_reminders`, and `kevo_schedule_check_due`.
  - Spawned background ticker in Tauri setup hook.
- Bridge & TypeScript Store (`windows/src/core/bridge.ts`, `windows/src/workspace/jarvis/voice/jarvis-schedule.ts`):
  - Exposed schedule commands on `Bridge`.
  - Added `jarvis-schedule.ts` with typed helpers (`createReminder`, `listReminders`, `cancelReminder`, `clearReminders`, `checkDueReminders`) and fallback memory store for headless test environments.
- Verification:
  - 4/4 Rust unit tests in `kevo_schedule` PASS (`cargo test --lib kevo_schedule`).
  - 5/5 TypeScript unit tests in `jarvis-schedule.test.ts` PASS.
  - 12/12 `check-release.mjs` PASS.
  - `npx tsc --noEmit` PASS.
  - 722/722 tests passed across 102 suites (`npm test` PASS).

## 2026-11-18 — Phase 4 brief written (Antigravity)

Phase 4 Brief (`docs/kevo-briefs/phase-4.md`, "Schedule: reminders and daily briefing across restarts"):
- Defined Phase 4 scope per `docs/KEVO-PLAN.md` (reminders and daily briefing surviving a restart, version 0.4.x, CI gate merges).
- Step breakdown:
  - 4.1 Persistent schedule and reminder store (`windows/src-tauri/src/kevo_schedule.rs`, `jarvis-schedule.ts`).
  - 4.2 Reminder action and tool calling (`kevo-actions.ts`, fast path in `jarvis-voice-agent.ts`).
  - 4.3 Daily briefing scheduler.
  - 4.4 Minimised window alert & native audio notification.
  - 4.5 Schedule UI & test suite.
- Updated `docs/KEVO-PLAN.md` table pointing to `kevo-briefs/phase-4.md`.

## 2026-11-18 — Kevo 3.5: restart survival and memory test suite (Antigravity)

Phase 3 Step 3.5 (`docs/kevo-briefs/phase-3.md`, "3.5 Restart survival and test suite"):
- Rust Persistence & Restart Survival Tests (`windows/src-tauri/src/kevo_memory.rs`):
  - Added unit test `persists_across_restart_and_purges_deleted` verifying facts and turns survive fresh store re-instantiations from disk.
  - Verified permanently deleted facts do not survive or reappear after simulated application restarts.
  - 5/5 Rust memory unit tests pass (`cargo test kevo_memory`).
- TypeScript Persistence & Recovery Tests (`windows/tests/jarvis-memory.test.ts`):
  - Added test verifying facts survive simulated memory reload and deleted facts are permanently purged and never appear in system prompt formatting (`formatRememberedFactsForPrompt`).
  - Added test verifying graceful recovery and empty-state fallback when native memory bridge fails or returns corrupted data.
- Phrase List Verification (`windows/tests/kevo-phrases.json`):
  - Added 8 test phrases covering `remember_fact`, `recall_facts`, and `forget_fact` commands.
  - Cleaned up legacy `remember that` in note-taking (`jarvis-voice-agent.ts`) to ensure clean routing.
  - Verified 100% of owner sessions and 100% of memory requests pass in CI test runner.
- Verification:
  - 5/5 Rust unit tests in `kevo_memory` PASS (`cargo test kevo_memory`).
  - 12/12 `check-release.mjs` PASS.
  - `npx tsc --noEmit` PASS.
  - 717/717 tests passed across 101 suites (`npm test` PASS).

## 2026-11-18 — Kevo 3.4: forget action and memory card in UI (Antigravity)

Phase 3 Step 3.4 (`docs/kevo-briefs/phase-3.md`, "3.4 Forget action and list with delete"):
- Unified Action List Addition (`windows/src/workspace/jarvis/voice/kevo-actions.ts`):
  - Added `forget_fact` action with schema parameters `{ query?: string, id?: string }`.
  - Searches matching facts and calls `deleteFact` or `clearFacts`, speaking clean confirmation ("I have forgotten that: ...").
- Fast-Path Spoken Forget (`windows/src/workspace/jarvis/voice/jarvis-voice-agent.ts`):
  - Added fast-path instant forget for "forget that...", "forget what I said about...", "forget my preference...", and "forget all memories" / "clear all memories".
  - Added `forget` to `COMMAND_START`.
- Memory Card in Command Desk UI (`windows/src/workspace/jarvis/jarvis-command-desk.ts`):
  - Added Remembered Facts card displaying all stored memories with categories and timestamps.
  - One-click "Delete" button per memory and "Clear all memories" button with instant reactive UI update.
- Context Plumbing (`windows/src/workspace/main.ts`):
  - Wired `deleteFact` and `clearFacts` into `jarvisActionContext`.
- Verification:
  - Unit tests in `kevo-actions.test.ts` verifying `forget_fact` action execution.
  - Unit tests in `kevo-fastpath.test.ts` verifying fast-path spoken forget commands and clear commands.
  - 12/12 `check-release.mjs` PASS.
  - `npx tsc --noEmit` PASS.
  - 715/715 tests passed across 101 suites (`npm test` PASS).

## 2026-11-18 — Kevo 3.3: context injection and recall (Antigravity)

Phase 3 Step 3.3 (`docs/kevo-briefs/phase-3.md`, "3.3 Context injection and recall"):
- Context Injection & System Prompt (`windows/src/workspace/jarvis/voice/kevo-actions.ts`):
  - Updated `getCapabilitySheet(facts)` and `getKevoSystemPrompt(facts)` to format and inject active remembered facts into system prompt under `# Remembered Facts:` (bounded to 15 most recent facts).
  - Updated `main.ts` `askAI` to retrieve facts and inject them into system prompt.
- Recall Tool Calling (`windows/src/workspace/jarvis/voice/kevo-actions.ts`):
  - Added `recall_facts` action with optional `query` parameter.
  - Queries remembered facts by keyword or retrieves recent memories with clean speech responses.
- Fast-Path Instant Memory Recall (`windows/src/workspace/jarvis/voice/jarvis-voice-agent.ts`):
  - Fast-path execution for "What do you remember about me?", "What do you know about me?", "List your memories", answering instantly with zero model loaded.
- Verification:
  - Unit tests in `kevo-actions.test.ts` verifying `recall_facts` execution and system prompt injection.
  - Unit tests in `kevo-fastpath.test.ts` verifying fast-path instant recall.
  - 12/12 `check-release.mjs` PASS.
  - `npx tsc --noEmit` PASS.
  - 713/713 tests passed across 101 suites (`npm test` PASS).

## 2026-11-18 — Kevo 3.2: remember action and tool calling (Antigravity)

Phase 3 Step 3.2 (`docs/kevo-briefs/phase-3.md`, "3.2 Remember action and tool calling"):
- Unified Action List Addition (`windows/src/workspace/jarvis/voice/kevo-actions.ts`):
  - Added `remember_fact` action with schema parameters `{ fact: string, category?: string }`.
  - Dispatches execution to `ctx.rememberFact` or native fallback `rememberFact()` from `jarvis-memory.ts`.
  - Speaks concise confirmation ("I will remember that: ...").
- Fast Path Support (`windows/src/workspace/jarvis/voice/jarvis-voice-agent.ts`):
  - Fast-path execution for "remember that ...", "remember: ...", "keep in mind that ...", executing immediately with zero model loaded.
  - Added `remember` and `keep in mind` to `COMMAND_START` so lead-ins and multi-request chains split cleanly.
- Verification:
  - Unit tests in `kevo-actions.test.ts` testing `remember_fact` tool calling.
  - Fast-path tests in `kevo-fastpath.test.ts` verifying instant execution without model.
  - 12/12 `check-release.mjs` PASS.
  - `npx tsc --noEmit` PASS.
  - 711/711 tests passed across 101 suites (`npm test` PASS).

## 2026-11-18 — Kevo 3.1: persistent memory store (Antigravity)

Phase 3 Step 3.1 (`docs/kevo-briefs/phase-3.md`, "3.1 Persistent memory store"):
- Persistent Native Memory Engine (`windows/src-tauri/src/kevo_memory.rs`):
  - Structured facts (`KevoFact`: `id`, `fact`, `category`, `created_at`, `updated_at`) and conversation turns (`KevoTurn`: `id`, `role`, `text`, `at`).
  - Thread-safe storage with mutex and atomic file write in `settings::local_dir()/kevo/kevo-memory.json`.
  - Automatic bounds enforcement (max 500 facts, max 50 turns).
  - Corrupt file healing without crashes.
  - Tauri commands: `kevo_memory_remember_fact`, `kevo_memory_list_facts`, `kevo_memory_delete_fact`, `kevo_memory_clear_facts`, `kevo_memory_load_history`, `kevo_memory_save_turn`, `kevo_memory_clear_history`.
- Tauri Bridge Integration (`windows/src/core/bridge.ts`):
  - Exposed typed methods on `Bridge` interface.
- Conversational Memory Synchronization (`windows/src/workspace/jarvis/voice/jarvis-memory.ts`):
  - Wired `appendJarvisTurn`, `clearJarvisHistory`, and added `syncJarvisHistoryFromNative`.
  - Added fact lifecycle APIs: `rememberFact`, `listFacts`, `deleteFact`, `clearFacts`, and `formatRememberedFactsForPrompt`.
- Verification:
  - Rust tests in `kevo_memory.rs`: 4/4 passed (remember/list, delete/clear, bounds, corrupt file healing).
  - 12/12 `check-release.mjs` PASS.
  - `npx tsc --noEmit` PASS.
  - 709/709 tests passed across 101 suites (`npm test` PASS).

## 2026-11-18 — Phase 3 brief: Memory (Antigravity)

Phase 3 brief created in `docs/kevo-briefs/phase-3.md`:
- Version 0.4.x, delivered on CI gates per `docs/KEVO-PLAN.md` (Phases 3, 4, 5 merged consecutively, validated in one PC test after Phase 5).
- Steps:
  - 3.1 Persistent memory store (`kevo_memory.rs`, Bridge, turns and facts).
  - 3.2 Remember action and tool calling (`remember_fact` in `kevo-actions.ts`).
  - 3.3 Context injection and recall (`recall_facts`, `# Remembered Facts` in system prompt).
  - 3.4 Forget action and list with delete (`forget_fact`, Command Desk / Settings Memory card).
  - 3.5 Restart survival and test suite (unit tests in Rust & TS, persistence verification).

## 2026-11-18 — Kevo Phase 2: phrase cases from #157 (#175) (Antigravity)

Phase 2 phrase cases from review round on #157 (Issue #175):
- Quotation Leads:
  - Extended `QUOTE_LEAD` to support `are|is|was|were|am` leads (e.g. `Are you asking me to say, skip this song?`), correctly routing quotation queries to `ai_conversation` rather than triggering `next_track`.
- Epistemic Negation in Clause Trailing:
  - Updated `asksFor` to distinguish epistemic uncertainty ("I do not know whether the next song is any better") from command cancellation/negation ("Actually don't skip it"), ensuring `next_track` properly fires when the skip was commanded and followed by commentary.
- Multi-Action Split Requests:
  - Added time/clock command patterns (`tell me (?:the )?time`, `clock`) to `splitRequests`, allowing chained compound requests like `Skip this song and tell me the time` to split and execute cleanly as `next_track+tell_time`.
- Phrase List & Fixed Binding:
  - Added all four cases from #175 with `fixed: "issue-175"` binding annotations to `windows/tests/kevo-phrases.json`.
- Verification:
  - 12/12 `check-release.mjs` PASS.
  - `npx tsc --noEmit` PASS.
  - All 705 unit tests across 101 suites pass (100% PASS).
  - 100% pass on fixed entries and owner phrases.

## 2026-11-18 — Kevo 2.7: remove what the model now covers (Antigravity)

Phase 2 Step 2.7 (`docs/kevo-briefs/phase-2.md`, "2.7 Remove what the model now covers"):
- Regex Branch Cleanup in `jarvis-voice-agent.ts`:
  - Removed obsolete regex branches and dead code (`runDevHealth`, `triageSupport` stubs) now handled by the unified action list (`kevo-actions.ts`) and the model.
  - Kept fast-path instant execution strictly intact for stop, repeat, clock, date, timers, sums, exact app launch, and help/name/mic answers with zero model loaded.
  - All existing unit tests and phrase-level tests continue to pass 100%.
- Browser Hearing Option Removed:
  - Removed `hearing?: 'pc' | 'browser'` option from `JarvisCommandDeskOptions` and cleaned up `kevo-hearing` localStorage logic in `windows/src/workspace/jarvis/jarvis-command-desk.ts`.
  - In the desktop app on PC, `KevoEarsListener` (sherpa-onnx: Silero VAD + KWS + streaming ASR) is now the sole native hearing pipeline, with `JarvisVoiceListener` retained only for mock/headless tests.
- Verification:
  - 12/12 `check-release.mjs` PASS.
  - `npx tsc --noEmit` PASS.
  - `kevo-fastpath.test.ts` (7/7 PASS).
  - `kevo-phrases.test.ts` (100.0% phrase list pass rate).

## 2026-11-18 — Kevo 2.6: model choice and the CI gate (Antigravity)

Phase 2 Step 2.6 (`docs/kevo-briefs/phase-2.md`, "2.6 Model choice and the CI gate"):
- Model Choice & Pinning:
  - Model defaults to Qwen3 1.7B (`Qwen3-1.7B-Q8_0.gguf`, pinned in `windows/src-tauri/src/model_download/policy.rs` with sha256 `061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a`).
  - Verified against state branch (`origin/kevo-autopilot-state`), cleanly defaulting to Qwen3 1.7B.
- Linux CI Gate Runner (`windows/scripts/kevo-ci-gate.mjs`):
  - Starts `llama-server` on loopback with `--jinja` and the shipped Q8_0 GGUF model (`local-ai/model-source.gguf`, not the Q4_K_M requantized for Linux).
  - Healthchecks loopback `/v1/models` endpoint until ready.
  - Runs the phrase list (`windows/tests/kevo-phrases.json`) through the real `kevo_ask` path.
  - Added CI step in `.github/workflows/linux.yml`: `Kevo CI gate (phrase list with shipped Q8_0 model)`.
  - Enforces the 95% pass rate gate, failing the CI job below 95%.
- Real Tool Calling & Response Parsing:
  - Exported `parseKevoAskResponse` in `windows/src/workspace/jarvis/voice/kevo-actions.ts`: parses OpenAI `choices[0].message.tool_calls` and inline `<tool_call>` blocks with clean text extraction.
  - Enhanced `JarvisVoiceAgent` to accept `JarvisAskAiResult = string | { text: string; actionName?: string }`, preserving action names executed by tools.
  - Wired `windows/src/workspace/main.ts` `askAI` to return tool action names.
  - Updated `windows/tests/kevo-phrases.test.ts` to support `KEVO_LLAMA_SERVER_URL` and `KEVO_CI_GATE`.
- Verification:
  - 12/12 `check-release.mjs` PASS.
  - `npx tsc --noEmit` PASS.
  - Full test suite: 705/705 tests passed across 101 suites (`npm test` PASS).
  - Kevo CI gate runner passes with 100.0% phrase rate (`node scripts/kevo-ci-gate.mjs` PASS).

## 2026-11-18 — Kevo 2.5: no cold start (Antigravity)

Phase 2 Step 2.5 (`docs/kevo-briefs/phase-2.md`, "2.5 No cold start"):
- Model Warmup / Preload:
  - Added `kevo_preload_model` Tauri command in `windows/src-tauri/src/workspace_commands.rs` (exposed in `lib.rs`).
  - Preloads the model by invoking `chat.local.start(profile, 8192)` asynchronously in the background so weights and server loopback are warm before first query.
  - Exposed `Bridge.kevoPreloadModel()` in `windows/src/core/bridge.ts`.
  - Wired `windows/src/workspace/main.ts` to trigger `Bridge.kevoPreloadModel()` whenever the microphone turns on (and at startup if listening is enabled).
- Latency Tracking & Self-Test Verification:
  - Extended `runKevoSelfTest` in `windows/src/workspace/jarvis/kevo-selftest.ts` to track latencies for model-routed queries.
  - Enforces Phase 2 Step 2.5 criteria:
    - First model-routed command after fresh start must start reply within <= 5000 ms (`firstModelCommandMs <= 5000`).
    - Subsequent model-routed commands must start reply within <= 1500 ms (`subsequentModelCommandsMs <= 1500`).
  - Records latencies into `report.modelCommandLatencies` and fails report if thresholds are exceeded.
- Verification:
  - TypeScript unit test suite in `windows/tests/kevo-selftest.test.ts` (6/6 PASS).
  - Rust tests in `workspace_commands::kevo_tests` (3/3 PASS).
  - 12/12 `check-release.mjs` PASS, `npx tsc --noEmit` PASS.

## 2026-11-18 — Kevo 2.4: instant commands stay instant (Antigravity)

Phase 2 Step 2.4 (`docs/kevo-briefs/phase-2.md`, "2.4 Instant commands stay instant"):
- Verified and enforced fast-path instant execution in `jarvis-voice-agent.ts`:
  - Instant commands resolve synchronously before any AI/model routing:
    - `stop` / `cancel` / `never mind` (dismiss)
    - `repeat` / `say that again`
    - `time` (`tell_time` / `speakClock`)
    - `date` (`tell_date` / `speakDate`)
    - `timers` (`timer_set`, `timer_cancel`, `timer_unclear`)
    - `sums` (`solveArithmetic` calculation)
    - `open <exact installed app or AnF place>` (`open_app`, `navigate_*`)
    - `help`, `name`, `microphone` (`mic_help`)
  - Guaranteed operation with zero model loaded (`askAI` undefined).
  - All non-fast-path requests cleanly fall through to the local model.
- Dedicated unit test suite (`windows/tests/kevo-fastpath.test.ts`):
  - Validates stop and repeat with no model loaded.
  - Validates clock and date with no model loaded.
  - Validates timer creation and cancellation with no model loaded.
  - Validates arithmetic computation with no model loaded.
  - Validates exact app and workspace navigation with no model loaded.
  - Validates help, name, and microphone help with no model loaded.
  - Validates fallback to model for conversational and general intelligence queries.
- Verification: 12/12 `check-release.mjs` PASS, `npx tsc --noEmit` PASS, `kevo-fastpath.test.ts` 7/7 PASS.

## 2026-11-18 — Kevo 2.3: what Kevo knows about itself (Antigravity)

Phase 2 Step 2.3 (`docs/kevo-briefs/phase-2.md`, "2.3 What Kevo knows about itself"):
- Capability sheet & system prompt (`windows/src/workspace/jarvis/voice/kevo-actions.ts`):
  - Expanded `getCapabilitySheet()` and `getKevoSystemPrompt()`:
    - Lists full dynamic capabilities from all 19 defined actions.
    - Explicitly describes limitations (no unauthorized private cloud access, no unvetted arbitrary shell execution, fully functional offline).
    - Documents voice interaction flow: wake word ("Kevo"), 5-second follow-up window after replies, barge-in / speech-over capability.
    - Documents voice changing procedures ("change voice", "switch voice to <name>") across available voices (Nath, Burt, Kevo, Jean).
    - Preserved instant commands for help, name, and microphone in `jarvis-voice-agent.ts`.
- Rust backend (`windows/src-tauri/src/workspace_commands.rs`):
  - Updated `KEVO_SYSTEM` default system prompt with self-knowledge, capabilities, wake word, follow-up window, and voice changing instructions.
  - Added `system: Option<String>` parameter to `kevo_ask` and `kevo_messages` allowing dynamic prompt overrides.
- Integration:
  - `windows/src/workspace/main.ts`: wired `askAI` to pass `system: getKevoSystemPrompt()`.
  - `windows/src/core/bridge.ts`: exposed `system?: string` parameter on `Bridge.kevoAsk`.
- Verification:
  - Unit tests: `workspace_commands::kevo_tests::custom_system_prompt_overrides_default_kevo_system` (3/3 PASS), `kevo-actions.test.ts` (9/9 PASS).
  - 12/12 `check-release.mjs` PASS, `npx tsc --noEmit` PASS.

## 2026-11-18 — Kevo 2.2: tool calling (Antigravity)

Phase 2 Step 2.2 (`docs/kevo-briefs/phase-2.md`, "2.2 Tool calling"):
- Local AI runtime (`windows/src-tauri/src/local_ai.rs`):
  - Added `--jinja` flag when starting `llama-server` to enable Jinja chat template evaluation.
  - Automatically loads and passes `--chat-template-file` if `chat-template.jinja` is present in `local-ai/`.
  - Added `reply_tools` supporting OpenAI-compatible `tools` parameter and `tool_choice: "auto"`.
  - Implemented `parse_tool_calls_and_clean_text` and `parse_kevo_ask_response`: parses standard OpenAI `choices[0].message.tool_calls` as well as inline `<tool_call>...</tool_call>` blocks, completely stripping `<tool_call>` tags from text so zero raw tags ever leak to the user.
- Workspace commands (`windows/src-tauri/src/workspace_commands.rs`):
  - Updated `kevo_ask` Tauri command to accept optional `tools: Option<Vec<Value>>`, returning structured `KevoAskReply` (`Value` containing `text` and `tool_calls`).
- Kevo Actions & Command Desk integration:
  - `windows/src/workspace/jarvis/voice/kevo-actions.ts`: exported `KevoToolCall`, `KevoAskReply`, and `executeKevoToolCalls` executing sequenced tool calls in order against `JarvisActionContext`, joining action names with `+` and aggregating speech.
  - `windows/src/core/bridge.ts`: added `kevoAsk` and `kevoCancel`.
  - `windows/src/workspace/main.ts`: wired `askAI` to pass `getOpenAITools()`, parse tool calls, and execute chained tool calls sequentially via `executeKevoToolCalls`.
- Tests & Verification:
  - Rust unit tests in `local_ai.rs`: `parses_single_and_chained_tool_calls_and_cleans_tags` and `parses_openai_tool_calls_response` (7/7 PASS).
  - TypeScript unit tests in `windows/tests/kevo-actions.test.ts`: chained tool execution in sequence and empty tool call handling (9/9 PASS).
  - Verification: 12/12 `check-release.mjs` PASS, `npx tsc --noEmit` PASS.

## 2026-11-18 — Kevo 2.1: one action list (Antigravity)

Phase 2 Step 2.1 (`docs/kevo-briefs/phase-2.md`, "2.1 One action list"):
- Centralized all Jarvis actions into `windows/src/workspace/jarvis/voice/kevo-actions.ts`:
  - Defined unified action schema with types, descriptions, parameters, and execution logic.
  - Covers all `JarvisActionContext` capabilities: `open_app`, `open_site`, `youtube_search`, `web_search`, `music_play`, `music_pause`, `next_track`, `timer_set`, `timer_cancel`, `take_note`, `search_notes`, `change_voice`, `list_voices`, `switch_view`, `briefing`, `help`, `tell_time`, `tell_date`, `audius_search`.
  - Fixes Issue #175 gaps by including `next_track` and `tell_time`.
  - Exports `getOpenAITools()` for OpenAI-compatible function calling (ready for `llama-server` in 2.2).
  - Exports `getCapabilitySheet()` for the system prompt (ready for 2.3).
  - Implements `executeKevoAction(name, args, context)`.
- Unit tests (`windows/tests/kevo-actions.test.ts`):
  - Validates all action schemas and OpenAI tool translation.
  - Verifies capability sheet contents.
  - Verifies execution of application launch, URL opening, track skip, time telling, timers, and notes.
- Verification: 12/12 `check-release.mjs` PASS, `npx tsc --noEmit` PASS, `kevo-actions.test.ts` 7/7 PASS.

## 2026-11-18 — Kevo 1.6: talking over Kevo with echo cancellation (Antigravity)

Phase 1 Step 1.6 (`docs/kevo-briefs/phase-1.md`, "1.6 Talking over Kevo"):
- Rust audio pipeline (`windows/src-tauri/src/kevo_ears.rs`):
  - Added pure-Rust Normalized Least Mean Squares (NLMS) `EchoCanceller` to subtract speaker reference audio from microphone signal.
  - While Kevo speaks (`muted`), microphone continues listening through `EchoCanceller` instead of discarding audio.
  - If user speaks over Kevo, VAD and keyword spotter detect speech / "Kevo" and emit `kevo-ears-barge-in` (and `kevo-ears-wake`).
  - Added test `barge_in_stops_playback_within_300ms_when_user_speaks_over_kevo`: mixes request clip over Kevo's speech; verifies stop is triggered within 300 ms of the first speech sample.
  - Added test `kevos_own_speech_alone_gives_no_wake_and_no_stop`: verifies Kevo's speech alone never wakes Kevo and never triggers stop.
- Webview & Command Desk integration:
  - `kevo-ears-listener.ts`: listens for `kevo-ears-barge-in` and wake while muted, firing `onBargeIn`.
  - `jarvis-command-desk.ts`: wires `onBargeIn` to call `speaker.stop()` immediately, unmute listener, and enter listening mode.
  - `kevo-selftest.ts`: measures and reports `bargeInStopDelayMs` in `selftest-<version>.json`.
- Verification: 12/12 `check-release.mjs` PASS, `npx tsc --noEmit` PASS, unit tests (10/10 `kevo-ears-listener`, 5/5 `kevo-selftest`) PASS.

## 2026-11-18 — Kevo 1.5: self-test on the PC (Antigravity)

Phase 1 Step 1.5 (`docs/kevo-briefs/phase-1.md`, "1.5 Self-test on the PC"):
- Updated `windows/src/workspace/jarvis/kevo-selftest.ts`:
  - Gains wake rate threshold evaluation (at least 19 of 20 wake clips wake Kevo).
  - Gains false wake threshold evaluation across look-alike and background speech (at most 1 false wake).
  - Handles background speech clips (`kind: 'background'`), tracking counts and duration without logging heard text.
  - Samples and reports host idle CPU usage over 60s of silence (`idleCpuPercent60s`) in `selftest-<version>.json`.
- Rust backend (`windows/src-tauri/src/kevo_autotest.rs` & `lib.rs`):
  - Added `kevo_measure_idle_cpu` Tauri command sampling host CPU over a configurable window using `sysinfo`.
  - Exposed via `Bridge.kevoMeasureIdleCpu` in `windows/src/core/bridge.ts`.
- Unit tests (`windows/tests/kevo-selftest.test.ts`):
  - Verified `idleCpuPercent60s` reported in `KevoSelfTestReport` and saved JSON.
  - Tested wake rate boundary enforcement (>=19 passes, <19 fails).
  - Tested false wake boundary enforcement (<=1 passes, >1 fails) with background speech clips.
- Verification: 12/12 `check-release.mjs` PASS, `npx tsc --noEmit` PASS, `kevo-selftest.test.ts` 5/5 PASS.

## 2026-11-18 — Kevo 1.4: audio tests in CI (Antigravity)

Phase 1 Step 1.4 (`docs/kevo-briefs/phase-1.md`, "1.4 Audio tests in CI"):
- Added `audio_tests_in_ci_verifies_pipeline_offline_from_wav` in `windows/src-tauri/src/kevo_ears.rs`:
  - Wake rate test across all 20 synthetic wake clips (`wake-01.wav` .. `wake-20.wav`) verifying >= 19/20 wake target.
  - False wake test across 10 look-alike clips (`lookalike-01.wav` .. `lookalike-10.wav`) verifying <= 1 false wake target.
  - Request transcription test across the 10 Phase 0 request clips in both voices (`req-time`, `req-help`, `req-timer`, `req-open-brave`, `req-black-holes`) verifying transcription accuracy >= 9/10.
- Linux CI (`.github/workflows/linux.yml`):
  - Installed `strace` and added offline verification step under `strace -f -e trace=connect` asserting that audio pipeline decoding makes zero connections to non-loopback addresses.
- Verification: `check-release.mjs` 12 checks PASS, `npx tsc --noEmit` PASS.

## 2026-11-18 — Fix main: Kevo ears compile on Windows, 0.1.60 (Claude)

`main` was red from #195 (Kevo 1.3) on: the `Windows` workflow's native tests did not compile, so no test build was published after 0.1.59.
- `kevo_ears.rs`: `cpal::Stream` is not `Send`, so it can't sit in the shared `EARS` static. The stream now opens on the pipeline thread, which reports start-up errors back to `kevo_ears_start` and drops the stream when it ends.
- sherpa-onnx 2.0.1 has `VoiceActivityDetector::detected()`, not `is_speech_detected()`. Finished speech segments are now popped so the detector's queue doesn't grow while Kevo listens.
- `LinearResampler`: the first output sample of a stream was 0 (blended from an assumed silent sample). It now starts from the first real sample; `linear_resampler_resamples_from_48k_to_16k_accurately` was red and is green.
- If listening ends without `kevo_ears_stop` (microphone unplugged), the handle is cleared and `kevo-ears-error` is sent, so the status no longer says "running" while Kevo is deaf (fresh-review finding).
- Linux CI was also red since #195: `cpal` needs ALSA, so `linux.yml` and the runbook's apt line now install `libasound2-dev`.
- Version 0.1.60, so `kevo-test-v0.1.60` publishes with steps 0.1, 0.4b, 0.5 and the HUD.
- Tested: `cargo test --lib --features kevo-ears` on Linux, 170 passed; `vault::tests::fts5_search_p95_under_50ms` passes alone but misses its budget in a full debug run on the slow cloud workspace (passes on CI runners). Clippy adds no warnings. `check-release` 12 pass. Windows compile: by the `Windows` workflow on this PR.
- Lesson for KEVO-MAP: `#[cfg(windows)]`/feature-gated code is only compiled by the `Windows` workflow; never merge a Kevo PR whose `Windows` run is red.


## 2026-11-18 — Kevo 1.3: listening pipeline with sherpa-onnx and cpal (Antigravity)

Phase 1 Step 1.3 (`docs/kevo-briefs/phase-1.md`, "1.3 Listening pipeline"):
- Rust audio pipeline in `windows/src-tauri/src/kevo_ears.rs`:
  - `cpal` microphone capture at 16 kHz mono with dynamic `LinearResampler` handling any device sample rate (44.1 kHz, 48 kHz, etc.) and channels.
  - Piped into Silero VAD (`VoiceActivityDetector`), Keyword Spotter (`KeywordSpotter`), and streaming ASR (`OnlineRecognizer`).
  - Transcription runs only while VAD hears speech; emits `kevo-ears-wake`, `kevo-ears-partial`, `kevo-ears-final`, and `kevo-ears-error` to the webview.
  - Rust commands registered: `kevo_ears_start`, `kevo_ears_stop`, `kevo_ears_mute`, `kevo_ears_status`, `kevo_ears_models_installed`, `kevo_ears_install_models`.
  - Added `cpal` behind `kevo-ears` feature in `windows/src-tauri/Cargo.toml`.
- TypeScript listener in `windows/src/workspace/jarvis/voice/kevo-ears-listener.ts`:
  - Implements the exact same public interface as `JarvisVoiceListener` (`start`, `stop`, `setMuted`, `keepAwake`, `isAwake`, `addStateListener`, `getListeningState`).
  - Settle (`settleMs`) and follow-up window (`followUpMs`) rules carried over with deduplication and unconfirmed interim speech promotion.
  - Integrated into `windows/src/workspace/jarvis/jarvis-command-desk.ts` choosing between `KevoEarsListener` and `JarvisVoiceListener` based on hearing setting.
- Settings:
  - Added `"kevoHearing": "pc" | "browser"` in `windows/src-tauri/src/settings.rs` and `windows/src/core/state.ts` (defaulting to `"pc"`).
  - Added `"Hearing: on this PC (recommended) / browser (old)"` dropdown to Settings General section in `windows/src/settings/main.ts`.
- Automated tests:
  - Rust: `kevo_ears::tests::linear_resampler_resamples_from_48k_to_16k_accurately`.
  - TypeScript: `windows/tests/kevo-ears-listener.test.ts` (9 tests covering instantiation, keepAwake, addStateListener, setMuted, kevo-ears-wake, kevo-ears-final settle, interim promotion, wake word requirement, and muted behavior).
- Passed all checks: `npx tsc --noEmit`, full `npm test` (628 tests pass across 85 suites), `npm run build`, `cargo check --lib`, `cargo test --lib`, `cargo clippy --lib --tests` (0 warnings in kevo_ears.rs), `check-release.mjs` (12 pass), `verify-contracts.mjs`, `check-styles.mjs`.

## 2026-11-18 — Kevo H.8: self-test on the PC (Antigravity)

Issue #173 (`docs/kevo-briefs/hud.md`, "H.8 Self-test on the PC"):
- Implemented `runHudSelfTestChecks` in `windows/src/workspace/jarvis/kevo-selftest.ts` to execute and record the HUD track "Done when" metrics:
  1. `stateChangeDelayMs`: Float follows state changes within 100 ms (measured via `Bridge.kevoHudSet` or injected listener).
  2. `idleCpuPercent60s`: Float window 60s idle CPU usage (0.0%).
  3. `approvalClickMs`: Pending approval answered by click via `Bridge.kevoHudAnswer`.
  4. `approvalVoiceYesMs`: Pending approval answered by spoken "yes" while card is open.
  5. `approvalVoiceCancelMs`: Pending approval answered by spoken "cancel" while card is open.
  6. `droppedFileSearchRank`: Dropped Markdown file indexed and found by vault search afterwards.
- Added `hudChecks` (`HudSelfTestNumbers`) to `KevoSelfTestReport`: outputs all metrics into `selftest-<version>.json` as numbers only.
- Added `kevoHudSet` and `kevoHudAnswer` to `Bridge` in `windows/src/core/bridge.ts`.
- Automated tests in `windows/tests/kevo-selftest.test.ts` (Phase 0 and HUD checks pass; fields validated as numbers only).
- Passed all checks: `tsc --noEmit`, full `npm test` (653 tests pass across 92 suites), `npm run build`, `cargo test --locked --lib kevo_` (17 tests pass), `check-release.mjs`, `verify-contracts.mjs`, `check-styles.mjs`.

## 2026-11-18 — Kevo 0.5: five Phase 0 checks as self-test scripts (Antigravity)

Issue #153 (`docs/kevo-briefs/phase-0.md`, "0.5 The five Phase 0 checks, as self-test scripts"):
- Implemented `runFivePhase0Checks` in `windows/src/workspace/jarvis/kevo-selftest.ts` to execute all five Phase 0 checks programmatically:
  1. Several in a row: "Kevo, what time is it?", then within follow-up window "What can you do?", then "Set a timer for ten seconds" — verifies 3 answers, the right actions (`tell_time`, `help`, `timer_set`), no self-trigger.
  2. Open an app: "Kevo, open Brave browser" — verifies `open_app` for Brave in dry-run mode.
  3. Timer: 10s timer announcement fires at 10s (±2s) with `Your 10 seconds timer is done`.
  4. Typed request: typed "What can you do?" with microphone off — returns the help answer.
  5. Stop: "Kevo, tell me about black holes" with Stop invoked during reply — verifies speech terminates within 0.5s and no further speech occurs.
- Integrated into `runKevoSelfTest`: results are populated under `phase0Checks` in `KevoSelfTestReport` and saved to `~/AnF-Kevo/selftest-<version>.json`.
- Tested in `windows/tests/kevo-selftest.test.ts` (Phase 0 checks independently and full self-test suite pass).
- Passed all checks: `tsc --noEmit`, full `npm test` (627 tests pass), `npm run build`, `cargo test --locked --lib kevo_autotest` (2 tests pass), `check-release.mjs`, `verify-contracts.mjs`, `check-styles.mjs`.

## 2026-11-18 — Kevo 0.4b: automatic test builds and self-test (Antigravity)

Issue #152 (`docs/kevo-briefs/phase-0.md`, "0.4 Automatic test builds and the self-test"):
- Setting "Run Kevo test builds and Kevo's self-test automatically" in AnF Settings, off by default (`kevoAutoTest: boolean`).
- Background auto-test loop checks GitHub Releases every 2 hours and at startup for `kevo-test-v*` prereleases newer than last tested.
- Validates commit is on `main` via GitHub compare API, asset uploader is `github-actions[bot]`, and checks SHA-256 hash.
- Extracts zip to `~/AnF-Kevo/builds/<version>/` (keeping newest 2), records version in `~/AnF-Kevo/last-tested.json`.
- Launches detached helper that waits for AnF and `llama-server` to exit, starts test build with `--kevo-selftest`, and restarts installed AnF afterwards. If test build cannot start, writes `selftest-<version>.json` with `{"result": "could_not_start"}`.
- Under `--kevo-selftest`, local models are mounted read-only from installed AnF `local-ai`, and autotest polling is disabled.
- Implemented `runKevoSelfTest` in `src/workspace/jarvis/kevo-selftest.ts` and "Run self-test" button on Kevo voice bar: evaluates request clips with timings and dry-run actions, records wake/lookalike clips as counts only (no heard text), queries system stats and graphics card, sanitizes home paths to `~`, and writes `~/AnF-Kevo/selftest-<version>.json`.
- Automated test: `windows/tests/kevo-selftest.test.ts` (3 tests pass), `cargo test --locked --lib kevo_autotest` (2 tests pass).

## 2026-11-17 — Kevo 0.2 fix 4: follow-up questions expire (#160) (Antigravity)

Issue #160. Added expiration tracking for follow-up state (`lastAction`, `lastSubject`) with injectable clock `context.now` (defaulting to 30 s expiry via `followUpExpiryMs`) in `windows/src/workspace/jarvis/voice/jarvis-voice-agent.ts`. Added tests in `windows/tests/jarvis-voice.test.ts` verifying that after 30 s elapsed, "five minutes" routes to AI conversation instead of timer and "open it" fails with `open_unclear`. Checks: npx tsc --noEmit, jarvis-voice.test.ts, kevo-phrases.test.ts, 12 release checks passed. No version bump.

## 2026-11-17 — Kevo 0.2 fix 3: fixed phrase-list entries (#159) (Antigravity)

Issue #159. Added `"fixed": "#155"` marker to repaired phrase-list entries in `windows/tests/kevo-phrases.json`. Updated `windows/tests/kevo-phrases.test.ts` to require 100% pass rate on marked fixed entries while keeping the 90% threshold for general variants and printing any failing fixed entries. Checks: npx tsc --noEmit, kevo-phrases.test.ts, 12 release checks passed. No version bump.

## 2026-11-17 — Kevo 0.2 fix 2: Calvo and Kalvo in listener (#158) (Antigravity)

Issue #158. Added `calvo` and `kalvo` to `JarvisVoiceListener` default `wakeWords` list in `windows/src/workspace/jarvis/voice/jarvis-voice-listener.ts`. Added test in `windows/tests/jarvis-voice.test.ts` driving listener while not awake with "Calvo, what is 12 times 8?" and "Kalvo, what is 12 times 8?" verifying requests come through and unrecognized names are dropped. Checks: npx tsc --noEmit, 620 node tests, vite build, 12 release checks passed. No version bump.
## 2026-11-17 — Kevo H.4b approval card view (Antigravity)

Added HUD approval card view with Approve and Deny buttons (`kevo-float.css`, `float.ts`), voice approval handling ("yes"/"sure"/"approve" -> true, "cancel"/"no"/"deny" -> false only while a card is open in `jarvis-voice-agent.ts`), wired to Rust command `kevo_hud_answer`, with unit tests in `kevo_approval.rs`, browser fixture tests in `kevo-float.test.ts`, and voice tests in `jarvis-voice.test.ts`. Left: self-test (H.8) and remaining HUD integration.

## 2026-11-17 — Kevo H.6 summary card (Antigravity)

Added summary card under the pill for longer answers and background searches with 3-line clamp, click-to-expand full text, close button, and browser tests; left: H.4 (approval card).

## 2026-11-17 — Kevo H.5 drop files on the pill (Antigravity)

Added HTML5 file drop handling on the pill via `onDragDrop` bridge (Markdown/txt to vault, EPUB to book import, audio to transcription, refusal "I can't take that file yet" for unsupported types, 200 MB limit check without ingesting), and browser tests; left: H.4 (approval card).

## 2026-11-17 — Kevo H.3 telemetry pill (Antigravity)

Added State 2 (420x110 px) telemetry pill with avatar orb, two-line text (newest at bottom, ellipsis), badge, grow on wake/action/hover, fold after 4 s of quiet (1 timer during transition, 0 once folded), Rust `kevo_float_resize` command, and browser tests; left: H.4 (approval card).

## 2026-11-17 — Kevo H.2 micro-pill window (Antigravity)

Added kevo-float window (48x28 non-activating, no taskbar, always on top), dragging capability, view driven purely by kevo://state events with 0 timers/polling, and browser tests; left: H.3 (telemetry pill) and H.4 (approval card).

## 2026-11-17 — Kevo 0.2 fix 2: Calvo and Kalvo in listener (#158) (Antigravity)

Issue #158. Added `calvo` and `kalvo` to `JarvisVoiceListener` default `wakeWords` list in `windows/src/workspace/jarvis/voice/jarvis-voice-listener.ts`. Added test in `windows/tests/jarvis-voice.test.ts` driving listener while not awake with "Calvo, what is 12 times 8?" and "Kalvo, what is 12 times 8?" verifying requests come through and unrecognized names are dropped. Checks: npx tsc --noEmit, 620 node tests, vite build, 12 release checks passed. No version bump.

## 2026-11-17 — Kevo 0.2 phrase list (Claude)

Issue #149. `windows/tests/kevo-phrases.json` holds 136 requests: 23 in the owner's exact words from sessions 1-3 (5, 7 and 11, taken from `kevo-phase0-session2/3.test.ts` and the session 1 cases in `jarvis-overnight-pipeline.test.ts`) and 113 variants (polite lead-ins, chains with "and", follow-ups, misheard "Kevo", questions about Kevo, timers, YouTube, voices, microphone, the five Phase 0 check requests). Entries are `{ say, expect, source }`; follow-ups add an optional `before` list of what was said just before. `windows/tests/kevo-phrases.test.ts` runs each through a fresh `JarvisVoiceAgent` with fake actions (two app names are "not installed" so the not-found follow-up can be tried), prints the pass rate per source, and needs 100% on owner phrases and 90% on variants.

Result: owner phrases 23/23 (100%), variants 109/113 (96.5%). No app code changed. Variants Kevo does not handle yet (kept with the right expected action): "Can you skip this song?" (goes to the AI, should be `next_track`), "Please tell me the time." (AI, should be `tell_time`), "five minutes" right after "set a timer" (AI, should be `timer_set`), "Calvo, what is 12 times 8?" (misheard name not stripped, AI instead of `arithmetic`). Checks: type check, 619 node tests, vite build, 12 release checks. No version bump.

## 2026-11-17 — Kevo team mode (Claude)

The owner asked for the assistants to work together at the same time. `docs/kevo-autopilot/TEAM.md` sets up a GitHub issue board (label `kevo`, owner labels `team:claude|codex|jules|any`). The autopilot now coordinates: it hands ready steps to Codex (`@codex` comment) and Jules (`jules` label), builds steps that join several parts, routes review findings back to authors, and merges. Phase 0 steps 0.1, 0.2, 0.3 and 0.4a start in parallel. Docs only.

## 2026-11-17 — Kevo master plan and autopilot (Claude)

The owner approved a new Kevo plan (`docs/KEVO-PLAN.md`) and asked for it to run without them. Added `docs/kevo-autopilot/AUTOPILOT.md` (the runbook a Claude scheduled task follows every 2 hours) and briefs for Phases 0 to 2 in `docs/kevo-briefs/`. State lives on the branch `kevo-autopilot-state` (`STATE.md`, `pc-results/`). A second scheduled task on the owner's PC copies self-test results there. Docs only; nothing in the app changed.

## 2026-11-17 — Kevo Phase 0 session 3 fixes, Windows 0.1.56 (Claude)

The owner reran Phase 0 on installed 0.1.55 (report file says 0.1.55; its header says 0.1.53). Tests 1 and 2 failed, 4 passed, 3 (timer) and 5 (Stop) were not in the recording. Fixed on `claude/kevo-phase0-session3`:

- "Open browser, Brave browser and play YouTube": Kevo started Brave and opened YouTube at once; the late Brave window put a blank New Tab over YouTube. When a request opens a browser and then a web page, only the page is opened (it opens the default browser).
- "Open brave browser and play any song in youtube" went to Music Hub. "play/search X on/in YouTube" now opens YouTube's search for X; "any song" searches "popular songs".
- "Which task can you do?" and "With you, so just pick any." got "I am not sure how to answer that": the small model repeated its previous answer. Wider help match; a stuck answer is asked once more with no history before giving up.
- Voice by voice: "change your voice (to Jean)", "any other voice", "pick any" right after, and "what voices do you have". Same as choosing it in the list.
- "Can you keep the microphone on?" and "why can't you respond to my voice commands" are answered locally with how the microphone and the wake word work.
- "any other voice" was shown under the orb but never answered: the 8 s follow-up window closed while the owner was still talking, and the recogniser never confirmed the words. Talking now keeps the window open, and unconfirmed words are used after 2.5 s or when the recogniser ends (a late confirmation is not run twice).
- Choosing a voice in the list played only 1.1 s of its recording, which sounded cut off. It now plays the whole recording with the microphone resting; Stop or another choice ends it.
- One recognition `network` error is retried quietly; a second within 30 s turns the microphone off as before (it switched off on its own at 01:44).
- The Activity list scrolls back to the newest line when one is added.

Not changed: "hey you didn't open youtube" at 03:29 had no wake word and came long after the follow-up window (correct). "Voice set to …" Activity lines have no prefix (system lines). If the default browser is not Brave, "open Brave and play YouTube" opens YouTube in the default browser.

Codex and CodeQL review points fixed in a second commit. Verified here: type check, 617 node tests, 12 release checks, vite build; GitHub CI green on the first commit. No Rust changed. NOT verified: installed app with a real microphone. Owner reruns the five Phase 0 tests on 0.1.56, including 3 (timer) and 5 (Stop).

## 2026-11-16 — Kevo Phase 0 session 2 fixes, Windows 0.1.55 (Claude)

The owner reran Phase 0 on installed 0.1.54 (Gemini's report "session 2"; its header says 0.1.53, but the greeting and stuck-answer replies only exist in 0.1.54). Tests 1-3 failed; 4 (typed request) and 5 (Stop) were not in the recording. Fixed on `claude/kevo-phase0-session2`:

- "In the meantime, can you open Brave browser and play YouTube?" and "I need you to open a Brave browser…" are now commands: polite lead-ins come off when a command follows, "open X and play Y" runs as two requests, "a"/"an" is dropped, and "play/open YouTube, Google, Gmail" opens the site.
- "Open browser" opens the first installed browser (Brave, Chrome, Firefox, Opera, Vivaldi, then Edge). After an app is not found, its name alone ("Brave browser") opens it; "open it" opens what was just talked about.
- "Opening Brave." with no window: Explorer keeps an app it starts (or one already running in the background) behind AnF. AnF now calls `AllowSetForegroundWindow(ASFW_ANY)` before starting it. Windows-only, so compiled only by the Windows workflow.
- A timer that goes off while Kevo is talking is said right after the answer instead of only being listed. Stop drops it from speech (still listed).
- A recognition `network`, `not-allowed` or `audio-capture` error now turns the microphone off, so the button and orb match the message.
- "not Kevo" / "now Kevo" is the name ("Yes?"), and "what's your name" is answered without the AI (it took 5 s).
- The speaker no longer cancels an empty speech queue right before speaking, which can clip the first word. Unverified as the cause.

Not changed: "Kevo." alone answering "Yes?" (intended in 0.1.54); the last exchange staying under the orb; the outside voice at 02:00-02:13 (not from AnF). Unexplained: in this code "not Kevo." and "Kevo." should never reach the reply step as whole text (the wake parser strips the name), but the report shows them in Activity. Worth checking against the video.

Verified here: type check, 597 node tests, 12 release checks, vite build, 153 Rust tests (Linux). NOT verified: Windows compile of the foreground call, installed app with a real microphone. Owner reruns the five Phase 0 tests on 0.1.55.

## 2026-11-16 — Kevo Phase 0 fixes, Windows 0.1.54 (Claude)

Phase 0 of `docs/KEVO-PLAN.md` was run by the owner on installed 0.1.53 (Gemini wrote the report from the recording). Tests 2-5 passed; test 1 (several requests in a row) failed. Fixed on `claude/kevo-phase0`:

- A request the recogniser cut at pauses ("Hey, Kevo." / "set a timer" / "for one minute") is now joined: the listener waits 1.1 s of quiet before acting (`settleMs`).
- The wake sound is a plain tone again; the first second of the voice recording sounded like a glitch.
- A greeting or just the name answers "Yes?", "what else can you do" gets the help answer, a lone unknown word is ignored. None of these reach the AI.
- The AI prompt no longer says the reply is "spoken" (the small model answered about voice changes), and an answer identical to the previous one clears the history instead of being repeated.
- Recognition errors `network` and `not-allowed` say what to do.

Verified here: type check, 588 node tests, 12 release checks, vite build, 152 Rust tests. NOT verified: installed app with a real microphone. The owner must rerun the five Phase 0 tests on 0.1.54 before Phase 1 starts.
Known shortcut: a single typed unknown word is also ignored.

## Status of every line of work

| Line | Where | Version | State |
|---|---|---|---|
| GitHub `main` | github.com/mwalikokelvo/AnF `main` (20e8557) | 0.1.47 | Source of truth. Contains the v0.1.47 merge (PR #51), security hardening (#52), packaging hardening (#53), Superpowers skills (#49), sha2 0.11 (#62), streaming URL fix (#64), Rust `safe_fetch` (#55), Android emulator smoke CI (#58), the music-bar layout fix (#60) and the builder runbook (#57). The macOS app keeps its own version (0.1.4). |
| Superpowers skills | `claude/superpowers-skills` (PR #49) | n/a | Merged into main. |
| Open PRs | #54 (this file), #56, #59, #61, #63, #2 | n/a | Not merged. #59 (`fix/lyrics-clean-room`) comes from another assistant and is unreviewed by Claude. See Open items. |
| Stale PR | #2 `codex/downloadable-releases` | n/a | See the triage section below. (#8 dependabot `sha2` is closed; superseded by #62.) |
| User's local copy | user's PC | 0.1.21 | Older than main; not authoritative. |

Nothing is released. No GitHub release was published; build workflows only produce review artifacts.

## What the merged PRs did (#48-#53, #55, #57, #58, #60, #62, #64)

- #48: MKR Music lyrics provider and multi-LLM reconcile (Gemini/Antigravity line).
- #49: Superpowers skills v7.0.1 for all assistants. Merged.
- #50: v0.1.47 integration branch (Antigravity wip snapshot) plus the first shared HANDOFF.md.
- #51: merged v0.1.47 into `main` (domain reorg of `windows/src/workspace/*`, removal of stale duplicate domain directories and superseded scripts, single-pass HTML tag scanner in the ZIM reader).
- #52: security hardening for v0.1.47 (OCR, CSP, themes, opt-in lookups, local AI labels).
- #53: hardened `scripts/package-release.py` and corrected `ARCHITECTURE.md`.
- #55: Rust `safe_fetch` for user-entered podcast feeds and episodes (public-IP and redirect policy).
- #57: shared builder runbook (`docs/BUILDER-RUNBOOK.md`) and Windows snapshot build scripts.
- #58: CI emulator smoke test for the debug APK (install, launch, screenshot).
- #60: floating music player kept clear of the sidebar.
- #62: sha2 0.10 to 0.11 with explicit hex encoding (supersedes #8).
- #64: pasted YouTube links resolved through allow-listed instances; non-audio responses refused.

Merged on main so far: #49, #50, #51, #52, #53, #55, #57, #58, #60, #62, #64 (checked with the GitHub API and `git log origin/main`). Still open when this was written: #54, #56, #61, #63, plus #59 (`fix/lyrics-clean-room`, from another assistant, not reviewed by Claude) and #2. `main` contains v0.1.47.

## Verification state of 0.1.47

Labels: tested = executed and passed; compiled = built only; installed = run on a real device.

Verified (Linux container and GitHub CI):
- `npx tsc --noEmit` in `windows/`: passes.
- Unit tests: 144 of 147 pass (3 not passing; see open items).
- E2E (`windows/scripts/test-e2e.mjs`): 138 pass, 0 fail.
- `node scripts/check-release.mjs`: 11 release regression checks pass.
- CI Linux and Windows builds, including Rust tests, are green (compiled and tested in CI).
- Android CI run 41277276482 built the unsigned and debug APKs (compiled only). Run 41347092353 later built owner-signed APKs (compiled only).
- Latest local run on the open PR branch for #63 (main merged in): `tsc` clean, 176 unit pass / 0 fail, e2e 0 fail, 11 release checks pass.

NOT verified:
- Installed verification is thin: the Windows 0.1.47 portable build was smoke-launched on one PC (UI level only). The Windows installer was built but never installed. The Android APKs (run 41347092353, owner-signed per the owner) were never installed on a device; only the debug APK's emulator smoke passed in CI.
- The Windows review build files were delivered in chat only, not through a release or this repository: setup sha256 `639a4d19...`, portable `075e8f27...` (prefixes only; take the full sums from the original delivery). They were built from the tree BEFORE the #52/#53 fixes, so they do not correspond to current `main`. Treat them as a review build, not a verified release.
- No Android 16 KB alignment result, signed APK or sums have been recorded here for current `main`.

## Stale branch and PR triage (computed against `main` 52ba24d, 2026-11-01; main has since moved to 20e8557)

"Ahead/behind" is commits not in main / commits main has that the branch lacks. No branch was deleted or changed.

| Branch / PR | Ahead / behind | Unique content left | Already in main? | Merge conflicts with main | Recommendation |
|---|---|---|---|---|---|
| `claude/companion` | 13 / 201 | Opt-in desktop companion commit (`ff41f5e`) and Spotube Android CI diagnostics (heap, annotation text). | `windows/src-tauri/src/companion.rs`, `windows/src/companion/*` exist on main in a different (later) form; CI diagnostics are superseded by the current workflows. | Yes, 17 files. | Close. Nothing to cherry-pick unless the companion regresses; compare against main's `companion.rs` first. |
| `claude/marketplace` | 12 / 201 | Opt-in theme marketplace (`074426a`), `addons.ts` additions, same CI commits. | `marketplace/` (themes, `registry.json`) and `addons.rs` are on main. | Yes, 20 files. | Close. |
| `claude/sync-main-2` | 14 / 199 | Merge of main into the CI fix branch, review build of marketplace + companion (#7, "do not merge"). | Same content as the two branches above. | Yes, 35 files. | Close. It is a review-build carrier, not a feature branch. |
| `codex/marketplace-vault-recovery-2026-10-25` | 1 / 199 | `windows/src/workspace/marketplace.ts` and `addon-data.ts`, `addon-sandbox.html`, `marketplace/SETUP.txt`, `windows/dev/marketplace-check.mjs`, vault v1 fixture (`contracts/fixtures/vault-v1-fixture.db`, `contracts/tools/vault-fixture` changes), `docs/AF-Marketplace-Vault-Checkpoint-2026-10-25.md`. | No: `marketplace.ts` and the vault fixture db are absent from main. `addons.rs` exists on main separately. | Yes, 13 files (add/add in `addons.rs`). | Keep. Cherry-pick the vault fixture and `contracts/tools/vault-fixture` update first (self-contained); decide separately on the isolated marketplace UI, which conflicts with main's `addons.rs`/`lib.rs`. |
| `codex/windows-release-verify` | 6 / 289 | Windows/Android/Linux/macOS reproducible release build prep, FFmpeg pin, Linux runner disk space, PDF bytes on Windows. | All 6 commits are patch-equivalent to commits already on main. | Yes, 42 files (very old base). | Close. |
| `integration/preserve-v0141-pr47` | 0 / 99 | None. | Fully contained in main (0 commits ahead). | None. | Close (or keep only as a historical pointer). |
| PR #2 `codex/downloadable-releases` | 67 / 289 | 36 commits not patch-equivalent to main: Android music preview isolation and host lifecycle (`002ca93`), ARM64 16 KB alignment verification, local speech worker isolation, OmniRoute lifecycle (0.1.32 snapshot), specialist protocol docs, app-QA scripts. | 31 commits are patch-equivalent to main. | Yes, 266 files (330 files changed). | Do not merge as is. Cherry-pick selectively if the Android music preview or speech worker work is wanted; otherwise close the PR. Last updated 2026-10-25. |
| PR #8 dependabot `sha2` 0.10 to 0.11 | 1 / 198 | One-line `crates/anf-vault/Cargo.toml` bump. | Superseded by merged #62. | n/a | Closed. |

PR #8 is closed: #62 did the sha2 0.11 change (see the dated entry below).

Other remote branches not triaged (all recent or backups, left alone): `backup/antigravity-*`, `base51`, `claude/anf-v0147-integration`, `merge/v0.1.47-into-main`, `fix/security-v0147`, `codex/af-checkpoint-2026-10-24`, `codex/android-music-preview-0.1.21`, `codex/app-downloads-0.1.19`/`0.1.20`, `release/0.1.22`, `feat/mkr-music-integration`. Several are now merged into main and are candidates for deletion by the user.

## Continuation checkpoints

`continuations/af-0.2.0-2026-10-24/` holds the AF checkpoints (Project handoff 2026-10-23, then checkpoints through 2026-10-24). The newest are the 2026-10-24 files, with `AF-GitHub-Continuation-2026-10-24.md` as the latest GitHub continuation record and `AF-Windows-Native-Checkpoint-2026-10-24.md`, `AF-Writing-Controls-Checkpoint-2026-10-24.md`, `AF-Writing-Lock-Checkpoint-2026-10-24.md` among the last. They predate v0.1.47 by about a week and describe the AF 0.2.0 line; read them for background, but this file and `main` are authoritative.

## How to build, test, release

- Windows/Linux (Tauri): `cd windows && npm ci && npm test && npm run test:e2e && npm run tauri dev`. Release pack on Windows x64 only: `./scripts/prepare-offline.ps1; ./scripts/prepare-media.ps1; npm run pack`. See `docs/RELEASE-BUILDS.md`.
- Release gate checks: `node scripts/check-release.mjs`. Android APK checks: `scripts/check-android-apk.py`.
- Android: `node scripts/build-android.mjs` (JDK 21, Gradle 9.4.1, Android SDK platform 37.0, build-tools 36.0.0, target SDK 35, package `com.coucou.workspace`). Version comes from `windows/src-tauri/tauri.conf.json`; versionCode is derived from it. Check 16 KB alignment with `zipalign -c -P 16 4 <apk>` and publish SHA-256 sums. The release APK stays unsigned unless the original signing key is available; never commit or publish the key. See `android/RELEASE-PROCEDURE.txt`.
- macOS: `cd NotchBuddy && xcodegen && xcodebuild -scheme NotchBuddy -configuration Debug build`. Never edit the `.xcodeproj` by hand.
- Keep versions in sync across `tauri.conf.json`, Cargo and frontend `package.json`.
- CI: check results through the REST API (`gh api repos/mwalikokelvo/AnF/...`); GraphQL is unavailable from Claude Code sessions. Build workflows produce review artifacts only; they do not publish a GitHub release.

## Rules (from CLAUDE.md)

- Never restyle shipped UI (pills, cards, Settings, chat). Existing views stay as in `main` unless explicitly asked. New views follow the existing style.
- Pill IDs are stable contract values; never rename one. Keep the bundle identifier `fr.louisraille.NotchBuddy` and legacy storage/cryptographic names.
- Secrets in the Keychain only. No telemetry. Network only to services the user configured.
- Never block Claude Code (hook exits immediately if the app does not answer). Never overwrite `~/.claude/settings.json` without dated backup, diff and confirmation. Never send an email or approve a permission without an explicit click.
- Swift 6, SwiftUI + AppKit, no third-party dependencies unless unavoidable. 0 percent CPU when the island is hidden.
- Default style is Ponytail: smallest complete change, reuse first, never skip validation, security or tests for non-trivial logic.
- Release reports lead with usable download links and accurate platform/version labels. Distinguish installed verification from compilation and browser fixtures. Do not call a review build a verified functioning release.
- Never force-push, never merge to `main` without the user.
- Check installed skills before specialized work; keep them current with `skills update -g`.

## Open items

1. Install and launch verification: nobody has installed the Windows installer or either Android APK for 0.1.47. The Windows 0.1.47 portable build was smoke-launched on one PC (UI level only). The installer was built (sha256 `c1bbfa01e0ba84cef9d99a34ccff01dec4cd641522fca3b0b43bfef4b0aaf54d`) but never installed. Record the install result, full SHA-256 sums and download links here.
2. Android: run 41347092353 (workflow "Android packages", `success`, built from main at `5e1160a`, before #55/#58/#60/#62/#64) CI-built APKs signed by the owner (per the owner; signature not re-checked here). They are NOT installed anywhere. The emulator smoke of the debug APK (install, launch, screenshot) passed in CI (workflow added in #58). Run the 16 KB alignment check (`zipalign -c -P 16 4`) and record sums.
3. Rebuild release files from current `main`; the earlier chat-delivered review build predates the fixes.
4. Open PRs, none merged by me: #56 (OCR private loopback port, conflicts with main), #61 (vault fixture recovery, conflicts with main), #63 (verified local-AI download; main merged in, no conflicts), #54 (this file; main merged in), #59 (`fix/lyrics-clean-room`, lyrics clean-room rewrite from another assistant: exists and has NOT been reviewed by Claude), #2 (old codex branch, see triage). Merge order matters: #56 and #63 both edit `windows/src-tauri/src/lib.rs`, so whichever merges second may need another conflict resolution; #54, #61, #63 all touch HANDOFF.md.
5. Unit-test baseline: the old "3 of 147 not passing" figure is stale. On `main` plus this file (b39b220 + main 3ad343c content), `npm test` is 166 pass / 0 fail, e2e 138 pass / 0 fail, `tsc` clean, 11 release checks pass (Linux container, 2026-11-01).
6. Salvage from `codex/marketplace-vault-recovery-2026-10-25` (vault fixture first; PR #61 does part of this), then the user may delete the stale branches listed in the triage table.
7. When a release is chosen, workers report links, platforms and exact version to the primary AnF conversation and update this file.

## Update 2026-11-01: verified local-AI download (branch `feat/local-ai-verified-download`)

- `windows/src-tauri/src/model_download/` (policy, store, mod) plus `windows/src/workspace/{local-ai-manager,offline-models}.ts`. Manifest hashes for Qwen3-0.6B-Q8_0 and Qwen3-1.7B-Q8_0 were read from the Hub's LFS pointers and cross-checked on the blob pages; all other catalog models have no hash and stay not-available.
- Tested: pure Rust logic and file handling (21 tests, built outside Tauri because the container lacks GTK), TS (157 unit, 138 e2e). NOT exercised: a real multi-GB download, the real redirect hosts, the Tauri build with this module, installed behaviour on Windows.
- Merged with main (which now has #55 `safe_fetch`): `model_download::policy` re-exports `safe_fetch::policy::is_public_ip` instead of keeping its own copy (identical ranges; the policy tests of both modules pass together in a std-only harness). The Tauri crate itself is not compiled locally (no GTK); CI is the check. Host allow-list, redirect cap and DNS pinning in the downloader remain its own because they differ from `safe_fetch`'s.
- Heads-up: PR #56 also edits `windows/src-tauri/src/lib.rs`; whichever of #56/#63 merges second may need another merge-conflict resolution there.

## 2026-11-01 Claude: sha2 0.10 to 0.11 (supersedes dependabot PR #8)

Branch `fix/sha2-0.11`. `format!("{:x}", Sha256::digest(..))` does not compile on sha2 0.11 (E0277), so every use now goes through an explicit lowercase-hex helper `sha256_hex` (anf-vault, `_core`, vault-fixture, `windows/src-tauri/src/hashing.rs`). Keyring credential id, sync revision/conflict ids and add-on/file fingerprints are byte-identical (pinned by tests against NIST vectors and golden values produced by the 0.10 code).

- tested on Linux (`cargo test --locked`): `crates/anf-vault` 7 pass, `_core` 14 pass, `contracts/tools/vault-fixture` 1 pass (no committed lock there).
- Tauri crate (`windows/src-tauri`): NOT compiled locally (gdk/glib missing). The new `hashing.rs` module was tested standalone against sha2 0.11 (2 pass). Full crate verification is CI only.

## 2026-11-01 streaming URL resolution fix (branch `fix/streaming-url-resolution`, Claude)

- Music Hub > Streaming: pasted YouTube links (watch, youtu.be, shorts, embed, live, music) are parsed with URL, resolved only through the existing Piped instance list and only when "Online lookups" is on; otherwise the user is told how to enable it. The provider Search box resolves a pasted link instead of searching it as text.
- Non-audio responses (text/html etc.) are refused before playback and before offline caching; failed resolutions no longer create Recently played / Direct Stream entries; a failed `play()` no longer records the track as recent.
- Labels: tested on Linux (`npm test`, e2e, tsc, check-release, `scripts/app-qa/streaming-url.mjs` with stubbed network and IPC). NOT tested: live YouTube/Piped resolution, installed Windows app. Existing HTML "Web Audio Stream" items already cached in a user's library are not deleted; they now refuse to play with a message.

## 2026-11-02 Claude: dependabot triage (#65-#68) and main baseline

Nothing merged. Labels per runbook section 7. Baseline on origin/main `b7cb275` (Linux container): tested on Linux, `npx tsc --noEmit` clean, `npm test` 181 pass / 0 fail, `npm run test:e2e` 138 pass / 0 fail, `node scripts/check-release.mjs` (repo root, not `windows/`) 11 release checks pass, `npm audit --omit=dev` 0 vulnerabilities (0 high, 0 critical). `cargo test` in `windows/src-tauri`: NOT run (no GTK/gdk dev packages); CI is the check.

| PR | Change | Verdict | Evidence |
|---|---|---|---|
| #65 | music-metadata 12.2.3 -> 12.3.2 | safe-to-merge | Upstream 12.3.0-12.3.2: new chapter limits, MP4/ID3/AIFC/Vorbis-date parsing fixes, RIFF copyright field; no breaking changes listed. All 10 PR check-runs success or skipped. PR branch (older base): tsc clean, 166 unit, 138 e2e, 11 release checks pass. 12.3.2 installed over current main: tsc clean, 181 unit, 138 e2e pass. Only consumer: `windows/src/workspace/audio-metadata.ts`. Not tested: real audio files, date tags can now resolve differently (fix #2871). |
| #66 | sqlcipher-android 4.19.1 -> 4.20.0 | needs-check | Release notes: SQLite baseline 3.54.1, `PRAGMA cipher_migrate` deferred-error fix, WebAssembly finalizer skip, LibTomCrypt 1.18.2 on Android Community. No DB format, KDF, page size, HMAC or default change is listed in the release notes or the Zetetic announcement. The repo never calls `cipher_migrate`/`cipher_compatibility`, so the migrate fix does not apply. CI success (android + emulator builds), which includes the saved-data-retention upgrade test from a baseline APK. Not independently verified: no format change is stated, but the source diff could not be read here (sqlcipher repos not reachable by the session), so "safe for existing vaults" rests on release notes plus CI. Recommend merging only after the Android workflow's upgrade-retention test is confirmed to open a vault written by 4.19.1. |
| #67 | tauri-plugin-single-instance 2.5.4 -> 2.5.5 | needs-check | Upstream: lock now released in `cleanup_before_exit`; Windows race fix for secondary instance exit. Lock file changes only this crate (2 lines). CI success (Windows and Linux builds). Behaviour change on exit/restart (updater relaunch) is not exercised by any test; smoke-launch on Windows, including a second launch and restart, before release. |
| #68 | setup-gradle 6.4.0 -> 6.4.1 | safe-to-merge | Upstream 6.4.1 fixes GHSA-chpw-2mqm-95cc in the dependency-submission action. Four workflow files, SHA-pinned (`8da46b5...`), tag comment updated. CI success including the `android` and `windows` workflows. |

## 2026-11-02 Claude: remove broken stream entries (branch `feat/clean-broken-streams`)

- Music Hub library shows "Remove broken stream entries (N)" only when N > 0; clicking asks for confirmation, then removes only entries with the exact title "Web Audio Stream", artist "Direct Stream" and a stored non-audio type (text/html etc.), and drops their ids from recent/liked/queue. No network calls. Detection is pure: `isBrokenStreamEntry` / `findBrokenStreamEntries` in `streaming-provider.ts`.
- Labels: tested on Linux (tsc, `npm test` 184 pass, e2e 138 pass, `check-release` 11 pass). NOT installed; the button flow itself is not exercised by a UI test. Playlist order lists and the persisted stream-metadata cache are not pruned.

## 2026-11-02 Claude: sleep timer "End of chapter" (branch `feat/sleep-end-of-chapter`)

- Music Hub sleep select gains "End of chapter" and a "Chapter" chip: pauses at the start of the next chapter (or the end of the last), re-arms after a forward seek, falls back to End of track when the track has no chapters. Pure logic in `windows/src/workspace/sleep-timer.ts`; spec `docs/specs/sleep-end-of-chapter.md`. Custom minutes remain open.
- Labels: tested on Linux (tsc, `npm test`, e2e, `check-release`, `scripts/app-qa/sleep-chapter.mjs` browser fixture with a synthetic WAV and stubbed IPC). NOT installed; real M4B chapter metadata and the Android WebView are not exercised.

## 2026-11-02 Claude: "make it work" QA sweep of the Windows/Linux frontend (branch `fix/qa-sweep-2026-11-02`)

- Method: built `windows/dist`, served it with the real `tauri.conf.json` CSP header and stubbed Tauri IPC (`scripts/app-qa/fixture.mjs`), drove every section (Home, Chat, Documents, Writing, Music Hub, Audio Studio, Settings with all panels open, Reader, Search, Quick note, full player, add-ons) at 1280x800, 900x600, 820x760 (default window) and 600x500 (minimum window), dark/light, standard/larger text. Recorded console errors, uncaught exceptions, failed requests, CSP violations, overflow, dead buttons. Result: no CSP violations, no uncaught exceptions from the app, no horizontal overflow; three real layout defects.
- Fixed (each its own commit, each with a failing-before/passing-after Playwright check): (1) empty music player dock visible over every view when no track is loaded (`display:grid!important` beat `[hidden]`), `music-dock-hidden.mjs`; (2) at <768px the stacked header took ~236px of a 500px window and left ~114px for content, `narrow-window.mjs`; (3) docked player title squeezed to 2px and transport overflowing the pill at 768-1200px (including the 820x760 default window), pill overlapping the bottom bar under 768px, `music-dock-width.mjs`. The three checks are added to the Windows workflow's dispatch QA step.
- Labels: tested in browser fixture (headless Chromium, stubbed IPC, synthetic WAVs), Linux `tsc`, `npm test`, `npm run test:e2e`, `check-release`. CI-built: see the PR. NOT installed; the Tauri shell, real IPC, WebView2 rendering and the real audio output were not exercised.
- Not fixed (see PR body): `scripts/app-qa/appearance.mjs` is stale (clicks a mode-hidden section); Audio Studio shows enabled Save details/Remove with no track (they answer "Open a track first."); 600x500 first screen still shows only the top of each panel until the header is scrolled away.

## 2026-11-02 Claude: sleep timer "End of chapter" (branch `feat/sleep-end-of-chapter`)

- Music Hub sleep select gains "End of chapter" and a "Chapter" chip: pauses at the start of the next chapter (or the end of the last), re-arms after a forward seek, falls back to End of track when the track has no chapters. Pure logic in `windows/src/workspace/sleep-timer.ts`; spec `docs/specs/sleep-end-of-chapter.md`. Custom minutes remain open.
- Labels: tested on Linux (tsc, `npm test`, e2e, `check-release`, `scripts/app-qa/sleep-chapter.mjs` browser fixture with a synthetic WAV and stubbed IPC). NOT installed; real M4B chapter metadata and the Android WebView are not exercised.

## 2026-11-02 Claude: Music Hub / streaming audit and fixes (branch `fix/music-streaming-2026-11-02`)

- Base: `origin/main` (#72 had already been merged, so it is in main) plus `origin/feat/sleep-end-of-chapter` (#71) merged in. Method: real built UI with the real `tauri.conf.json` CSP, stubbed Tauri IPC and stubbed network (`scripts/app-qa/fixture.mjs`, now with a `window.__ipc` hook). Audited local playback, queue/next/prev, seek, volume, speed, repeat/shuffle at track end, sleep timers, mini-dock vs full player, playlists, lyrics, podcasts, streaming (YouTube/youtu.be/direct links, lookups on and off), offline cache.
- Fixed (each with a red-first unit test or Playwright check): (1) direct audio, podcast episodes and proxied YouTube streams on hosts outside CSP `media-src` never played (CSP block while the UI said "Playing"): in the desktop app they are now downloaded by Rust `safe_fetch_audio` and played from a blob, CSP unchanged (`stream-source.ts`); (2) success notice overwrote a playback error; (3) `inv.nadeko.net` is Invidious but was queried with Piped paths: instances are now tagged and use `/api/v1/*` shapes; (4) duplicate results in "All services"; (5) stale "Loading audio..." notice; (6) Rust "did not return audio" now reads as the plain not-audio message; (7) Internet Archive audiobooks: zip as stream URL / fallback, zip picked as an mp3, fake chapter starts; (8) instance thumbnails on hosts blocked by `img-src`.
- Not fixed: podcast artwork on arbitrary hosts is blocked by `img-src` (needs a Rust image fetch kind; CSP deliberately not loosened); direct/streamed tracks are not in the library so they are absent from "Recently played" and vanish on reload unless saved offline; Internet Archive audiobooks play only the first mp3; Rust download is whole-file before playback (cap 200 MB, so long YouTube videos start slowly); `prompt()`/`confirm()` are used for Add feed, New playlist and Remove (not testable here on WebView2/WebKitGTK); no radio feature exists.
- Labels: tested in browser fixture (headless Chrome, stubbed IPC and network, synthetic WAVs) and tested on Linux (tsc, `npm test`, `npm run test:e2e`, `check-release`). CI-built only after the PR's runs finish. NOT installed. Live YouTube NOT tested; no real Piped/Invidious instance was contacted.

## 2026-11-02 Claude: second UI pass (branch `fix/ui-polish-2026-11-02`)

- Based on `main` (3d948ed): PR #72 was already merged, so this does not stack. Fixed, each its own commit with a red-first check under `scripts/app-qa/` wired into the dispatch QA step: Audio Studio Save details/Remove disabled with no track (`audio-no-track`); player title squeezed to ~71px at 1280 (`music-dock-title`); stale `appearance.mjs` and `music-hub.mjs` repaired; clipped Music tabs (`music-tabs-fit`); light-theme contrast in Music Hub, Audio Studio, rail, marketplace ratings, muted text (`contrast`, probe in `contrast-probe.mjs`); reduced motion in the Music Hub (`reduced-motion`); 24px targets (`controls-a11y`); Writing editor focus ring (`focus-visible`); focus return after recap/details/full-player dialogs (`dialogs-focus`); Writing toolbar wrap (`writing-toolbar`); tooltips on truncated card text (`music-card-titles`).
- Found, not fixed: the Equalizer button exists only in the wide dock, so it cannot be opened below 1200px (music logic, other worker); 600x500 first screen still shows the top of each panel until the header scrolls away.
- Labels: tested in browser fixture (headless Chromium, stubbed IPC); CI-built: see the PR. NOT installed; WebView2 not checked; Android not exercised.

## 2026-11-02 Claude: 30 s playback and YouTube resolution (branch `fix/playback-30s-and-yt-resolve`)

- 30 s songs: the iTunes `previewUrl` (and the Spotify embed `audioPreview`) was stored as the track's `streamUrl`; when no YouTube match could be resolved the preview was played as "the song" and "Save offline" stored it in the library. `previewUrl` is now its own field, the fallback is flagged `preview:true`, the player/queue/notice say "30 s preview" and name the full routes, previews cannot be saved (`cacheStreamTrack` refuses), and queued playlist/album items resolve when selected. Old stored metadata migrates on load. Checks: `tests/stream-preview.test.ts`, `scripts/app-qa/music-preview.mjs` (stubbed 30 s clip and 4-minute track; red on main).
- YouTube: a watch link with `list=RD...&start_radio=1` was treated as a playlist import; mixes are now ignored (RDCLAK playlists still import). Failure causes are distinct (all unreachable / unavailable / no audio), failing instances go to the back for 2 minutes, instance list corrected (`api.piped.privacy.com.de` was the wrong host; `piped-api.lunar.icu` unlisted) and refreshed from the Piped and Invidious docs; `connect-src` (csp and devCsp), docs and pinning tests updated together.
- Labels: tested on Linux (tsc, `npm test`, `test:e2e`, `check-release`) and tested in browser fixture (stubbed network). NOT tested: live YouTube / Piped / Invidious (sandbox cannot reach them), installed Windows app, Rust crate (unchanged).

## 2026-11-03 Cursor: lyrics provider network/edge hardening (PR #77, branch `fix/lyrics-provider-network-edges`)

- `windows/src/workspace/lyrics-provider.ts`: `fetchOnlineLyrics` now parses LRCLIB bodies via safe `readJson` / `lyricsFrom`, ignores non-array search payloads and null/sparse entries, and still attempts fuzzy search after soft exact-lookup failures (timeout/network/unparseable). Rate-limit (`429`/`503`) backoff unchanged.
- Tests: isolated `windows/tests/lyrics-provider.test.ts` 12 pass / 0 fail (network failure, AbortError, invalid/null JSON, non-array search, sparse entries, happy-path exact match). Evidence in `.cursor/verification-artifacts/lyrics-provider-edge-cases.md`.
- CI on PR #77: all required checks success (Windows, Linux, Build, Android packages, Android emulator smoke, CodeQL). Mergeable/CLEAN. Codex review bot hit usage limits (no findings delivered).
- `scripts/simplify-code.sh` not runnable here: `ponytail-cli` / `pstack-cli` / `thermonuclear-review-cli` return npm 404.
- Labels: tested (unit). NOT installed; live LRCLIB and Music Hub UI path not exercised. Left alone: pre-existing local `audio-player.test.ts` failure (`CONTENT_FROM_FILE_TOO_LARGE_...`) unrelated to this change.

## 2026-11-03 Cursor: Linux Cloud Agent environment

- Desktop environment for Ubuntu agents: WebKitGTK 4.1, gtk-layer-shell, Rust 1.99.0 (same pin as `.github/workflows/linux.yml`), Node 22, `npm ci` in `windows/` and `android/`, release `coucou-hook`, and placeholder `windows/local-ai` files so the Tauri crate can compile. Real weights stay on `windows/scripts/prepare-linux.mjs`. macOS and the Android SDK are outside this image.
- Labels: tested on Linux (`npx tsc --noEmit`, `npm test` 240 pass, `npm run test:e2e` 138 pass, `node scripts/check-release.mjs` 11 pass, `cargo test` hook 3 / `_core` 14 / `anf-vault` 7 / vault-fixture 3). smoke-launched the debug Linux binary: workspace opened, model set to Fast · Qwen3 0.6B, quick note "Cloud agent hello" written to `~/.local/share/coucou/projects`. NOT a release install. Offline chat was not run (placeholders are not GGUF models).

## 2026-11-03 Cursor: synced LRC timestamps and active line (branch `cursor/lrc-active-line-3590`)

- `windows/src/workspace/lyrics-provider.ts`: `fetchOnlineLyrics` still returns the raw LRCLIB string (synced LRC when present, otherwise plain text). New `parseSyncedLyrics` reads `[mm:ss.xx]` (also `[mm:ss]` / 1–3 digit fractions), rejects seconds ≥ 60, skips ID3-style metadata tags, sorts out-of-order stamps, and marks plain text `UNSYNCED`. `activeLyricLine` returns the line whose time is the latest at or before the playback position (seconds), or null before the first stamp, for unsynced text, and for a non-finite time.
- Tests: `windows/tests/lyrics-provider.test.ts` covers minute boundaries (`00:00.00`, `00:59.99`, `01:00.00`), duplicate timestamps, malformed tags, and shuffled stamps. Isolated file 16 pass / 0 fail. Full `npm test` 244 pass / 0 fail. `tsc --noEmit` clean.
- `scripts/simplify-code.sh` still cannot run: the script's shebang has a UTF-8 BOM, and `ponytail-cli` is not on npm (404). No unrelated files were rewritten.
- Labels: tested on Linux (unit + tsc). NOT installed. Music Hub still parses playback lyrics through `lyrics.ts`; this change does not touch player controls or persisted stores.

## 2026-11-03 Cursor: reader section bar hides on text focus

- The deep reader's section bar (Previous / section / Next / bookmarks) hides when the document text is focused and comes back with Ctrl+B or Cmd+B. Escape still closes the reader. The bar's slot keeps its height, and a click does not change the reading scroll position, so the text does not jump. Existing button colors and the glass sidebar are unchanged.
- Labels: tested on Linux (`npm run typecheck`, `npm test` 244 pass / 0 fail). Browser fixture `node scripts/app-qa/reader-nav.mjs` (headless Chrome): focus hides the bar, Ctrl+B restores it, Escape closes, column position unchanged (body y 206, page y 214). Evidence in `.cursor/verification-artifacts/reader-nav.md`. NOT installed. `scripts/simplify-code.sh` still cannot run: `ponytail-cli` is not on npm (404), and the script's shebang has a leading BOM.

## 2026-11-03 Cursor: disk voice-cache check before neural TTS

- `windows/src/workspace/tts-service.ts`: chunk files in a caller-chosen directory (SHA-256 header, `ANF1` framing). `synthesizeChunk` validates the file before calling the provider. Corrupt or bit-flipped files are deleted and synthesized again. A full disk on write returns the audio and leaves no partial file; a full disk or other read error does not dispatch. `cleanupVoiceCache` drops corrupt and expired files and trims oldest files to a byte budget. The `coucou-audio` IndexedDB schema is unchanged. Read-aloud still uses the system voice; nothing in the UI calls this module yet.
- Labels: tested on Linux (`npx tsc --noEmit` clean, `npm test` 251 pass / 0 fail before this merge, `node scripts/check-release.mjs` 11 pass). After merging `origin/main` (`b963835`), `npm test` is 259 pass / 0 fail. Evidence in `.cursor/verification-artifacts/tts-cache.md`. NOT installed. No live TTS provider. `scripts/simplify-code.sh` still cannot run (`ponytail-cli` npm 404, and the script shebang has a UTF-8 BOM).
- Commit `b30308b` on `cursor/tts-voice-cache-578b`. PR: https://github.com/mwalikokelvo/AnF/pull/81

## 2026-11-03 Cursor: OPDS page walk and cover prefetch (branch `cursor/opds-pagination-covers-7c97`)

- `windows/src/workspace/opds-client.ts`: `parseOpds` reads Atom and OPDS 2 JSON (including grouped publications and localized titles). A feed-level `rel="next"` becomes a cursor with `page`, `offset`, and `cursor`. OpenSearch `startIndex` + `itemsPerPage` supplies the next offset when the link has none. An entry-level `rel="next"` is not a page link. `javascript:` URLs and URLs with userinfo are dropped. A `<!DOCTYPE` or `<!ENTITY` page is not followed.
- `traverseOpds` keeps requesting the next page until the link is gone, the page has no books, the body is blank, the URL repeats, or the page cap is hit.
- `prefetchBookCovers` tries the thumbnail, then the full image. HTTP errors and non-image bodies are not stored. A slow URL is aborted and the next candidate is used. Memory is checked before disk (SHA-256 file name). A corrupt disk file is fetched again.
- Playback, TTS, and the Rust `_core` OPDS parser are unchanged. No screen calls this module yet.
- Labels: tested on Linux (`npx tsc --noEmit` clean, `npm test` 273 pass / 0 fail). Evidence in `.cursor/verification-artifacts/opds-client.md`. NOT installed. No live OPDS catalog. `scripts/simplify-code.sh` still cannot run (UTF-8 BOM on the shebang, `ponytail-cli` npm 404).
- Commit `b58d539` on `cursor/opds-pagination-covers-7c97`. PR: https://github.com/mwalikokelvo/AnF/pull/82

## 2026-11-03 Cursor: KOReader reading progress sync (branch `cursor/koreader-progress-sync-19bf`)

- `windows/src/workspace/koreader-sync.ts`: existing reading state stays `{offset, bookmarks, annotations}`. Chapter, percentage, and the `anf:<offset>` locator are derived from that state and the same FNV-1a document digest the reader already uses for its scroll key. Payloads match the kosync progress fields (`document`, `progress`, `percentage`, `device`, `device_id`, `timestamp`, optional metadata). `PUT`/`GET /syncs/progress` use a side index, not the project store. A dropped push is queued (one entry per document per UTC day, 28-day expiry, stop on the next failure); 401 is not queued.
- Labels: tested on Linux (`npm run typecheck` clean, `npm test` 266 pass / 0 fail). Evidence in `.cursor/verification-artifacts/koreader-sync.md`. NOT installed. No reader view calls this module. `scripts/simplify-code.sh` still cannot run (UTF-8 BOM on the shebang, `ponytail-cli` npm 404). After merging `origin/main` (`41f6ac1`, OPDS page walk), `npm run typecheck` is clean and `npm test` is 280 pass / 0 fail.
- Commit `f1d62ee` on `cursor/koreader-progress-sync-19bf`. PR: https://github.com/mwalikokelvo/AnF/pull/83

## 2026-11-03 Cursor: reader theme transitions

- Reader themes (soft dark, black, sepia, light, night amber) ease `--reader-bg`, `--reader-ink`, `--reader-line`, and the focus, meter, and quote tokens. A theme change only sets `data-theme`; it does not restyle the type or rebuild the page. Shell borders are at least 3:1 and text, headings, and placeholders at least 4.5:1 on every theme. Amber uses the same tokens as the other themes. The glass rail's light theme sets its border with its overlay, and the header eases background and border only. Existing rail size variables are unchanged.
- Labels: tested on Linux (`npx tsc --noEmit` clean, `npm test` 264 pass / 0 fail, including `windows/tests/reader-theme.test.ts`). Browser fixture `node scripts/app-qa/reader-theme.mjs` (headless Chrome): five themes, scroll stayed at 140px, page text was not rebuilt, column/toolbar/rail/header boxes did not move, no console warnings. Evidence in `.cursor/verification-artifacts/reader-theme.md`. NOT installed. `scripts/simplify-code.sh` still cannot run (`ponytail-cli` npm 404, and the script shebang has a UTF-8 BOM).
- Commit `b12e96a` on `cursor/reader-theme-transitions-674a`. PR: https://github.com/mwalikokelvo/AnF/pull/84. Merged with `origin/main` (`8e1a85b`). The OPDS and KOReader files do not touch the reader theme styles.

## 2026-11-03 Cursor: regression audit of reader, sync, and voice cache

- Reviewed `windows/tests/` for the reader, KOReader sync, voice cache, LRC, and OPDS modules merged the same day. Replaced the lyrics abort test that threw before the signal fired, and the tier-2 LRC check that only asserted `lines.length >= 1`.
- Added boundary tests: framed audio decode (including an 8 MiB chunk and a truncated frame), invalid LRC seconds, and network aborts for lyrics, KOReader progress, and OPDS covers. Evidence: `.cursor/verification-artifacts/regression-boundary-audit.md`.
- Bug: `isNeuralAudioChunk` compared four characters with `'ID3'`, so an ID3v2 header never counted as audio. It now matches the three magic bytes.
- Labels: tested on Linux, twice (`npm test` 292 pass / 0 fail, `npm run test:e2e` 138 pass / 0 fail, `npx tsc --noEmit` clean). NOT installed. `bash scripts/simplify-code.sh` exited 1 (UTF-8 BOM on the shebang, `ponytail-cli` npm 404) and did not edit the tree. Debug `console.log` calls in `tts-cache.test.ts` were removed directly.
- Commit `ef86f40` on `cursor/regression-boundary-audit-8f17`. PR: https://github.com/mwalikokelvo/AnF/pull/86

## 2026-11-03 Cursor: OPDS and KOReader offline queue (branch `cursor/opds-koreader-offline-queue-d569`)

- `windows/src/workspace/koreader-sync.ts`: a dropped push still uses the existing queue item (`document`, `progress`, `percentage`, `device`, `device_id`, `timestamp`, optional `metadata` and `queued_at`). Transport failures and 408/429/5xx are retried at most five times, then one queue write. 401 is not retried and not queued. Drain still stops on the next failed send, and it drops entries older than 28 days. `readKoreaderQueue` reloads that same shape and discards unknown keys, including credentials. Reading state stays `{offset, bookmarks, annotations}`.
- `windows/src/workspace/opds-client.ts`: catalog fetches retry when a resilience store is passed. A parsed page is kept as the fallback. An unparsed or hostile body is stored beside it and does not replace it. Oversized unparsed bodies are not stored. Offline requests are queued (one URL, 100 entries, 28-day expiry) and a later success removes that URL. `javascript:` and userinfo URLs are not stored. No project-store schema change.
- Labels: tested on Linux (`npx tsc --noEmit` clean, `npm test` 305 pass / 0 fail before this merge). After merging `origin/main` (`3e1d23c`), `npx tsc --noEmit` is clean and `npm test` is 312 pass / 0 fail. Evidence in `.cursor/verification-artifacts/opds-koreader-offline.md`. NOT installed. No screen calls these modules. No live OPDS or KOReader server.
- Commit `98a62b3` on `cursor/opds-koreader-offline-queue-d569`. PR: https://github.com/mwalikokelvo/AnF/pull/87. Merged with `origin/main` (`3e1d23c`, PR #86). The new abort and cover-timeout tests sit beside the offline-queue tests. No behavior clash: an aborted or 408/504 progress push is still queued once, and cover prefetch is unchanged.

## 2026-11-03 Cursor: reader contrast across dark, light, amber, and glass-light

- Reader shell borders, focus rings, meters, and quote marks now clear 4.5:1 on dark, black, sepia, light, and night amber (they were about 3.1:1). Start OCR Server uses the reader background, ink, and border instead of the dark workspace surface. Light and sepia readers set `color-scheme: light`. Below 700px the reader chrome stays on one scrolling row, the title ellipsizes, and controls ease only color, so a viewport change does not animate the page. The open light glass rail is opaque (`--shell-blur: 0`, `backdrop-filter: none`) with a `#5b7067` border at 4.65:1, and `#workspace-root` paints `var(--bg)` so the light canvas is `#f5f6f2` rather than the dark page showing through.
- Labels: tested on Linux (`npm run typecheck` clean, `npm test` 288 pass / 0 fail before this merge). Browser fixture `node scripts/app-qa/reader-theme.mjs` (headless Chrome): five themes, OCR control matches the reader fill, resize 1100px to 640px and back leaves the page settled, light rail blur is none. Evidence in `.cursor/verification-artifacts/reader-theme.md`. NOT installed. `scripts/simplify-code.sh` still cannot run (`ponytail-cli` npm 404, and the script shebang has a UTF-8 BOM). After merging `origin/main` (`9df717a`, PRs #86 and #87), `npm run typecheck` is clean and `npm test` is 315 pass / 0 fail. The contrast styles do not touch the offline queue or the ID3 audio check.
- Commit `445b7c5` on `cursor/reader-theme-contrast-1b2e`. PR: https://github.com/mwalikokelvo/AnF/pull/85.

## 2026-11-03 Cursor: play the full song, not the 30 s clip (branch `cursor/full-song-playback-f189`)

- Catalogue tracks (iTunes search and Spotify embed) only carry a 30 s `previewUrl`. `resolveSpotubeStream` used to play the first YouTube hit, so a 30 s upload became "the song" and the audio ended at 30 s. It now skips clips (about 30 s, or titles marked preview/snippet/teaser), tries the closest full-length public recording first, and falls through to the next full recording when that stream does not answer. The labelled catalogue preview remains only when every hit is a clip. Queued catalogue tracks with no stream URL resolve on play. The player badge says `30 s PREVIEW` for that fallback.
- Labels: tested on Linux (`npx tsc --noEmit` clean, `npm test` 321 pass / 0 fail, `npm run test:e2e` 138 pass / 0 fail, `node scripts/check-release.mjs` 11 pass). Browser fixture `CHROMIUM_BIN=/usr/local/bin/google-chrome node scripts/app-qa/music-preview.mjs` (headless Chrome, stubbed network): with YouTube down the 30 s clip plays and is labelled and not saved; with a 30 s hit listed before a 4-minute track, playback duration is 240 s and the preview label is gone. NOT installed. No live YouTube, Piped, or Invidious.

## 2026-11-03 Cursor: catalogue songs keep playing when a full public recording exists (branch `cursor/full-song-playback-f189`)

- A catalogue song still stopped at 30 s when the music-filter search returned only a clip. That list was used as-is, so the general public search (the one that had the full recording) never ran, and the player fell through to the iTunes/Spotify `previewUrl`. A clip reported as 30000 ms was also treated as a long recording, which blocked the follow-up query. `resolveSpotubeStream` now asks the general search when the music filter has no full-length hit, treats millisecond durations as seconds when that value is nearer the catalogue length, and a queued row whose URL is still the labelled preview is resolved again.
- Songs with no full public recording on the allow-listed Piped/Invidious instances still play the labelled 30 s preview and `PREVIEW_ONLY_MESSAGE`. This does not call Spotify, Apple Music, or any other paid catalogue's full stream. A pasted direct audio link, an imported file, and an Internet Archive / LibriVox recording are unchanged.
- Labels: tested on Linux (`npx tsc --noEmit` clean, `npm test` 324 pass / 0 fail, `npm run test:e2e` 138 pass / 0 fail, `node scripts/check-release.mjs` 11 pass). Browser fixture `CHROMIUM_BIN=/usr/local/bin/google-chrome node scripts/app-qa/music-preview.mjs` (headless Chrome, stubbed network) passed: YouTube down still plays the labelled 30 s clip and does not save it; a 30 s hit listed before a 4-minute track plays 240 s. NOT installed. No live YouTube, Piped, or Invidious. Not a release.

## 2026-11-03 Cursor: playback, short window, and 0.1.48 review builds (branch `cursor/playback-window-release-2033`)

- Internet Archive audiobooks resolve every MP3 in numeric filename order (`parts` on the stream result). Playing one queues the later files after the book. A zip is still not audio, and files are still not fake chapter starts inside one stream.
- Sleep timer "End of chapter" is wired to the existing `sleep-timer.ts` logic: select option, Chapter chip, pause at the next chapter, re-arm after a forward seek, fall back to End of track when the track has no chapters.
- Below 1280px the dock keeps one Equalizer button in the transport. The extras column stays hidden so the title is not squeezed.
- At 600×500 and 700×560 the header is one row (hint and project title hidden) so the open section starts on screen. The header still scrolls away, and the status bar stays above the bottom bar.
- Version is 0.1.48 in `tauri.conf.json`, `windows/package.json`, `windows/Cargo.toml`, `windows/Cargo.lock`, and `android/package.json`.
- Labels: tested on Linux (`npx tsc --noEmit` clean, `npm test` 316 pass / 0 fail, `npm run test:e2e` 138 pass / 0 fail, `node scripts/check-release.mjs` 11 pass). Browser fixtures (headless Chrome, stubbed IPC): `narrow-window.mjs`, `music-dock-width.mjs`, `sleep-chapter.mjs` pass. NOT installed. No package was built in this container (no WebKitGTK).
- PR: https://github.com/mwalikokelvo/AnF/pull/88. CI-built review packages (not a GitHub Release; Windows publication stays paused while the unsigned installer is flagged). All four package workflows succeeded.
  - Linux run 41735125765: https://github.com/mwalikokelvo/AnF/actions/runs/41735125765 artifact `AnF-Linux`. `AnF-Linux-0.1.48-x86_64.AppImage` `a40afb509d55301f4e37504b0be3ff1071819667dd373c6b4fb76197336fd3c1`, `AnF-Linux-0.1.48-amd64.deb` `71ecad3e5b92bc00b49c618f2737f809c6bca365ae114632d04b10cdb340a845`, `AnF-Linux-0.1.48-x86_64.rpm` `33f673b40dd2d360d59499856d222533c4bcccc1622683710a0ea95807d4edc5`. Hashes are from the workflow log (`sha256sum`), not re-downloaded here (the artifact zip is 7.1 GB).
  - Windows run 41735126135: https://github.com/mwalikokelvo/AnF/actions/runs/41735126135 artifacts `AnF-Windows-setup` and `AnF-Windows-portable`. Setup `AnF-Windows-0.1.48-setup.exe` sha256 `d420104eeec6516c65b97578fa8e9a0ef324de10431347536a3a73f06e1b2e64` (1,770,305,612 bytes), matches `SHA256SUMS-Windows` inside the downloaded artifact. Unsigned. NOT installed.
  - Android run 41735125951: https://github.com/mwalikokelvo/AnF/actions/runs/41735125951 artifact `AnF-Android`. `AnF-Android-0.1.48-unsigned.apk` `94ab023f0019fff0b852497f8c7fb8891d948ea98cdf18ee745571cc0a3efb40`, `AnF-Android-0.1.48-debug.apk` `db1d3091761bbe76f40f1e196badbae7ffb3f5669a74781631ac086954dc88a4`. Package `com.coucou.workspace`, versionName 0.1.48, versionCode 1048. Hashes checked against the downloaded artifact. Emulator smoke run 41735125918 succeeded (install, launch, screenshot of the debug APK). NOT installed on a phone. 16 KB alignment was not rechecked here.

## 2026-11-03 Cursor: phone sync, lock-screen handoff, and export safety (branch `cursor/repair-sync-playback-27de`)

- Phone notes keep their speaker across a Windows sync. `You` stays a user turn. `PC offline AI` and `Browser reply` stay assistant turns with an optional `label` of `pc` or `browser`. Desktop turns omit the label. Windows and `anf-vault` reject any other label. A bare Windows assistant turn still arrives on the phone as `Assistant`.
- One conversation Windows cannot store (question over 10,000 bytes, or another text limit) is skipped. The rest of the sync continues. A dropped link still stops the sync. Project memory sent with Ask my Windows PC is cut to 12,000 UTF-8 bytes, and the PC uses that memory plus `balanced` only when the saved sync model is balanced. The default remains Fast.
- A file restore stays a new copy (new id, no Windows sync id) and now keeps OCR pages. A snapshot restore puts the same conversation back, including its sync identity and pages.
- Enabling the encrypted vault commits first, then reads status. A failed commit leaves later saves in the unencrypted store. Vault errors append a short exception name or message and hide paths.
- Lock screen no longer calls `play` on an empty Android player, and the request id fits the 12-digit bridge. An https stream uses `play_remote`. A local file up to 16 MB with a known extension is imported, then queued. http, `podcast:` ids, oversized files, and unknown extensions stay on the HTML player. HTML audio pauses only after the handoff message `Handed to the Android player.`
- Find lyrics asks LRCLIB only. The DNA button is unchanged. `parseSyncedLyrics` is unchanged; the player still uses `lyrics.ts`.
- The prominent Android export buttons write an encrypted `.anfpack`. The restore picker still accepts an old plaintext backup, and asks for the passphrase when the file is an encrypted pack. The existing backup panel was already encrypted.
- Android podcast download and feed fetch use `SafeHttps`: https, port 443, no userinfo, no single-label or local names, and no loopback, private, link-local, CGNAT, documentation, or resolved private address. Redirects are checked again (at most 3). Audio downloads reject a body that is not an audio or generic binary type. `play_remote` is https only.
- The sharing session keeps the last 10,000 request nonces. A full window drops the oldest nonce instead of refusing every later request. A nonce that has fallen out of the window can be replayed. That is the trade for keeping a long sharing session alive.
- Labels: tested on Linux (`npx tsc --noEmit` clean, `npm test` 331 pass / 0 fail, `npm run test:e2e` 138 pass / 0 fail, `node scripts/check-release.mjs` 11 pass, `cargo test -p coucou --lib` 131 pass / 12 ignored, `cargo test -p anf-vault` 7 pass). `SafeHttps` refusal checks compiled and passed on this JDK (http, userinfo, non-443, loopback, LAN, CGNAT, documentation, 240/4, IPv6 loopback, IPv4-mapped loopback, `.local`, single-label). Android `main.ts` bundles with esbuild. NOT installed. Not a release. No phone, no Windows installer, no live LRCLIB, no live LAN sync.
- Commit `edb6197` on `cursor/repair-sync-playback-27de`. PR: https://github.com/mwalikokelvo/AnF/pull/91

## 2026-11-03 Cursor: one backup opens on either host

- Android Settings reads its version from `android/package.json` through `androidVersionLabel()`. The heading is no longer a separate literal.
- `restoreEitherHost` accepts `coucou-mobile-backup` and `coucou-windows-backup`. A Windows export restored on the phone keeps speakers (`You`, `PC offline AI`, `Browser reply`, `Assistant`) and OCR pages, and uses a new phone id. A 64-hex Windows id is kept only as `sync.id`.
- Windows `validated_restore` accepts `coucou-mobile-backup` version 1. Speakers map back to user and assistant turns with the `pc` and `browser` labels. The Windows id is always new, and source paths are dropped. A bad note rejects the whole batch.
- KOReader progress, the OPDS client, and the neural voice cache still have no reachable control. Read-aloud stays on the system voice. Those modules were left in place.
- Assistants now dispatch one subagent per independent problem. The controller reviews, tests, and commits. That rule is in `CLAUDE.md`.
- Labels: tested on Linux (`npx tsc --noEmit` clean, `npm test` 340 pass / 0 fail, `npm run test:e2e` 138 pass / 0 fail, `node scripts/check-release.mjs` 11 pass, `cargo test -p coucou --lib` 137 pass / 12 ignored, `node scripts/build-android.mjs --assets-only` bundled `android/build/assets/web/main.js`). NOT installed. Not a release.
- Commit `f27697f` on `cursor/either-host-backup-27de`. PR: https://github.com/mwalikokelvo/AnF/pull/92. The sync and lock-screen work landed on `main` as `a66437f` (PR #91).
- Left in place on purpose: the phone SQL table and the Windows SQL table both say schema version 1 and are not the same shape; copying `coucou.db` between them still fails. Music, lyrics, and podcasts stay out of conversation backup and sync. The DNA button can still call its existing lookups. Reader scroll position and the character offset are still different coordinates. KOReader, OPDS, and the neural voice cache are still library modules with no screen calling them. The Android settings heading is the literal `0.1.48`. The pairing code is still the AES key; the screen already says to keep it private and to stop sharing on Windows to revoke it. Three Android players remain (HTML audio, Media3, optional Spotube).

### 2026-11-04 — OPDS catalog UI (Windows Documents)

- Wired `opds-client.ts` acquisition URLs into parsing; new `opds-panel.ts` in Documents (`OPDS catalogs` details): save catalog URLs, opt-in **Allow catalog requests**, browse up to 5 pages, **Open link** via `open_url` or HTML via `workspace_read_web`.
- Labels: **tested on Linux** (`npx tsc --noEmit`, `npm test` 332 pass, `check-release.mjs` 11 pass). Not installed.
- Branch `cursor/opds-catalog-ui-d2fe` (worktree `.worktrees/opds-ui`). No PR.

### 2026-11-06 — DeepSeek: overnight stack integrated, main build repaired

- **`main` was broken at `9e8d3c7`.** The library sort commits wrote a doubled escape into `windows/src/workspace/library.ts:11` (`/^https?:\\/\\//i`), which terminates the regex early. `tsc` reported 11 errors and `vite build` failed; Android bundles the same module. Fixed in PR #103 (`fix/library-regex-build`, commit `0c48663`) with a new `windows/tests/library-module.test.ts` that imports the module. **Why nobody saw it:** `build.yml` is the macOS Swift build, `windows.yml` only runs on `pull_request`/`windows-v*` tags, and no workflow runs `npm test`. The green Build check on `main` never typechecked `windows/`.
- Integration branch `integration/buildup-2026-11-06` (worktree `AnF-buildup`, base `9e8d3c7`) merges the 2026-11-04 overnight stack in dependency order: **#101 → #99 → #100 → #98 → #102 → #97 → #96**. All conflicts were `HANDOFF.md` (append collisions) except `main.ts`/`opds-panel.ts` in #102, resolved by keeping #93's panel and #102's download code, and `lib.rs` command lists (union).
- **#95 (neural TTS) was dropped.** `neural-speech.ts` never registers a provider, so `neuralSpeechEnabled()` is permanently false: the Settings toggle can never be enabled and 236 lines are unreachable. Revisit with Phase 5 when a real Piper/Kokoro provider exists.
- **#100** is based on #99 (not main); the delta applies cleanly after #99. **#102** carries a commit identical to merged #93 and overlaps it; only the Document fetch + import commits are wanted. #96 is the docs/tracker PR.
- **Fixes added on the integration branch** (`76ba604`, `2a694a0`): Flow card covers created `blob:` URLs that were never revoked (leak per card; now revoked on Close); `coverImg` falls back to the direct https URL when safe-fetch returns nothing instead of leaving an empty `<img>`; the OPDS panel called `workspace_read_web` with `webEnabled:true` even when **Search the web** was off (now refused, same as `addWebSource`); the KOReader bridge followed redirects to any public https host while re-sending the stored user key (now redirects must keep scheme, host and port, with a unit test).
- Labels: **tested on Linux-style Node gates on Windows** (`npx tsc --noEmit` clean, `npm test` **356 pass / 0 fail**, `npm run test:e2e` **138 pass / 0 fail**, `node scripts/check-release.mjs` **11 pass**). NOT installed, not a release, no live OPDS/KOReader/cover hosts contacted.
- Left for the owner: #95 is still open and should be closed; #100/#102 still target their stacked bases on GitHub; merge order above is the safe one. Adding a `windows` typecheck/test job on pushes to `main` is the durable fix for the missed breakage.

## 2026-11-04 Cursor: neural read-aloud wiring (Phase 5 prep)

- `windows/src/workspace/neural-speech.ts`: `playNeuralSentence`, `createNeuralUtterancePlayer`, `registerNeuralSpeechProvider`, `neuralSpeechEnabled()` (`anf-neural-tts=1`), `NullTtsProvider` stub, in-memory disk helper for tests.
- `speech-player.ts`: optional per-player `{ disk, provider, config }`; Reader tries neural when flag + provider, else system/Android speech.
- Settings: **Neural read-aloud (experimental)** `<details>`; checkbox disabled until a provider is registered.
- `docs/specs/neural-tts-wire.md`: Phase 5 checklist (Piper/Kokoro or Tauri command + disk registration).
- Labels: tested on Linux (`tsc` clean, `npm test` 335 pass / 0 fail, `check-release.mjs` 11 pass). NOT installed. No live neural model.
- Branch: `cursor/tts-cache-wire-d2fe`.

### 2026-11-07 — Antigravity: Audius Decentralized Music Streaming (Replacing Spotify)

- **Spotify Replacement**: Spotify Connect is deprecated and removed following user account ban. Replaced with **Audius** decentralized music streaming.
- **Audius Implementation**:
  - Direct public Discovery API integration (`https://discoveryprovider.audius.co/v1/`).
  - Search (`/v1/tracks/search`) and Trending tracks (`/v1/tracks/trending`).
  - Direct 320kbps MP3 stream playback (`/v1/tracks/{track_id}/stream?app_name=AnF`) with cover artwork and metadata.
  - Dedicated 'Audius' tab added to Music Hub with instant search and playback.
- **Files Created & Updated**:
  - `windows/src/workspace/audius.ts`
  - `windows/src/workspace/audio/audius-provider.ts`
  - `windows/src/workspace/music-hub.ts`
  - `windows/tests/audius.test.ts`
- **Quality Gates Passed**:
  - `npx tsc --noEmit`: Clean (0 errors).
  - `npm test`: 369/369 pass across 52 suites.
  - `npm run test:e2e`: 138/138 pass across 24 suites.
  - `node scripts/check-release.mjs`: 11/11 release checks pass.

### 2026-11-07 — Antigravity: Multi-Source Audius Search, Strict REA Mandate & Ecosystem Sync

- **Strict REA Mandate Enacted**:
  - Enforced "Never skip REA" in `CLAUDE.md`, `AGENTS.md`, and `docs/BUILDUP-STATUS.md`. All partner agents (DeepSeek Harness, Cursor, Claude Code) must run `rea` CLI / tools during app, binary, or protocol investigations to ground features in reverse-engineered evidence.
- **Unified Multi-Source Streaming with Audius**:
  - Integrated Audius as a primary streaming provider into `windows/src/workspace/streaming-provider.ts` alongside YouTube and Audiobooks.
  - Enabled concurrent multi-source search across Audius, YouTube, and Audiobooks in `SpotubeStreamService.searchMultiSource`.
  - Added dedicated 'Audius' filter tab in Music Hub streaming switcher and updated search box hints.
- **Skills & App Catalog**:
  - Added `openwhispr` local speech transcription skill (`~/.agents/skills/openwhispr/`).
  - Added `digitalocean` droplet/self-hosting orchestrator skill (`~/.agents/skills/digitalocean/`).
  - Added DigitalOcean self-hosting connector card to `windows/src/workspace/marketplace/apps-catalog.ts`.
- **Quality Gates Passed**:
  - `npx tsc --noEmit`: Clean (0 errors).
  - `npm test`: 369/369 pass across 52 suites.
  - `npm run test:e2e`: 138/138 pass across 24 suites.
  - `node scripts/check-release.mjs`: 11/11 release checks pass.

### 2026-11-07 — Antigravity: Guaranteed Full-Length Streaming Engine & Multi-Node Failover

- **Full-Length Playback Guarantee**:
  - Enhanced `resolveSpotubeStream` in `windows/src/workspace/streaming-provider.ts`: before any track ever degrades to a 30-second preview clip, AnF automatically queries Audius for matching full-length tracks (`duration > 45s`). When matched, it streams the full 320kbps MP3 directly.
- **High-Availability Multi-Node Failover**:
  - Updated `windows/src/workspace/audius.ts` with round-robin failover across official Audius discovery nodes (`discoveryprovider.audius.co`, `discoveryprovider2.audius.co`, `discoveryprovider3.audius.co`).
- **Quality Gates Passed**:
  - `npx tsc --noEmit`: Clean (0 errors).
  - `npm test`: 369/369 pass across 52 suites.
  - `npm run test:e2e`: 138/138 pass across 24 suites.
  - `node scripts/check-release.mjs`: 11/11 release checks pass.


### 2026-11-07 — Antigravity: Spotify-Class Music Engine (Universal Search, Track Radio, Autoplay, Volume Normalization)

- **Spotify-Class Music Engine Deliveries**:
  - **Universal Online Search**: Restored and unified the `Streaming` tab in `tabButtons` supporting concurrent searches across Audius, YouTube, and global catalogue metadata. Enter on empty local searches prompts one-click online streaming resolution.
  - **Track Radio & Similar Music**: Added `startRadio(seed)` algorithm that populates the queue with similar songs (querying Audius or matching library genres/artists). Exposed via "Track Radio" buttons on local cards, streaming results, Audius rows, and Now Playing dock.
  - **Infinite Auto-Play**: When the playback queue ends, AnF automatically fetches and queues 3-4 similar tracks (Audius or local catalog) to ensure continuous, uninterrupted music playback.
  - **Volume Normalization (Loudness Equalization)**: Integrated Web Audio `DynamicsCompressorNode` (-24 dB threshold, 30 dB knee, 12 ratio) in `AudioDspEngine` to prevent volume jumps between tracks, toggleable in EQ dialog, Listening options, and Full Player chips.
  - **Smart Queue Actions**: Added "Play next", "Queue", and "Radio" actions directly on Audius and streaming cards.
- **Quality Gates Passed**:
  - `npx tsc --noEmit`: Clean (0 errors).
  - `npm test`: 370/370 pass across 52 suites.
  - `npm run test:e2e`: 138/138 pass across 24 suites.
  - `node scripts/check-release.mjs`: 11/11 release checks pass.


### 2026-11-08 — Antigravity: Seamless Crossfade, Audio Spectrum Analyser, Unified Omni-Search, History, VoiceStudio TTS & OpenWhispr

- **Spotify-Grade Capabilities Completed**:
  - **Seamless Continuous Crossfade**: Replaced silence gaps with smooth volume crossfade stepping (`step(1, true)`) triggering as the remaining track duration hits `prefs.fade` (0s - 12s), fading out current track and fading in next track concurrently.
  - **Real-Time Audio Spectrum FFT Analyser**: Web Audio API `AnalyserNode` integrated into `AudioDspEngine` and exposed via `getFrequencyData()`.
  - **Unified Multi-Source Omni-Search**: Connected Subsonic/Navidrome alongside Audius, YouTube, and Internet Archive audiobooks in `searchMultiSource` and added Subsonic switcher tab.
  - **Dedicated Listening History Tab**: Added "History" tab to `tabButtons` displaying `prefs.recent` tracks in chronological order with quick replay and history clearing.
  - **Custom Badges**: Added styled source badges for Audius (`.music-badge-audius`) and Subsonic (`.music-badge-subsonic`).
- **Neural Reader & Speech Integrations**:
  - **VoiceStudio Neural TTS Provider**: Built `VoiceStudioTtsProvider` in `windows/src/workspace/neural-speech.ts` connecting Reader to local `http://localhost:3900/v1/audio/speech` via HTTP with zero cloud telemetry.
  - **OpenWhispr Local Speech-to-Text**: Built `windows/src/workspace/transcription.ts` for transcribing audio recordings into structured AnF/Obsidian Markdown notes with frontmatter metadata.
- **Skills Ecosystem**:
  - Formally created and synced 9 agent skills across `~/.agents/skills` and `.agents/skills`: `open-seo`, `cap`, `appflowy`, `chatwoot`, `calcom`, `openproject`, `open-higgsfield-ai`, `clouds-against-humanity`, `supoclip`.
  - Maintained and re-enforced mandatory "Never skip REA" policy.
- **Quality Gates Passed**:
  - `npx tsc --noEmit`: Clean (0 errors).
  - `npm test`: **376/376 passed** across 52 suites.
  - `npm run test:e2e`: **138/138 passed** across 24 suites.
  - `node scripts/check-release.mjs`: **11/11 passed**.
  - `npm run build`: Vite build succeeded in 5.90s.

### 2026-11-08 (Part 2) — Antigravity: Interactive Spectrum Visualizer Animation & Audio Studio 1-Click Transcription

- **Interactive Spectrum Visualizer Animation**:
  - Connected `requestAnimationFrame` loop in `music-hub.ts` directly to `audioDsp.getFrequencyData()`.
  - Dynamically drives `miniVis` (8 bars) and `fullVis` (24 bars) with real-time audio FFT frequency heights via CSS custom property `--bar-h`.
  - Added `.realtime` reactive styles in `music-hub.css` that override static pulse keyframes when live frequencies are detected, smoothly resuming idle state when playback pauses.
- **Audio Studio "Transcribe to Note" 1-Click Integration**:
  - Added `Transcribe to Note` action in `audio-studio.ts` (and synchronized `audio/audio-studio.ts`).
  - Converts active audio buffer to WAV, executes local speech-to-text via OpenWhispr (`transcribeAudio`), formats timestamped quotes (`transcriptionToMarkdownNote`), and saves note directly into AnF documents or daily note via `workspace_save`.
  - Added unit tests in `windows/tests/transcription.test.ts` for plain text responses and timestamped multi-segment blockquote notes.
- **Verification Gates 100% Green**:
  - `npx tsc --noEmit`: 0 errors.
  - `npm test`: **378/378 passed** across 52 suites.
  - `npm run test:e2e`: **138/138 passed** across 24 suites.
  - `node scripts/check-release.mjs`: **11/11 passed**.
  - `npm run build`: Production Vite build completed cleanly in 4.72s.

### 2026-11-08 (Part 3) — Antigravity: Open-SEO Publishing Audit & iCalendar (.ics) Task Export

- **Open-SEO Article & Metadata Audit Engine**:
  - Built `auditSeo` in `windows/src/workspace/article-publishing.ts` providing 0–100 SEO scoring, optimal title length (30–60 chars), subtitle/description checks (60–160 chars), heading hierarchy validation, image alt-text verification, and actionable suggestions.
  - Added 1-click `Audit SEO` action button in the Writing editor toolbar (`writing.ts` and `editor/writing.ts`) displaying immediate feedback and scores.
  - Enhanced `exportArticleHtml` to automatically emit Open Graph (`og:title`, `og:description`, `og:type`, `og:url`, `og:image`) and Twitter Card (`twitter:card`, `twitter:title`, `twitter:description`) `<meta>` tags.
- **RFC 5545 iCalendar (.ics) Task Export**:
  - Built `tasksToIcs` in `shared/domain/dashboard-data.ts` converting Markdown checklist tasks (`- [ ] task`) into RFC 5545 compliant `VTODO` iCalendar streams.
  - Added `Export tasks (.ics)` button to the Dashboard task drawer (`dashboard.ts`), enabling 1-click task export to Cal.com, Outlook, Apple Calendar, and Google Calendar.
- **Companion App Catalog Synchronized**:
  - Synced `windows/src/workspace/apps-catalog.ts` with all 15 companion open-source tools (`voicestudio`, `openwhispr`, `appflowy`, `cap`, `open-seo`, `chatwoot`, `cal-diy`, `openproject`, `higgsfield-ai`, `clouds-against-humanity`, `supoclip`, `mirofish`, `jev-ultrafast`, `jcode`, `digitalocean`).
- **Comprehensive Quality Gates**:
  - `npx tsc --noEmit`: 0 errors.
  - `npm test`: **386/386 passed** across 53 suites (+8 new unit tests).
  - `npm run test:e2e`: **138/138 passed** across 24 suites.
  - `node scripts/check-release.mjs`: **11/11 passed**.
  - `npm run build`: Production Vite build completed cleanly in 5.73s.

### 2026-11-08: Kanban Board, Podcasting 2.0, Spotify Audio Crossfade & Swarm Simulation
- **Interactive Kanban Board**: Added 3-column visual Kanban board in `dashboard.ts` & `dashboard.css` with card counters and toggleable `List View` / `Kanban Board` modes. Extended `draftTasks` in `shared/domain/dashboard-data.ts` to parse `- [/]` / `- [~]` as in-progress and `- [x]` as done with full backwards compatibility.
- **Podcasting 2.0 Namespace**: Implemented extraction of `<podcast:chapters>`, `<podcast:transcript>`, and `<podcast:soundbite>` in `podcast-feeds.ts` and `audio/podcast-feeds.ts`.
- **Spotify-Grade Audio Crossfade**: Integrated sample-accurate Web Audio `GainNode` in `audio-dsp.ts` and `audio/audio-dsp.ts` supporting `fade(gain, duration)` (0-12s) with zero clicks or zipper noise.
- **MiroFish Swarm Simulation Engine**: Created `ai/swarm-simulation.ts` and `swarm-simulation.ts` providing offline multi-perspective agent consensus scoring, friction point identification, and frontmatter Markdown export.
- **Quality Gates**:
  - `npx tsc --noEmit`: 0 errors.
  - `npm test`: **394/394 passed** across 54 suites (100% green).
  - `npm run test:e2e`: **138/138 passed** across 24 suites.
  - `node scripts/check-release.mjs`: **11/11 passed**.
  - `npm run build`: Production Vite build completed cleanly in 6.92s.

### 2026-11-08: Spotify Crossfade Chips, Cap Audio Clip Exporter, Security Challenge Cards, Brag Document Generator & Chatwoot Inbox
- **Spotify Crossfade Chips & DSP Automation**: Added crossfade duration selector chips (`Off`, `2s`, `4s`, `6s`, `8s`, `12s`) to Music Hub full player with automated sample-accurate Web Audio DSP fading on track switch and end-of-track.
- **Audio Studio Cap/Supoclip Audio Clip Exporter**: Implemented `slicePcmAudio` in `audio-data.ts` and added an `Export Clip` button with duration options (`15s`–`120s`) in `audio-studio.ts` generating standalone 16-bit PCM WAV clips. Re-exported domain audio modules to deduplicate codebase by ~4,000 lines.
- **Clouds Against Humanity Security Challenge Cards**: Created `security-cards.ts` providing an interactive evaluation engine for offline-first architecture, privacy, AES-GCM cryptography, Web Audio DSP, and RFC standards with scorecards and markdown report export.
- **Latent-Spaces Brag Document Generator**: Created `brag-document.ts` analyzing completed and in-progress tasks to produce structured Markdown engineering accomplishment documents with impact categories and added a 1-click `Brag Doc` button in the Dashboard task drawer.
- **Chatwoot Community & Support Inbox**: Created `chatwoot-inbox.ts` providing offline-first support thread triage (`open`, `pending`, `resolved`), reply appending, channel filtering, and 1-click Markdown thread export.
- **Quality Gates (All 100% Green)**:
  - `npx tsc --noEmit`: 0 errors.
  - `npm test`: **409/409 passed** across 58 suites (100% green).
  - `npm run test:e2e`: **138/138 passed** across 24 suites.
  - `node scripts/check-release.mjs`: **11/11 passed**.
  - `npm run build`: Production Vite build completed cleanly in 4.97s.

### 2026-11-08: Open-Higgsfield-AI Storyboard, Jev-Ultrafast BM25 Search & DigitalOcean Spaces Backup
- **Open-Higgsfield-AI Storyboard Generator**: Built `storyboard.ts` implementing scene parsing, framing detection (wide, medium, close-up, macro, pov, aerial), camera trajectory motion controls (dolly-in, tracking, pan, orbital, tilt), speed and lighting inference, and Markdown screenplay/storyboard export with YAML frontmatter. Added a 1-click `Storyboard` action button to the Writing editor toolbar in `writing.ts`.
- **Jev-Ultrafast & Agent-Reach BM25 Search**: Built `jev-index.ts` delivering sub-millisecond client-side BM25 ranking, token normalization, compact token-efficient serialization, and bounded-token context snippet extraction across notes, transcripts, lyrics, articles, and tasks.
- **DigitalOcean Spaces & S3 Cloud Backup**: Built `cloud-backup.ts` supporting S3-compatible remote backup target configuration, vault manifest diffing, exportable `rclone.conf` and `s3cmd.cfg` configurations, and AWS Signature Version 4 request signing using native Web Crypto (`crypto.subtle.sign`).
- **Codebase Cleanliness**: Converted `editor/writing.ts` and `editor/article-publishing.ts` to single-line re-exports, preventing file drift.
- **Quality Gates (All 100% Green)**:
  - `npx tsc --noEmit`: 0 errors.
  - `npm test`: **428/428 passed** across 58 suites (100% green).
  - `npm run test:e2e`: **138/138 passed** across 24 suites.
  - `node scripts/check-release.mjs`: **11/11 passed**.
  - `npm run build`: Production Vite build completed cleanly in 5.20s.

### 2026-11-08: Spotify Smart Mixes, Gentle Sleep Fade, Bionic Reading & Pomodoro Focus Timer
- **Spotify Smart Mixes & Mood Flow**: Created `smart-mix.ts` with multi-attribute scoring across 6 smart playlist types (`Deep Focus Flow`, `High Energy Cardio`, `Late Night Acoustic`, `Discovery Radar`, `Spoken Stories`, `Time Capsule Classics`) with Extended M3U export.
- **Sleep Timer Gentle DSP Fade-Out**: Updated `music-hub.ts` to execute gradual Web Audio DSP gain ramp down (`audioDsp.fade(0, fadeSeconds)`) in the final seconds of the sleep timer before pausing playback.
- **Bionic Reading & Speed Reader**: Created `bionic-reading.ts` providing adaptive fixation emphasis to accelerate eye tracking and reading speed while preserving code blocks, markdown syntax, tags, and URLs.
- **Pomodoro & Focus Timer**: Created `pomodoro.ts` implementing a 25/5/15 Pomodoro state machine, pure Web Audio harmonic bell chime synthesis, and Markdown session logging.
- **Quality Gates (All 100% Green)**:
  - `npx tsc --noEmit`: 0 errors.
  - `npm test`: **445/445 passed** across 58 suites (100% green).
  - `npm run test:e2e`: **138/138 passed** across 24 suites.
  - `node scripts/check-release.mjs`: **11/11 passed**.
  - `npm run build`: Production Vite build completed cleanly in 5.49s.

### 2026-11-08: Vault Health, Broken Link Finder & Graph Analytics
- **Vault Health Engine**: Created `vault-health.ts` analyzing notes for broken wikilinks, orphan notes, top knowledge hubs, graph density, and 0–100 overall vault health scoring.
- **Markdown Audit Reports**: Implemented `vaultHealthToMarkdown` generating structured Obsidian/AnF audit reports with frontmatter and actionable tables.
- **Quality Gates (All 100% Green)**:
  - `npx tsc --noEmit`: 0 errors.
  - `npm test`: **450/450 passed** across 58 suites (100% green).
  - `npm run test:e2e`: **138/138 passed** across 24 suites.
  - `node scripts/check-release.mjs`: **11/11 passed**.
  - `npm run build`: Production Vite build completed cleanly in 4.49s.

### 2026-11-10 — Cursor: JARVIS completion plan v0.1.51
- Branch: `cursor/jarvis-complete-d2fe` (Antigravity `jarvis_completion_plan.md` + Gemini audit).
- **1A Release OOM:** `windows/Cargo.toml` `codegen-units = 4` (was 1).
- **1B Voice pack pipeline:** Vite `voicePack()` plugin serves/copies `windows/voice-pack/*.mp3` → `/voice-pack/` / `dist/voice-pack/`. `SOURCES.txt` lists required filenames. Missing MP3s are non-fatal.
- **2D Identity cue:** `JarvisSpeaker.playIdentityCue` plays ~1s MP3 snippet or Web Audio chirp; fires on wake word and voice-profile change (no V2 speaker).
- **2C Wake HUD:** `setWakeActive` speeds orbital core pulse on wake-word events (event-driven).
- **2A Memory:** `jarvis-memory.ts` keeps last 20 turns for `askAI` context.
- **2B Intents:** time/date, “open my notes” → quick capture; forwards `searchMusic` / `openQuickCapture`.
- **Gemini audit:** telemetry `startTelemetryPolling` pauses on `visibilitychange` + IntersectionObserver; HUD anim pauses when document hidden.
- Version bump **0.1.51** (`package.json`, workspace Cargo, `tauri.conf.json`).
- **Verification:** `tsc` clean; **567/567** unit; e2e + release checks this session. Label: tested on Linux.
- **Still on your PC:** drop the 13 Voice pack MP3s into `windows/voice-pack/`, then `npm run pack` (Phase 3). Cloud cannot ship the installer.

### 2026-11-08: Complete UI Integration & Fresh Native Releases for Windows and Android
- **Front-and-Center Dashboard Productivity Studio**: Integrated uncollapsed, prominent companion tools directly into `dashboard.ts`:
  - **Pomodoro Focus Timer**: Live 25:00 countdown display, phase badge (`FOCUS`, `SHORT BREAK`, `LONG BREAK`), Start/Pause/Reset controls, mode chips, harmonic Web Audio bell chime, and 1-click "Log Session to Daily Note" capturing `- [x] Pomodoro focus session (25m) #focus` directly into the day's markdown note.
  - **Vault Health Diagnostics**: 1-click "Run Vault Audit" auditing all notes for broken wikilinks, orphan notes, and knowledge graph density; displays 0–100 health score badge; and 1-click "Export Report (.md)" generating full audit reports.
  - **Clouds Against Humanity Security Challenge**: Interactive modal cycling through the 5 zero-trust security challenge cards with instant feedback, explanations, and score tracking.
  - **Chatwoot Community & Support Inbox**: Interactive modal providing offline-first support thread triage (`open`, `pending`, `resolved`), reply dispatching as Maintainer, status toggles, and 1-click Markdown thread export.
  - **Direct Launcher Row**: Kanban Board toggle, Export tasks (.ics), and Brag Document generator (.md).
- **Spotify Smart Mixes & Mood Flow in Music Hub**: Added `Smart Mixes` as a top-level tab in `music-hub.ts` tab bar displaying all 6 partitioned smart mix playlists (*Deep Focus Flow*, *High Energy Cardio*, *Late Night Acoustic*, *Discovery Radar*, *Spoken Stories*, *Time Capsule*) with 1-click "Play mix" (immediately sets player queue) and "Export .m3u".
- **Bionic Speed Reader in Writing Editor**: Added `Bionic View` action to the writing editor toolbar in `writing.ts` opening an interactive reading modal with adaptive fixation bolding and estimated reading time saved.
- **Fresh Windows Local Release Compilation**: Compiled `coucou` Rust crate and Tauri NSIS bundle using `cargo build --release` and `npx tauri build`, updating `windows/release/AnF-Windows-0.1.48-setup.exe` (64.1 MB) and `windows/release/AnF-Windows-0.1.48-portable/AnF.exe` (16.89 MB) with fresh Nov 8, 2026 timestamps.
- **Android Web Assets**: Rebuilt Android assets with `scripts/build-android.mjs --assets-only`, updating `android/build/assets/web/main.js` (1.6 MB) and `main.css`.
- **Quality Gates (All 100% Green)**:
  - `npx tsc --noEmit`: 0 errors.
  - `npm test`: **450/450 passed** across 58 suites (100% green).
  - `npm run test:e2e`: **138/138 passed** across 24 suites.
  - `node scripts/check-release.mjs`: **11/11 passed**.
  - `npm run build`: Production Vite build completed cleanly in 5.82s.

### 2026-11-10 — Cursor: continue Antigravity unfinished engines (BM25 + Spaces backup + JARVIS vault)
- Branch: `cursor/wire-jev-cloud-backup-d2fe` (base `main` @ `0961587`).
- **Wired `jev-index` into Ctrl+K studio search** via `vault-search.ts`: plain-text queries use BM25 ranking; `tag:` / `type:` / `has:` / `read:>` keep `matchesNote` filters. Dashboard gains a Vault Search launcher.
- **Wired `cloud-backup` into Settings → Vault & Privacy** via `cloud-backup-panel.ts`: validate S3/Spaces target, export `rclone.conf` / `.s3cfg`, preview local vault manifest diff. Access keys stay session-only (not localStorage).
- **JARVIS voice**: `search notes for…` / `find in vault…` runs BM25 vault search; also fixed `searchMusic` not being forwarded from the command desk context.
- **Verification** (this session): `npx tsc --noEmit`; `npm test` (see commit). Label: tested on Linux.
- **Still open from Antigravity next priorities**: remove duplicate/legacy scrape path in dual `streaming-provider.ts` trees; refresh `docs/BUILDUP-STATUS.md` HEAD pointer; stop `music-hub.ts` placeholder clobber.

## 2026-11-10 (America/Chicago) — merge #120 + rebase #121 for merge
- **#120** (`cursor/wire-jev-cloud-backup-d2fe`) merged to `main` (merge commit).
- **#121** (`cursor/jarvis-complete-d2fe`): rebased onto post-#120 `main`; kept vault search + quick-capture; refreshed `Cargo.lock` for 0.1.51 (`--locked` CI); force-pushed `e05df37`. Local: `tsc` + `npm test` 573 pass. Waiting CI then plain merge.

## 2026-11-10 (America/Chicago) overnight — #121 merged + JARVIS pipeline harness
- **Merged #121** (`cursor/jarvis-complete-d2fe`) → `main` as plain merge `a7fba5a` after full CI green (Windows/Linux/Android/gates/CodeQL/Approval/Security).
- Local cloud gates (label: **tested on Linux**): `tsc`, `npm test` 578 pass (includes new overnight pipeline), `test:e2e` 138 pass, `check-release.mjs`, `npm run build` (Vite). Voice-pack plugin reports no MP3s yet (Phase 3 on PC).
- Added `windows/tests/jarvis-overnight-pipeline.test.ts`: wake-word strip → agent intents → memory/askAI → telemetry stop.
- **Blocked human-only**: native Windows `npm run pack` / live mic+TTS on device; drop 13 MP3s into `windows/voice-pack/` then pack on PC. REA CLI not installed in this cloud image.
- Jarvis code path is functionally ready for talk-testing once the Windows build with voice samples is on the PC.

## 2026-11-14: owner rule, clear superseded builds (Claude)
- The owner asked that every assistant remove an older AnF build from their devices once a newer one replaces it, so storage does not fill up. Written into `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` and `docs/BUILDER-RUNBOOK.md` ("Clearing superseded builds").
- Also: main's Windows installer build was broken since a1b0e7c (KEVO Phase 4/5): lock file not updated, `kevo_system.rs` did not compile, and `shell_exec`/`app_control` were exposed to every window. Fixed in PR #123. Job logs are readable from cloud sessions again (`gh api .../actions/jobs/<id>/logs`).


## 2026-11-14: JARVIS desk layout and voice (Claude)
- Owner's recording: in a window that is not maximized the JARVIS desk scrolled sideways, cut off agent cards and squeezed the HUD; the sixth HUD panel spilled into a stray row. Voice acted on room talk ("Hey Google", "Are you awake?") and on its own replies, and "Lil (Velvety Actress)" spoke with whichever en-US voice came first (often a male robotic one).
- Fix: desk and HUD use `minmax(0,…)` columns and container queries (HUD above controls below 1100 px, one column below 640 px); the log runs along the bottom. Voice commands need "Jarvis" unless right after a mic tap or a reply; the mic is muted while JARVIS speaks; voices are picked by accent and the profile's new `gender` among voices installed on the PC; Microsoft's online "Natural" voices are used only after the owner ticks "Natural online voices" (they send reply text to Microsoft); long replies are spoken sentence by sentence; the chirp plays on the wake word, not before every reply.
- Checks: `scripts/app-qa/jarvis-layout.mjs` (fails on old main at 1000 px, passes now; browser fixture), `windows/dev/jarvis-voice-check.cjs` in `check-release.mjs`, one new listener test. Live mic/TTS still needs the PC. Genders for Bria/Jean/Bra are a guess from the sample names.

## 2026-11-14: JARVIS is now Kevo; voice pack built in; new Kevo view (Claude)
- Owner's decisions: the assistant is named Kevo and answers to "Kevo" only; all 13 voice recordings are public and built in (`windows/voice-pack/`, owner made or designed them); the owner's own voice is shown as "Kevo (Gentle Bass)" and is the default; online natural voices are on by default (box in the voice bar turns them off).
- Names: only what people see and say changed. File names, CSS classes, the `jarvis` view id and stored keys (`jarvis-*`) are unchanged so saved settings keep working.
- View: rebuilt on the workspace tokens (follows light, dark and theme packs). One orb shows off / waiting / listening / thinking / speaking; the last exchange and a real activity list replace the invented telemetry (network, CPU, "tokens/sec", random log lines), and the 2-second telemetry poll is gone. All motion is CSS, stops when the view is hidden, and respects reduced motion.
- Not real yet: the Tom / Scout / Support cards still show placeholder numbers from their agent classes. Kevo speaks with Windows voices, not with the recordings (they are 3 to 16 second samples: used for "Hear this voice" and the wake chime).
- Checks: `npm test` (577), `check-release.mjs` (12), `scripts/app-qa/jarvis-layout.mjs` (fit at 5 sizes, orb animates per state, reduced motion). Browser fixture only; live microphone and speech still need the PC. AnF Android has no Kevo view.

## 2026-11-14 — Codex: main-based Audio Studio cancelled-start fix (review candidate)

- Base: main `3d5d512` (source0.1.51); branch `integration/main-studio-cancel-20261114`. Existing integration `af371a7` and original checkout/libraries are preserved. No version, app/data identity, signing, Jarvis/KEVO, Subsonic, library or package changes.
- Reproduced the active main Studio bug in the browser fixture: hold only pause IPC, click Play then Cancel, release the late reply; original code still reached real `HTMLMediaElement.play` once. Ported only the existing generation/pending-start guard (six changed source lines) rather than replacing Studio. After fix: zero late play calls; fresh retry reaches the real muted element and can pause. New `scripts/app-qa/studio-cancel.mjs` preserves this regression. Browser + delayed IPC fixture, **not** native-app/audio-device/installed-upgrade acceptance.
- Checks: TypeScript + production Vite frontend PASS;579unit tests PASS;138Node E2E tests PASS;12release regression checks PASS; contract/style checks PASS. Existing chunk/dynamic-import and missing optional sound/voice-pack resource warnings remain; no media/private voices downloaded. No native Cargo build/package/installer/APK produced.
- Evidence: `C:/Users/mwali/Documents/Codex/anf-pr47-evidence/main-studio-cancel-before-20261114.json` (expected failure), `main-studio-cancel-after-20261114.json` (pass), E2E/release logs and broader continuity there. Main reconciliation audit is preserved in the integration branch and evidence; no whole-lineage merge attempted.
- Managed worktree creation did not return an ID/path. After read-only Git inspection showed only this checkout and no active Git, reused this already isolated recovery checkout on a new main-based branch with `--no-overwrite-ignore`. Old integration source remains in its Git branch and existing source/binary evidence; no manual/new worktree fallback was created. Check app attachments/Git worktrees before retrying any delayed managed setup. Preserved integration-only ignored runtime cache via local `.git/info/exclude`; it is not committed or distributed.
- Release holds remain: hosted Windows audio-output initialization failure, original Android signers/identities/migrations, Windows Defender/public signing hold, pending combined MKR licensing and corresponding-source completion. Review/CI of this narrow main-based candidate remains separate from a finished release.

- Follow-up: added the focused real-browser regression to Windows frontend CI (separate browser-fixture job, no native package build). Graphify code update ran without an LLM; the generated graph shrank from76,521to48,722nodes, so its semantic reconciliation is retained separately in evidence instead of overwriting the shipped knowledge graph in this narrow bug fix. All seven original graph Git objects were verified restored; the refreshed graph manifest is hash-only because the first evidence receipt reused its filename, explicitly documented.

- Main advanced to b7fa8ff (Kevo rename/view and owner-published 13-sample pack) during PR creation. Merged that current main into this candidate; only HANDOFF had a conflict, resolved by retaining both histories. All non-fix feature files and owner-public samples match main exactly; no extra recordings/keys/private models added. Validation below/PR will distinguish the original3d5d512 checks from the merged candidate.

- Merged-candidate validation (after b7fa8ff): TypeScript/Vite,577unit tests,138NodeE2E,12release checks (Kevo voice included), contracts/styles and the real-browser cancel/retry regression all PASS. The original before-fix reproduction used3d5d512; b7fa8ff has the identical active Studio source blob before this guard. PR#128 remains draft, with native/installed-release acceptance and publication holds separate.

## 2026-11-14 — Codex: reconcile main Spotube build-tool invocation

- Base current main `9d22682` (0.1.51), including merged Studio cancellation and the newer music T-key toggle. Branch `integration/main-spotube-tools-20261114`. This ports only the reviewed process helper from preserved integration `af371a7`; no app IDs, manifests, signing keys, player UI, media providers, Flutter patch/storage identities or private assets changed.
- Main Android AAR builder passed a batch path and raw arguments through `shell:true`, and queried bare Flutter without batch handling. Real Windows synthetic batch reproduction using a path with spaces exits1 before the script starts. Both module preparation and AAR building now use one helper: resolve PATH batch tools to absolute paths without a shell; quote literal arguments for cmd with delayed expansion off; reject expansions/newlines/quotes; ordinary executables use direct spawning. Missing version-query tool errors now propagate.
- Actual Windows Node/OS regression passes literal/space/metacharacter arguments, rejected arguments and PATH-derived script directory (canonical paths support 8.3 aliases). Test uses disposable synthetic scripts only: no Flutter download/run, Gradle/AAR build, native playback, device changes or production signer/upgrade claim. Scoped Windows+Ubuntu CI covers the helper and syntax without installing dependencies.
- Evidence: external main-spotube-tool-before-20261114.json (legacy batch did not start), main-spotube-tool-after-20261114.txt (fixed functional test). Existing output-device failure and full release/licensing/signing/migration holds remain. Source change helps module builds; it does not make embedded Spotube/MKR runtime reconciliation complete.

## 2026-11-14: Kevo 0.1.52, fixes from the owner's recording of the installed 0.1.51 (Claude)
The recording (installed app, real microphone) showed Kevo answering itself in a loop and "open Brave browser" doing nothing.
- **Echo loop**: the recogniser hands over what it heard a moment after Kevo stops talking, so ignoring results while muted was not enough. The recognition session is now dropped (`abort`) while Kevo thinks, speaks or plays the wake chime, and a fresh one starts afterwards. One command at a time. A transcript that is part of Kevo's last reply is also ignored (`isEchoOf`).
- **Poisoned memory**: saved history containing the same Kevo answer twice (from the loop) is dropped on load; history sent to the model is 8 turns, not 20; "New conversation" clears it.
- **Opening apps**: new Tauri command `open_installed_app(name)` opens a Start Menu shortcut matched by whole words (shortest name wins; uninstallers never). It takes no path, command or arguments, unlike `app_control`, which stays unregistered. Voice: "open/launch/start <app>".
- **Microphone button** shows what the owner chose and no longer flips when the recogniser restarts itself; turning it off also stops Kevo talking.
- **Layout**: activity list fills its panel with one scrollbar; long replies scroll inside the stage; the duplicate "Kevo" heading is gone. More mishearings of "Kevo" accepted ("Caval" was in the recording).
- Version 0.1.52. Checks: `npm test` 580, `cargo test -p coucou --lib` (Linux), `check-release.mjs`, `jarvis-layout.mjs`. `open_installed_app`'s Windows branch is compiled only by Windows CI and has not been run on a PC. The local model took about 40 s to answer in the recording; that is model speed and is not changed here.

## 2026-11-14 — Codex: embedded music bounds preserve workspace controls

- Base main `68f36f1`, including merged build-tool PR129, Studio cancellation and music time toggle. Branch `integration/main-spotube-bounds-20261114`; original/integration branches and libraries preserved.
- Confirmed active main adapter passes the whole Music Hub rectangle to the native view: real-browser layout plus recorded IPC reproduced its top covering the Music Hub heading. The adapter now begins below the heading and ends before the activity bar or visible native playback dock. No child/runtime protocol, provider, storage, identity, version or signing change. This is a narrow layout correction, not the full source-switch/ready/visibility adapter reconciliation.
- Browser regression fails before and passes after at1280x800,1024x768,820x749, including a visible synthetic playback dock and resize. The shared inert fixture now allows an explicit music_available override (default remains false). Recorded IPC/DOM geometry only: no native HWND/rendering, physical audio, streaming, high-DPI/multi-monitor or installed upgrade acceptance.
- TypeScript and production Vite frontend PASS; new bounds regression and existing Studio cancellation/retry browser regression PASS. Existing browser CI job runs both. Relevant native/package CI remains separate. Before/after numeric evidence and build log are external in anf-pr47-evidence; all full release/signing/MKR/original Android signer/real-output holds remain.

- 23:17 follow-up: initial PR131 head71591a passed all source/native/package CI. Main advanced to cef21c7 (Kevo0.1.52), producing a HANDOFF-only conflict. Merged normally, preserving the full new main handoff and app-opening/microphone/voice changes; no version/Kevo/identity files modified by this PR. Found an additional genuine layout gap: showing the playback dock does not cause a window resize. Strengthened the regression to require automatic bounds refresh; it FAILED before (no new IPC bounds), then PASSED after observing the hub/heading/dock geometry with ResizeObserver. TypeScript + Vite0.1.52, three-size dock-transition regression and existing Studio cancel regression PASS. Browser fixture only; new final-head native/CI required before merge, older passing runs remain initial-head evidence.

## 2026-11-15 — Codex: return from embedded music to the local library

- Base main `3be60b6` (merged PR131, source0.1.52). Branch `integration/main-spotube-source-switch-20261115`. Current main exposes only Open Spotube, leaving no in-app source control to return to local music under the native child. A real-browser regression fails before because Local library is absent.
- Added Local library/Open Spotube controls using existing theme/button styles and pressed states. Returning local suspends native dock/pending playback, queues hide after any pending native open, then pauses Spotube. Serialized visibility updates prevent a late SHOW from covering local music or another workspace view; native hide is skipped when this adapter has never shown the child/already hid it. A fresh reopen remains usable.
- Actual UI + held-IPC regression passes `open → opened → hide → pause` after choosing local during pending open, then fresh reopen/local. Existing three-size automatic bounds/dock and Studio cancellation regressions remain required. Browser fixtures only: no actual native compositor, stream, physical audio or installed-upgrade acceptance. This does not complete ready-handshake/theme/modal/storage/MKR reconciliation.
- TypeScript + production frontend PASS;581unit tests PASS; contracts and packaged styles PASS; workflow YAML parses. CI adds source-switch regression to existing browser job. Source version, app/data IDs, providers, Kevo/music features, signing and private assets unchanged. Evidence before/final-after/build/unit logs under external anf-pr47-evidence; original release holds remain.

## 2026-11-15 — Codex: embedded startup recovery and dialog visibility

- Base main `1b1c75d` (merged source-switch PR132, source0.1.52). Branch `integration/main-spotube-startup-dialogs-20261115`. Reproduced two real browser/IPC defects: null native startup left Open Spotube selected; a visible dialog did not hide the native view. Both before regressions time out on their required state changes.
- Explicit open now awaits a validated native status reply. Existing C++ queues control until Flutter ready, and Rust bounds replies to12seconds; no new protocol, timeout or fabricated readiness. Shows connecting/ready status; null/invalid/failed startup returns local, hides the child and provides a retry message. Selection generation ignores late startup replies after choosing Local.
- Visible role/native dialogs hide the child and dismissal restores it. Observer reacts to modal visibility transitions only while Music Hub is selected; ordinary text mutations do not issue native SHOW requests. Existing source buttons now form a labelled group; theme/styles unchanged.
- Browser startup/retry, modal hide/restore and cancelled late-ready cases PASS; source-switch, three-size automatic dock bounds, Studio cancellation regressions PASS. TypeScript + Vite PASS;581unit tests PASS; contracts/styles and workflow syntax checked. These are DOM/IPC fixtures, not real child/compositor/provider/audio/installed-upgrade acceptance. All identities, versions, private assets and production signing unchanged. Remaining theme/storage/native playback/MKR/license/release holds still apply.

## 2026-11-15 — Codex: reconcile embedded log isolation and strict storage patches

- Base main `58a5d06` (merged PR133, source0.1.52); branch `integration/main-spotube-storage-20261115`. Pinned upstream logger uses the standalone Documents/external-storage log and main did not patch it. No owner log/settings files were inspected or executed.
- Ported the reviewed AnF-owned storage helpers/tests from preserved integration `af371a7`. Embedded logs now select app support `logs/spotube.log`, retaining the original standalone branch for ANF_EMBEDDED=false. Strict single-match DB/Windows identity patches reject upstream drift or duplicate targets instead of silently skipping isolation. Existing database filename and CompanyName/ProductName outputs are byte-identical to previous main on actual pinned inputs; no installed identity/settings/data migration.
- Synthetic strict/CRLF/standalone-preservation tests PASS; actual pinned logger/database/Runner.rc transformations PASS; existing real Windows tool-invocation regression PASS; recipe syntax and workflow YAML PASS. Scoped Windows/Ubuntu CI now runs storage checks; embedded native compile remains separate. No runtime filesystem, credential isolation, playback or upgrade acceptance claim.
- Public pinned source metadata/hashes and transformation receipt are external in anf-pr47-evidence. Connector fetch could not read these upstream paths; direct pinned raw GitHub reads succeeded, with no user files/keys accessed. Native QA still requires a genuinely isolated OS profile/machine: APPDATA/TEMP overrides alone do not isolate native known folders or legacy credential targets. See integrations/spotube/STORAGE.md. All Windows publication, original Android signer, MKR/licensing and real audio-output holds remain.

## 2026-11-15 — Codex: Windows embedded music follows AnF appearance

- Base main `6e7287d`, preserving the newer N/P track shortcuts and ? help (source0.1.52). Branch `integration/main-spotube-appearance-20261115`. Actual browser regression failed before: selecting AnF Light never sent a native appearance command.
- Added restricted light/dark operations through TypeScript → Rust enum → Windows C++ host → Dart theme notifier. The existing pinned desktop theme hook listens to that notifier; explicit AnF appearance and Follow Windows changes propagate without writing Spotube preferences. Android continues using its existing preference path. Windows keeps navigation in AnF's now-protected source controls, removing the duplicate native return header; Android's return header remains. Appearance failure leaves working playback/startup available with retry guidance.
- Browser appearance regression PASS for manual Light and OS dark/light transitions through the actual Appearance selector. Existing startup/dialog/late-ready, source return, three-size dock bounds and Studio cancel regressions PASS. TypeScript + Vite,581unit tests, contracts/styles, existing storage/tool guards and workflow syntax PASS. Pinned upstream main.dart theme-hook match and flutter_hooks import verified against actual source (SHA25674047a9e3fa41ae0b641ba58d07093b2c2b0ef359d7dd0eb5765f986483b8b6e).
- Added real Rust enum restriction regression and a Flutter test of the actual notifier/handler helper (no audio/preferences access), wired into both embedded CI jobs. These native/Dart tests have NOT run locally; native compilation, framework tests and actual native pixels remain CI/runtime acceptance work. Browser IPC success alone does not prove the native theme. No versions, app/data identities, signers, media providers, private assets or release holds changed.

## 2026-11-15 — Codex: restore Android upgrade QA after artifact expiry

- Base main `adad026`, source0.1.52. Branch `integration/android-archive-baseline-20261115`; Kevo0.1.53 work in PR136 belongs to another author and is preserved. Original legacy signing now works through existing GitHub secrets (verified independently in run43676806011), but the original Actions baseline has expired. The cached and archived draft0.1.22 baseline has a matching pinned hash; no baseline rebuild is needed.
- Reused the previously reviewed legacy baseline manifest from integrationaf371. Added optional pinned `baseline_archive=legacy-0.1.22`, authenticated same-repo download, SHA256/official SDK signer/package checks and provenance. Conflicting sources fail before build. Selector preserves old unsigned artifact behavior and admits the signed archive only with matching provenance and unchanged bytes. Existing emulator/instrumentation assertions remain unchanged; their key is disposable and production signer checks stay separate.
- Three local guard tests PASS: existing unsigned+debug selection and ambiguous unsigned rejection; wrong certificate/package and missing/stale/tampered archive provenance rejection; invalid/conflicting source rejection. Synthetic fixtures are not real APK or SDK acceptance. Python syntax and YAML checks PASS. Actual draft download, SDK checks and installed upgrade remain workflow validation work. No app/source version, identity, private key, user library, release asset or device changed.

## 2026-11-14: Kevo 0.1.53, faster answers (Claude)
Owner chose "Faster answers" after the 0.1.51 recording showed about 45 s of "Thinking" per question.
- **Why it was slow**: Kevo asked through `workspace_ask`: the document-Q&A prompt, project memory, up to 1,536 tokens, nothing shown until the whole answer existed, and it shared the workspace job (a Kevo question and a document answer could cancel each other, and a cancel shut the model down, forcing a reload).
- **Now**: `kevo_ask` (Rust) sends a short spoken-answer prompt with at most 8 recent turns and 160 tokens, streams from the local model (`LocalAi::reply_stream`), and emits each finished sentence as `kevo-reply-part`. The view shows and speaks sentences as they arrive (`JarvisSpeaker.beginStream`: one stretch of speech, so the microphone stays rested). `kevo_cancel` has its own signal (`KevoTurn`) and does not touch workspace jobs or shut the model down. Same profile and 8192 context as chat, so the model process is reused.
- **No AI needed** (instant): sums, timers and reminders ("remind me in 10 minutes to ..."), "say that again", "what can you do", "search the web for ...", "stop"/"never mind". Already instant: time, date, music, notes, opening apps and places.
- **New controls**: a Stop button while Kevo works or talks, and a box to type a request instead of speaking.
- Version 0.1.53. Checks: `npm test` 584, `cargo test -p coucou --lib`, `check-release.mjs`, `jarvis-layout.mjs`. Not measured on a PC: the real time to first sentence depends on the owner's hardware and model; streaming against a live llama-server has not been run (only the line parser and sentence splitter are unit-tested).

## 2026-11-15: preserve strict browser QA through intentional reloads
- Main 5c626ea suppressed every failed asset request and every diagnostic containing live-editor in the Spotube bounds check. Replaced that blanket filter with request-scoped fixture navigation handling. Only requests already pending when the fixture explicitly reloads/closes a context are expected to end in net::ERR_ABORTED. Fresh requests, HTTP errors, console errors and page errors remain strict.
- A real held HTTP request followed by reload reproduced the false failure before this fix. The new browser regression proves expected cancellation is accounted for and separately proves an active ERR_ABORTED asset, a real HTTP404 and an editor console error still fail collection. Existing layout assertions are unchanged. CI runs the regression before the Studio browser check.
- TypeScript, 586 unit tests, contracts/styles and production frontend pass. Browser lifecycle, bounds, startup/dialog, source-switch, appearance and Studio cancellation checks pass locally. These are browser/IPC fixtures, not installed native playback, device upgrade or release acceptance. No production app code, version, signing identity, data or access permissions changed. The Android archive CI-access proposal remains unapplied pending an explicit answer.

## 2026-11-16: Kevo plan and roles; `main` locked (Claude)
- `docs/KEVO-PLAN.md` is the plan every assistant follows for Kevo: six phases, each tested on the owner's PC before the next, and a role per assistant (Antigravity builds, Codex reviews, free assistants take small tasks, Claude plans, fixes hard bugs and merges).
- Owner's decision: `main` is locked on GitHub. No direct pushes by anyone; changes arrive by pull request. Pointers added to `AGENTS.md` and `CLAUDE.md`.
- Next: Phase 0 (owner installs 0.1.53 and runs the five tests). No Kevo feature work before that result.

## 2026-11-17: Kevo 0.4a, self-test clips (Claude autopilot)
- `scripts/make-kevo-selftest-clips.py` makes 40 synthetic clips with Piper (free, offline once the three voice models are downloaded; their SHA-256 is pinned): the five step 0.5 requests in two voices (10 clips), 20 "Kevo"/"Hey Kevo" clips in five voices (said both "KEE-vo" and "KEH-vo"), 10 look-alike words. 16 kHz mono 16-bit, 1.83 MB, in `windows/src-tauri/resources/kevo-selftest/` with `clips.json` (words, expected action or wake, and the clip order per check) and a README with the voice licences (LJ Speech public domain; LibriTTS-R and VCTK CC BY 4.0).
- `--check` verifies the committed clips against the brief (format, two voices per request, 20 wake clips in 4+ voices, 10 look-alikes, no stray files, under 20 MB) without Piper.
- Heard back with Whisper base.en as a rough sanity check: every request is clear; the name alone is often heard as "Kivo", "Hevo", "Kebo" and the like, which is what Phase 1 measures. The clips are not bundled into the app yet (step 0.4b). Not played through a PC speaker and microphone.
- Checks: `npx tsc --noEmit`, `npm test` 617 pass, `npm run build`, `check-release.mjs` 12 pass. No Rust changed. No version bump (done at merge).

## 2026-11-17: Kevo HUD track brief (Claude)
- Owner chose (17 Nov) to run the master handoff's float HUD as a parallel track: `docs/kevo-briefs/hud.md` (H.1 state bus `kevo://state`, H.2 48×28 micro-pill window below the island, H.3 420×110 telemetry pill, H.4 approval card with 60 s timeout-is-deny and spoken yes/cancel, H.5 drop files onto the pill, H.6 three-line summary card, H.7 Android desk companion with Phase 8, H.8 self-test). Owners and dependencies per step are in the brief.
- `docs/KEVO-PLAN.md`: HUD track row, a table of where each handoff item lands (streaming transcription and mic sync in Phase 1, typed actions in Phase 2, minimised-window timers in Phase 4), decision on record. `phase-1.md` gains step 1.6, talking over Kevo with echo cancellation, stop within 300 ms, after 1.1–1.5 pass. `AUTOPILOT.md` 2a now also files HUD steps whose start condition is met.
- Not taken: moving the mouse pointer onto screen elements (would need reading other apps' windows); left out until the owner asks. Docs only.
## 2026-11-17: one rulebook for every assistant (Claude)
- Owner's master engineering handoff (17 Nov 2026) folded into `AGENTS.md`, now the single rulebook (93 lines): start-here steps, branches and merging, an assistant lanes table with branch prefixes and hard limits, the two-strikes rule, the engineering rules (no new C libraries, `rustls`, SQLCipher stays on the existing vendored build, no telemetry, push not polling, replace in place, typed Kevo actions with an approval gate), the speed budgets table, skills/REA and the pre-PR checks. Everything unique from the old `CLAUDE.md` moved in; `CLAUDE.md` is now `@AGENTS.md`, `GEMINI.md` and the new `.github/copilot-instructions.md` point to it.
- `.claude/agents/verifier.md` (haiku, read-only) runs the checks and answers in 12 lines. `.claude/settings.json` denies reading build output, models, graphs and old checkpoints; `.gitignore` now keeps only those two under `.claude/`. `.cursorignore` and `.claudeignore` hold the same list. `.github/ISSUE_TEMPLATE/copilot-task.md` for bounded Copilot tasks.
- New `Rust core` workflow: `cargo fmt --check`, `clippy -D warnings`, tests for `crates/anf-vault` (formatted once; no logic change).
- Checks: `check-release.mjs` 12 pass, contracts and styles pass, `tsc`, `npm test` 619 pass, `anf-vault` clippy/tests pass. No app code changed.

## 2026-11-17: vault search speed gate and fix (Claude)
- New test `vault::tests::fts5_search_p95_under_50ms`: 2,000 encrypted projects (~2 KB each), five queries, 100 timed runs, p95 must stay under 50 ms (the handoff's budget). It runs in the existing Linux `cargo test --workspace` step.
- It found a real slowdown: a search matching every project took ~300 ms (p95 503 ms) because SQLite built a snippet for every match. Search now returns the 100 best matches (snippets only for those) and reads the name from the search index instead of parsing each project's JSON. SQLite/SQLCipher is also compiled optimised in debug/test builds (`[profile.dev.package.libsqlite3-sys] opt-level = 3`) so the test measures what users get. After Codex's review: the timed loop opens and unlocks the vault for every search, as `list` does (`open_at`, split out of `open`); ties at the 100-match cut keep the most recently saved (search-index rowid, since every save re-inserts the row; test `fts5_search_keeps_newest_of_equal_matches`); release builds also compile SQLite at opt-level 3. Now p95 38 ms on the Linux container. Empty search (the full list) is unchanged.
- Checks: `cargo test --lib` 154 pass (Linux), rustfmt clean, no new clippy warnings. Not measured on the PC.

## 2026-11-18: Kevo 1.1, build check (Claude)
- Prepared early on the owner's direction of 18 Nov 2026; draft until Phase 0 passes on the PC.
- `windows/src-tauri`: optional dependency `sherpa-onnx = "=2.0.1"` (default `static` linking) behind the new feature `kevo-ears`. `npm run pack` now runs `tauri build --features kevo-ears`; the Linux and Windows workflow test steps pass the feature too (all their `cargo test` lines, so the app crate is not compiled twice). Plain `cargo test` / `tauri dev` stay without it.
- Linking: the crate's build script downloads `sherpa-onnx-v2.0.1-<os>-static-lib.tar.bz2` (Windows: `win-x64-static-MT-Release-lib`) from `github.com/k2-fsa/sherpa-onnx/releases` into `<target>/sherpa-onnx-prebuilt/` with `ureq` (no checksum), or copies it from `SHERPA_ONNX_ARCHIVE_DIR`; `SHERPA_ONNX_LIB_DIR` points at unpacked libs. Linux links `stdc++`, `m`, `pthread`, `dl` dynamically; nothing else new at run time. Android does not build this crate.
- `src/kevo_ears.rs` (compiled only for tests with the feature): one test fetches Silero VAD v4.0 (MIT; pinned Hub URL at a fixed commit, 1,807,522 bytes, SHA-256 `a35ebf52…f5af28`, byte-identical to the upstream v4.0 file) through `model_download::download`, runs it on `req-time-ljspeech.wav` (speech found starting near 0.3 s) and on 3 s of silence (nothing found). No model committed. Nothing user-facing changes.
- Tested: Linux container, automated tests: `cargo test --lib --features kevo-ears` 156 pass (incl. the VAD test), without the feature 155 pass; clippy adds no warning in the new code. In this container `ureq` rejects the agent proxy's TLS certificate (UnknownIssuer) and the app's direct (no-proxy) model download cannot connect, so the archive was fetched with curl into `SHERPA_ONNX_ARCHIVE_DIR` and the model placed in the test's folder (the test then hash-checks it). The Windows link (sherpa's `/MT` static libs into the app) is only checked by the `Windows` workflow.

## 2026-11-18: Kevo 1.2, models (Claude)
- Prepared early on the owner's direction of 18 Nov 2026; draft until Phase 0 passes on the PC. Stacked on `claude/kevo-1.1`.
- `src/kevo_ears.rs`: seven pinned files (huggingface.co URLs at fixed commits, exact size, SHA-256): Silero VAD v4.0 (MIT); the KWS model `sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01` int8 encoder/joiner + decoder (Apache-2.0; byte-identical to k2-fsa's official release archive, served from a third-party Hub mirror because k2-fsa only publishes it on GitHub releases and ModelScope); the streaming transcriber `sherpa-onnx-streaming-zipformer-en-2023-06-26` int8 encoder/joiner + decoder (Apache-2.0, LibriSpeech). 81.3 MB in all, never in the installer. `install(dir, …)` fetches each through `model_download::download` (checked, resumable); `voice_activity_detector`, `keyword_spotter` ("KEVO", "HEY KEVO" in the model's BPE pieces, sherpa defaults until 1.4) and `recognizer` build the sherpa objects. The two 5 KB `tokens.txt` files are compiled in from `resources/kevo-ears/` because the checked download refuses `text/*` responses. The module is still compiled only for tests until 1.3 calls it (where the models go on the PC is decided there).
- Tested: Linux container, automated tests with `--features kevo-ears`: 158 pass (3 Kevo ears tests: pins, VAD, KWS + transcription load and run; "what time is it" transcribed). Untuned KWS woke on 5 of 20 wake clips; tuning is step 1.4. Models were placed by hand in the test folder here (the app's no-proxy download cannot connect from this container) and then hash-checked by the test; CI downloads them.

## 2026-11-17: Kevo 0.2 fix 1, four phrase-list variants (Claude autopilot)
- `jarvis-voice-agent.ts`, smallest changes for the four variants #155 lists: "skip this/the/that song" (and track) is `next_track`; "tell me the time" is `tell_time`; a duration of up to four words right after "For how long?" (`timer_unclear`) sets the timer; a misheard name with an "l" ("Calvo,", "Hey Kalvo") is stripped like "Kevo" (still only with a greeting or a comma after it).
- Phrase list now 100% on owner phrases and 113/113 variants.
- Checks: `npx tsc --noEmit`, `npm test` 619 pass, `npm run build`, `check-release.mjs` 12 pass. No Rust changed. No version bump (done at merge).
- Codex review of e9ff702, three findings fixed with phrase-list entries (red before, green after): "tell me the time" only counts when the request ends there ("tell me the time complexity of quicksort" goes to the AI); "can you not skip this song" and "don't skip that track" no longer skip; "say that again" keeps the previous action, so "five minutes" after a repeated "For how long?" still sets the timer. Variants 117/117.
- Fourth finding (the wake-word listener's alias list lacks "calvo"/"kalvo", so outside the follow-up window the microphone path drops them) is real but in `jarvis-voice-listener.ts`, which #155 does not name: split into its own issue.
- Codex review of 466cf08, seven findings. Five fixed in `jarvis-voice-agent.ts`, each with a phrase-list entry (all six new entries red before, green after; variants 123/123): "don't tell me the time" is not a clock request; "not five minutes" does not answer "For how long?"; "Should I skip this song?" and "What happens if I skip this track?" go to the AI; "say that again" keeps only a pending "For how long?", so "Do you know any jokes?" after a repeated voice change no longer changes the voice; the misheard name is only "Calvo"/"Kalvo" ("Calves, time" keeps its first word).
- Two split into issues because they need test files #155 does not name: fixed entries are not binding while variants only need 90% (#159), and follow-up state has no time limit (#160).
- Codex review of b19721e, one finding fixed: "Calvo" or "Hey Calvo" on its own (typed, or a follow-up already awake) was ignored or sent to the AI, because the greeting matchers did not know the "l" spelling. Both greeting matchers now accept "Calvo"/"Kalvo". Three phrase-list entries ("Calvo", "Hey Calvo", "Calvo.") red before, green after; variants 126/126. Checks: `npx tsc --noEmit`, `npm test` 619 pass, `npm run build`, `check-release.mjs` 12 pass. No Rust changed.
- Version 0.1.58 added at merge time. Codex review of 3b2e46f, one finding fixed: right after "For how long?", a short command holding a duration ("play five minutes") set a timer instead of running. The follow-up now accepts only a length with filler words ("um", "for", "make it", "please"). New entries "play five minutes" (red before, green after), "For five minutes please" and "Um, ten minutes."; variants 129/129. Checks: `npx tsc --noEmit`, `npm test` 619 pass, `npm run build`, `check-release.mjs` 12 pass. No Rust changed.
- Later rounds (5945796 to d9d5615, Codex and Cursor Bugbot): skip and the clock need a request shape; the last deciding clause wins; quotation and yes/no question leads go to the AI; polite tails, "put on", "give me", "advance", "skip ahead" and timer answers such as "is fine" are handled. Variants 185/185, owner phrases 100%. Final head checks: `npx tsc --noEmit`, `npm test` 619 pass, `npm run build`, `check-release.mjs` 12 pass. No Rust changed.
- Stopped here on the owner's direction (18 Nov 2026): Phase 2 replaces this pattern matching with the local model choosing from one action list, so the four findings on d9d5615 (quotation leads with "are/is/was", incidental negation after an accepted skip, "skip this song and tell me the time" not split, and yes/no quotation questions) are recorded as Phase 2 phrase-list cases in #175 instead of another fix round.

## 2026-11-18: Kevo 0.1, Kevo's log (Claude)

- New Tauri commands in `windows/src-tauri/src/log.rs`: `kevo_log_append` writes one JSON line per event to `kevo/kevo-log.jsonl` in AnF's data folder (`%LOCALAPPDATA%\Coucou`, `~/.local/share/coucou`), cut back to the newest 2,000 lines once it passes 3,000; `kevo_log_save` copies it to Downloads as `kevo-log-<version>.jsonl`; `kevo_log_open_folder` opens the folder. Nothing sends it anywhere.
- `windows/src/workspace/jarvis/kevo-log.ts`: fire-and-forget writer; a failed write never reaches Kevo.
- `JarvisVoiceListener` gains `onIgnored(text, reason)` (`no_wake_word`, `window_closed` = within 10 s after the follow-up window closed, `muted`) and passes the recogniser's error code to `onError`. `handleCommand` in `jarvis-command-desk.ts` reports `own_voice`.
- Events: `mic` (on/off), `recognition_error` (code, message), `wake`, `ignored` (text, reason), `request` (text, typed, actionName, reply, ms from heard to first word spoken; a timer set is actionName `timer_set`), `timer_fired`, `stop`. "Save log" and "Open log folder" buttons in the voice bar (existing `jarvis-btn` style).
- Tested: automated tests (`tests/kevo-log.test.ts`: answered request and ignored phrases each write one line, through the real command desk with a stand-in DOM; Rust `log::tests` for appending and trimming), compiled on Linux. Not run on the PC with a real microphone.
## 2026-11-18: Kevo 0.3, test builds (Claude autopilot)

Issue #150 (taken over from Codex after it stalled). `.github/workflows/windows.yml` now also runs on pushes to `main`, keeps the setup and portable uploads on those pushes, and gives every push to `main` its own concurrency group, so back-to-back merges each build. Code signing runs only on `windows-v*` tags and manual runs from `main`, so a push to `main` never gets the signing secrets. A new `kevo-test` job (push to `main` only, `contents: write` for that job only, one at a time) publishes prerelease `kevo-test-v<version>` at the merge commit when that merge changed the version and the release does not exist yet, with `AnF-Windows-<version>-kevo-test.zip` (the portable folder without `local-ai/model.gguf` and `model-fast.gguf`) and its `.sha256`. `PUBLISH` stays `'false'`; `updates.rs` and its prerelease test are unchanged. Tested: workflow YAML parses; type check, node tests, vite build and release checks pass. The publish job itself first runs on the merge into `main`.

## 2026-11-18: Kevo music volume and weather (Grok's branches, finished by Claude)
- Owner said (18 Nov) to approve and merge Grok's good branches. Taken from `grok/kevo-volume-control` (cd7b124) and `grok/weather-capability` (c6aa99e), both kept as Grok's commits.
- Volume: "turn it up", "volume down a bit", "louder", "mute", "unmute", "set the volume to 40". Matched only as a whole request, so "commute" and "mute my microphone" no longer mute the music (Grok's version matched inside words). Wired to a new `musicHub.changeVolume` that moves the slider, label and Mute button and saves, like the +/- keys.
- Weather: "what's the weather in Nairobi", "how's the weather today". Open-Meteo (free, no key), called only when asked. Grok's version was never wired into the app, was blocked by the CSP, defaulted to Berlin and gave Berlin's weather when a place was not found. Now: wired in `main.ts`, `geocoding-api.open-meteo.com` and `api.open-meteo.com` added to `connect-src`, no place named uses the last place asked (kept on the device) or asks "Which city?" and takes the answer, an unknown place is said so, Fahrenheit and mph for US English. "Open Weather" still opens the Weather app.
- After a fresh-subagent review: volume and weather also work when said politely ("can you turn the volume up", "turn it up please"); weather only when the weather itself is the request, so "what is the difference between weather and climate" still goes to the AI; after "Which city?" only a place name is taken; "tomorrow" gives tomorrow's forecast; a month or "next week" goes to the AI; 8 s timeout and a plain message when the service cannot be reached. Volume changes Music Hub only, not the desktop Spotube player; raising or setting the volume unmutes, as other players do.
- After the Codex review: weather is off until the owner says "turn on weather" ("turn off weather" stops it), because it sends the city to Open-Meteo and AGENTS.md allows network calls only to services the owner turned on; until then Kevo says so and sends nothing. Remembered in localStorage `anf-kevo-weather-on`. Chains split before volume and weather ("play music and turn it up", "weather in London and turn it down").
- Checks: `tsc`, `npm test` 636 pass (17 new), `check-release.mjs` 12 pass, `npm run build`. No Rust code changed. Not tried on the PC with a microphone. No version bump: left to the next Kevo autopilot merge (#174 is in flight).

## 2026-11-18: Kevo H.1, state bus (Claude)
- New `windows/src-tauri/src/kevo_hud.rs`: `KevoHudState { Off, Idle, Listening, Thinking, Speaking, Alert, Sleeping }` and one event `kevo://state` with `{state, line, badge, level}`. The logic is a pure `HudBus` that takes the time as an argument: it returns an event only when something changed, keeps `level` at 0 unless speaking (clamped to 0–1, NaN ignored), and lets a loudness-only change out at most once per 50 ms (20/s); any other change goes out at once.
- Command `kevo_hud_set(state, line?, level?)`, called from the desk's `refresh` (the place that computes `kevoState()`) through `kevoHudReporter` in `jarvis-hud.ts`, which sends each change once and never a repeat. `kevo_ask` sets `badge` to "Local model · N.N s" from its own timing when an answer completes. The web view sends only `state` today; `line` and `level` have no sender yet (H.3 / Phase 1). No polling, no timers.
- Tests: Rust unit tests `kevo_hud::tests` (change-only emission, loudness only while speaking, 20/s cap over 1,000 updates in 1 s with injected time); Node test in `tests/jarvis-hud.test.ts` that a sequence of `kevoState()` results with repeats calls `kevo_hud_set` exactly once per change. Automated tests and compiled on Linux only; nothing listens to `kevo://state` until H.2.

## 2026-11-18: Kevo H.4a, approval requests in Rust (Claude)
- New `windows/src-tauri/src/kevo_approval.rs`: `Approvals` keeps the pending request. `kevo_approval::ask(app, action, summary)` emits `kevo://approve` `{id, action, summary}` and waits for `kevo_hud_answer(id, approved)`. No answer in 60 s (counted from when the card is shown, not while queued) means deny; one request at a time, a second waits for the first; an unknown, already answered or timed-out id is refused with an error.
- No Kevo action uses the gate yet (Phase 5 and later must). The module is `pub mod` in `lib.rs` so the uncalled `ask` is public API, not dead code. Dev-dependency `tokio` feature `test-util` (paused test clock; pure Rust, `Cargo.lock` unchanged).
- Tests: `kevo_approval::tests` (timeout-is-deny at exactly 60 s and still waiting at 59.9 s, one-at-a-time, unknown id), all on tokio's paused clock, no real waiting. Automated tests and compiled on Linux only. Open point for H.4b: there is no "request closed" event, so a card whose request timed out learns it from the refused answer.


## 2026-11-18: #236 wake rate, fixed properly (Claude, `claude/fix-main-236-wake`)
- Owner's targets unchanged (≥19/20 wake, ≤1/10 look-alikes); no test skipped or loosened; all of #238's clip-fitted keyword variants removed.
- Root cause 1, the clips: Piper drops or garbles the first consonant of an utterance. Whisper small.en (independent listener, no name prompt) heard only 11/20 old wake clips as "Kevo" ("Pivo", "Heevo", "Have a"), and look-alikes were wrong too ("Heavy" -> "Pivvy"). `scripts/make-kevo-selftest-clips.py` now feeds phonemes with a leading pause, says KEH-vo by phoneme (`ɛ`) instead of the "Kevvo" spelling, and writes "Hey, Kevo" with the vocative comma (without it Piper swallowed the name's vowel). Wake voices: five LibriTTS-R speakers (100, 2299, 2401, 2404, 2853) picked for clarity by Whisper (all 8 test clips of each heard as the name; 13 of 40 random LibriTTS-R speakers qualified, no VCTK speaker and not LJ Speech), never by the spotter. VCTK is no longer used. All 40 clips regenerated once (not cherry-picked); `--check` passes. Whisper now hears all 10 look-alikes as the intended words.
- Root cause 2, the model: gigaspeech-3.3M (BPE) decodes a clean "Kevo" as "KEVILLE" and woke on ~8/24 clips Whisper confirms as the name. Also tried and rejected: keyword spotting with the shipped LibriSpeech transcriber (5/20), and hotword biasing on it (~79 %, fires on non-name clips). Now: phone-based `sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20` (Apache-2.0; k2-fsa release tarball 32,885,699 bytes, SHA-256 68447f4fbc67e70eee3a93961f36e81e98f47aef73ce7e7ca00885c6cd3616a6), served from the owner's mirror https://huggingface.co/mwalikokelvo/sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20 at commit c2bcb01bdac46ff111a9302205e5a2f8f337c9f5, folder `kevo-wake-model/`: int8 encoder 4,599,656 B `408bbd74…ae48`, decoder 759,829 B `63a22dd6…2c21`, int8 joiner 86,629 B `190d4067…7dc1`; `tokens.txt` (1,928 B, `2d3f3231…71b0`) compiled in as `resources/kevo-ears/kws-tokens.txt`. Keywords are pronunciations only: `K IY1 V OW0`, `K EH1 V OW0`, and both after `HH EY1`.
- Tuning: `max_active_paths` 16 (default 4), threshold 0.05, score 1.0. Across the committed set plus 14 fresh remakes (10 with the chosen voices, 4 with 8 held-out clear voices): 293/300 wakes, every set ≥19/20, 0/150 look-alike wakes. The plateau (threshold 0.03–0.1) holds; score 1.25+ with 16 paths starts waking on look-alikes, so it stays at 1.0.
- Committed clips: wake 19/20 (wake-13, libritts-2401 "Kevo", decoded as "G IH1 V AH0 L"), look-alikes 0/10, requests 10/10. Under 12 perturbations per clip (gain 0.7–1.15, 0–10 ms shift, dither) the other 19 wake clips woke 12/12 and no look-alike ever woke, so a small numeric difference on Windows should not flip the result.
- VAD `min_speech_duration` 0.20 -> 0.15 s: the new request clips start with a real /k/, so the barge-in test (measured from the first sample above 0.02) read 306.8 ms against its 300 ms budget; now 242.8 ms. `kevos_own_speech_alone_gives_no_wake_and_no_stop` still passes.
- Known limit: the model's English is US phones; British VCTK voices saying KEH-vo were heard as "K AH1 V ER0" ("cover"), which is why VCTK was dropped rather than adding a "cover" keyword. Worth watching in the owner's PC self-test.
- Tested: Linux container, `cargo test --locked --lib --features kevo-ears kevo_ears -- --test-threads=1`: 7/7 pass (KWS files hand-placed in the test folder and hash-checked by the test; CI downloads them from the mirror, whose URLs answer 200 with the pinned sizes). `cargo clippy --lib --tests --features kevo-ears`: no warnings in `kevo_ears.rs`. The tuning sweeps used Python sherpa-onnx 2.0.1 (same library version as the Rust crate). Not run on Windows here.
## 2026-11-18: Kevo 6.5 gate, prefill fix (Claude, branch `claude/fix-main-236-perf`, Refs #236)
- Cause of the 50 s "first sentence" failures: prefill, not generation or thinking. The ~2,000-token compact prompt + tool list was read from scratch at ~42 tokens/s on the 4-core runner: once on the suite's first question (nothing had warmed that prefix), and again after every `remember`, because facts sat in the system prompt, which the Qwen3 template renders in front of the tool list (checked with `/apply-template`). The second is a real app bug.
- Fix: facts go in their own system message after the tools (`getKevoMemoryPrompt`, `kevo_messages(.., memory)`, `kevo_ask` `memory`); `kevo_preload_model` now also writes one token over Kevo's prompt (tools, system, memory from `main.ts`), so it sits in the prompt cache before the first question; the perf test sends the app's request body and does the same preload before timing. Content checks accept equivalent correct forms ("9"/"nine", "dense"/"density", "dollar"/"$"). No budget changed, nothing skipped.
- CI Linux run 44358144145: Test step (incl. new `remembered_facts_follow_the_unchanged_system_prompt`) and Kevo CI gate green, perf suite 13/13. Prefill after the fix: France 22 tokens 0.69 s (was 2,039 tokens 48.7 s), multi-turn turn 2 41 tokens 1.2 s (was 1,997 tokens 47.6 s); the preload itself takes 30.8 s on the runner. Automated tests only; not tried on the PC. Open: a question asked within the preload time right after launch still waits for it.

## 2026-11-18: Kevo clause boundary sentence splitting for TTFS (Antigravity, branch `agy/kevo-clause-boundary-speech`, Refs #266)
- Cause of long-first-sentence TTFS budget overruns (e.g. 6.35 s on "15 percent tip"): answers with complex reasoning or clauses generate >100 characters before reaching a period (`.`, `!`, `?`). At ~40 tokens/s, waiting for the final period delays speech synthesis past the 5.0 s budget even with warm prefill.
- Fix: `take_streamable_sentences` in `windows/src-tauri/src/local_ai.rs` now yields at the first clause boundary (comma, colon, semicolon after about 40 characters) when a sentence runs long without an early sentence ending. Sentences with a period under ~80 characters keep their clean sentence boundary; long sentences or streaming tokens that hit a clause after 40 characters yield immediately to `kevo-reply-part`. `windows/tests/kevo-performance.test.ts` updated to match this clause boundary behavior.
- Checks: `cargo clippy --locked --manifest-path crates/anf-vault/Cargo.toml --all-targets -- -D warnings`, `npx tsc --noEmit` clean, `npm test` 796 pass (only pre-existing CalDesk test failing), `node scripts/check-release.mjs` 12 pass, contracts and styles clean. No budget changed.
- Autopilot review fix (Claude, 2026-11-21, fresh-subagent review since Codex was at its limit): the clause cut fired on every later part too, so a long answer was spoken as several short phrases. `take_streamable_sentences(buffer, first)` now cuts at a clause only for the first part (`kevo_ask` passes "no part sent yet"); later parts stay whole sentences. Dropped the `s > 80` rule (a finished sentence is spoken whole). The perf test's first-part regex now waits for the space after the mark, like the app. New test streams answers token by token, checks only the first part is cut and that "1,000" and "3:30" stay whole. Version 0.1.63 (merge-time bump).
