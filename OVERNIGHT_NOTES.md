# AnF & ThingsBook Overnight Engineering Log

**Started:** 2026-11-24 Evening  
**Mandate:** Exhaustive full-stack capability expansion, architectural hardening, and UX elevation

---

## Morning Coffee Triage

### Branches Shipped
| Repo | Branch | What It Unlocks | Verification |
|------|--------|-----------------|--------------|
| AnF | `grok/kevo-voice-suite-2026` | Coin flip, spelling assistant, audio sleep timer | `tsc --noEmit` clean, 948/948 tests pass |
| AnF | `grok/ui-command-palette-kevo` | Kevo commands wired into global Ctrl+K palette (commit `8bd9135d`) | `tsc` clean, **940/940 tests pass**, vite build green, check-release pass, ponytail-review **Ship** |
| AnF | `grok/adversarial-kevo-palette` (stacked) | Null-safe palette commands + adversarial QA tests (commit `b9ed1333`) | `tsc` clean, **943/943 tests pass**, ponytail-review **Ship** |
| ThingsBook | `grok/library-pace-and-activity` | Reading pace, streak, bookmark snippet helpers | 28 tests pass, 0 failed |

### In Progress Branches
*None yet*

### Broken Branches
*None yet*

### Smallest Highest-Leverage Next Step
Review `grok/kevo-voice-suite-2026` first — it has the most complete vertical slice with full test coverage. Then create new `grok/*` branches per the Master Roadmap below.

---

## Master Roadmap (Prioritized)

### Phase 1 — Foundation & Audit (Current)
- [ ] Audit both repos end-to-end (done in HANDOFF.md)
- [ ] Install/connect REA (done)
- [ ] Activate Ponytail full mode (done)
- [ ] Launch concurrent Tracks 1-4 (done)

### Phase 2 — Voice Assistant Domain (AnF → Kevo)
- [ ] `grok/ui-command-palette-kevo`: Global Ctrl/Cmd+K command palette with voice triggers
- [ ] `grok/voice-barge-in-improved`: Low-latency barge-in interruption while Kevo is speaking
- [ ] `grok/multi-turn-continuity`: Conversation continuity & anaphora resolution
- [ ] `grok/composable-routines`: Multi-step voice routines ("Study Mode", "Wrap up session")
- [ ] `grok/offline-intent-routing`: Deterministic offline intent routing with fuzzy entity resolution
- [ ] `grok/clipboard-selection-aware`: Clipboard/selection-aware voice actions

### Phase 3 — Audio Studio & Music Hub (AnF → Audio & Playback)
- [ ] `grok/gapless-playback-crossfade`: Gapless playback with configurable crossfade curves
- [ ] `grok/up-next-queue-history`: Dynamic up-next queue & history stack
- [ ] `grok/per-item-speed-memory`: Per-item speed memory
- [ ] `grok/smart-silence-trimming`: Smart silence trimming
- [ ] `grok/native-media-session`: Native OS media session & global media-key hooks (Windows SMTC)
- [ ] `grok/waveform-region-editing`: Non-destructive waveform region editing with undo/redo
- [ ] `grok/batch-transcoding-presets`: Batch transcoding presets
- [ ] `grok/lufs-normalization`: LUFS loudness normalization

### Phase 4 — Reading & Narration (ThingsBook + AnF Cross-Pollination)
- [ ] `grok/library-voice-search`: Voice-activated EPUB/OPDS library search & hands-free navigation
- [ ] `grok/what-was-i-reading-session`: Session-resume & context-recap engine
- [ ] `grok/word-synced-highlighting`: Word/sentence-synced read-aloud highlighting with auto-page-turn
- [ ] `grok/variable-wpm-ramping`: Variable WPM ramping
- [ ] `grok/mid-book-voice-switching`: Mid-book voice switching
- [ ] `grok/fade-out-sleep-timers`: Fade-out sleep timers
- [ ] `grok/cross-book-full-text-search`: Cross-book full-text/highlight search
- [ ] `grok/smart-dynamic-shelves`: Smart dynamic shelves
- [ ] `grok/annotation-markdown-export`: Clean Markdown/Chicago-citation annotation exports

### Phase 5 — Moonshots (One per repo)
- [ ] `grok/moonshot-local-semantic-search` (AnF): Local semantic search across books/notes
- [ ] `grok/moonshot-multi-voice-narration` (ThingsBook): Multi-voice chapter narration

### Phase 6 — Adversarial QA & Cross-Platform Parity
- [ ] Corrupted/malformed file stress tests
- [ ] Rapid interruption tests
- [ ] Offline disconnect tests
- [ ] Large library stress tests
- [ ] Windows/Android cross-target compilation feature gates

---

## Decision Log

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