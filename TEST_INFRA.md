# AnF Offline-First Workspace Expansion: E2E Test Infrastructure Specification

## 1. Overview & Architectural Scope

This document specifies the end-to-end (E2E) opaque-box testing framework and methodology for the AnF offline-first workspace expansion (Windows desktop Tauri 2 host, Android WebView/Media3 host, and shared TypeScript domain/Rust crates).

The test suite validates the system against the requirements documented in `ORIGINAL_REQUEST.md` and `PROJECT.md`, strictly through public interfaces, standard data schemas, and user-observable interactions without modifying production application code.

### Test Targets & Module Boundaries
- **Media & Music Hub**: MKR Music playback engine (`music-hub.ts`, `native-music-player.ts`), LRCLIB lyrics synchronization (`lyrics.ts`, `lyrics-provider.ts`), AntennaPod podcast RSS parsing (`podcast-feeds.ts`), Spotube streaming integration (`audio-library.ts`, `spotube-desktop.ts`).
- **Reader & Publishing**: Substack article reading queue, distraction-free typography, Markdown live editor (`reader.ts`, `reader-data.ts`, `writing.ts`).
- **Vault & Knowledge Base**: OpenZIM archive reading, encrypted SQLCipher vault revisioning, wikilinks, tags, knowledge graph (`crates/anf-vault`, `knowledge-data.ts`, `vault-panel.ts`, `encrypted-pack.ts`).
- **Audio Studio**: Multi-track recording, waveform visualization, spectral subtraction noise cleanup, non-destructive editing (`audio-studio.ts`, `audio-data.ts`, `shared/audio/denoise.ts`, `shared/audio/queue.ts`).
- **Addon Marketplace & Local AI**: Orion Store offline catalog, theme verification, sandboxed execution (`addons-core.ts`, `addons.ts`, `marketplace/registry.json`), DeepSeek/Flint bucket weight management, local CPU inference (`windows/src-tauri/src/local_ai.rs`, `followups.ts`, `answer-evidence.ts`).
- **Cross-Cutting Offline-First Core**: 4-tier storage hierarchy (SQLCipher, IndexedDB, Filesystem, Session), offline mutation queues, zero-connectivity graceful degradation.

---

## 2. 4-Tier Testing Methodology

The testing architecture employs a rigorous 4-tier opaque-box test methodology ensuring complete verification from individual feature paths up to comprehensive multi-step user workflows.

```
+-------------------------------------------------------------------------+
| Tier 4: Real-World Workload Testing (Realistic User Journeys)           |
| (6 Comprehensive E2E Scenarios: Multi-module stateful workflows)        |
+-------------------------------------------------------------------------+
                                    ^
+-------------------------------------------------------------------------+
| Tier 3: Pairwise Combinatorial Testing (Cross-Feature Interactions)     |
| (12 Cross-Feature Pairs: Media x Vault, Lyrics x Player, Studio x Hub)  |
+-------------------------------------------------------------------------+
                                    ^
+-------------------------------------------------------------------------+
| Tier 2: Boundary Value Analysis (Corner Cases & Failure Handling)       |
| (60 Tests: 6 per feature x 10 features: Limits, Nulls, Stress, Corrupt) |
+-------------------------------------------------------------------------+
                                    ^
+-------------------------------------------------------------------------+
| Tier 1: Category-Partition Testing (Feature Functional Coverage)        |
| (60 Tests: 6 per feature x 10 features: Primary behavior & happy paths) |
+-------------------------------------------------------------------------+
```

### 2.1 Tier 1: Category-Partition (Feature Functional Coverage)
- **Objective**: Verify nominal functionality and primary paths for every feature in the Feature Inventory.
- **Methodology**: Systematically decompose each feature's input domains, configurations, and internal states into discrete equivalence classes (partitions). Select representative test vectors covering each partition.
- **Coverage**: At least 5 test cases per feature across all 10 features (>= 50 tests total; target: 60 tests).

### 2.2 Tier 2: Boundary Value Analysis (Boundary & Corner Cases)
- **Objective**: Stress test limits, corner cases, invalid inputs, resource constraints, and error boundaries.
- **Methodology**: Identify domain boundaries for numeric, string, array, and storage limits:
  - Numeric limits: $0$, $1$, max safe integer, negative numbers, non-finite values (NaN, Infinity).
  - Data boundaries: 0 bytes (empty), single item, maximum permitted size (e.g. 200 KB text limits, 32 MB audio limits, 2,000 char highlights, 100 bookmarks).
  - Malformed inputs: corrupted XML/JSON, unrecognized LRC tags, missing enclosures, invalid checksums, unauthorized CSS rules (`@import`, external URLs).
  - Error isolation: Graceful fallback on network loss, rate limiting (HTTP 429/503), corrupted storage records.
- **Coverage**: At least 5 test cases per feature across all 10 features (>= 50 tests total; target: 60 tests).

### 2.3 Tier 3: Pairwise Combinatorial (Cross-Feature Interactions)
- **Objective**: Verify interoperability between orthogonal features when coupled in shared workflows.
- **Methodology**: Select 2-way interaction pairs across the 10 features using combinatorial test design:
  - F1 (Player Engine) + F2 (Synced Lyrics): Active lyric tracking synchronizing with player seek and pause.
  - F3 (Podcast RSS) + F4 (Audio Library): Fetching RSS episodes, caching blobs in IndexedDB, and enqueueing playback.
  - F5 (Reader) + F6 (Vault Knowledge): Selecting reader highlights, clipping quotes, and indexing them in knowledge graph.
  - F6 (Vault Knowledge) + F9 (Local AI): Grounding AI completions in vault document excerpts and verifying answer evidence.
  - F7 (Audio Studio) + F1 (Music Hub): Editing raw audio, exporting 16-bit WAV, and importing it into the music library.
  - F8 (Addon Store) + F5 (Reader UI): Installing an offline theme and validating reader stylesheet cascading.
  - F9 (Local AI) + F5 (Publishing): Generating article drafts with AI and publishing to Markdown bundle and RSS.
  - F6 (ZIM Knowledge) + F10 (Storage Hierarchy): Querying offline ZIM entries and backing up encrypted database packs.
  - F3 (Podcast) + F7 (Audio Studio): Routing podcast episodes into studio waveform editing for noise removal.
  - F4 (Streaming) + F2 (Lyrics) + F10 (Offline Cache): Resolving stream metadata, caching audio blob, and cascading lyrics.
  - F8 (Addon Store) + F10 (Storage Hierarchy): Enforcing Tier 3 filesystem verification for addon themes.
  - F9 (Local AI) + F10 (Offline Core): Memory pre-flight check and offline model execution without cloud calls.
- **Coverage**: At least 10 cross-feature tests (target: 12 tests).

### 2.4 Tier 4: Real-World Workload Testing (Application Scenarios)
- **Objective**: Simulate end-to-end user journeys spanning multiple modules, lifecycle transitions, and real data workflows.
- **Methodology**: Construct realistic operational scenarios reflecting actual usage profiles:
  1. *Complete Music Listening Journey*: Multi-track import, metadata reading, LRCLIB lyrics sync, queue shuffle, repeat cycles, sleep timer arming.
  2. *Research and Knowledge Synthesis*: Long-form reading, multi-color highlighting, quote clipping, wikilink cross-referencing, tag tree navigation.
  3. *Podcast Recording to Studio Production*: Subscription ingestion, AudioWorklet microphone capture, waveform region trimming, spectral noise reduction, WAV export.
  4. *Encrypted Vault Migration & Recovery*: Encrypted SQLCipher project migration, FTS5 search indexing, revision tracking, PBKDF2/AES-GCM recovery key export and restore.
  5. *Offline Marketplace & Grounded AI*: Addon catalog inspection, SHA-256 verification, local AI model selection, context prompt injection with document grounding.
  6. *Multi-format Substack Publishing Pipeline*: Frontmatter drafting, live Markdown rendering, reading metrics estimation, HTML export, RSS 2.0 generation, ZIP packaging.
- **Coverage**: At least 5 multi-step workflows (target: 6 tests).

---

## 3. Feature Inventory Mapping Matrix

| Feature ID | Feature Name | Primary Source Modules | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Cross-Feature) | Tier 4 (Workflows) |
|---|---|---|:---:|:---:|:---:|:---:|
| **F1** | MKR Music Audio Player Engine | `audio-queue.ts`, `audio-data.ts`, `native-music-player.ts` | 6 tests | 6 tests | 3 tests | Scenario 1 |
| **F2** | LRCLIB Synced Lyrics Integration | `lyrics.ts`, `lyrics-provider.ts` | 6 tests | 6 tests | 3 tests | Scenario 1 |
| **F3** | AntennaPod Podcast RSS & Playback | `podcast-feeds.ts`, `audio-library.ts` | 6 tests | 6 tests | 2 tests | Scenario 3 |
| **F4** | Spotube Streaming Audio Integration | `spotube-desktop.ts`, `native-music-player.ts`, `audio-library.ts` | 6 tests | 6 tests | 2 tests | Scenario 1 |
| **F5** | Substack Article Reader & Publishing | `reader-data.ts`, `reader.ts`, `writing.ts` | 6 tests | 6 tests | 3 tests | Scenarios 2, 6 |
| **F6** | Kiwix ZIM Archive Reading & Knowledge | `knowledge-data.ts`, `vault-panel.ts`, `crates/anf-vault` | 6 tests | 6 tests | 3 tests | Scenarios 2, 4 |
| **F7** | Audacity Audio Studio Waveform Editing | `audio-data.ts`, `shared/audio/denoise.ts`, `shared/audio/queue.ts` | 6 tests | 6 tests | 3 tests | Scenario 3 |
| **F8** | Orion Store Addon Marketplace | `addons-core.ts`, `windows/src-tauri/src/addons.rs`, `marketplace/` | 6 tests | 6 tests | 2 tests | Scenario 5 |
| **F9** | Local AI Model Execution & Weights | `windows/src-tauri/src/local_ai.rs`, `followups.ts`, `answer-evidence.ts` | 6 tests | 6 tests | 3 tests | Scenarios 4, 5 |
| **F10** | Cross-Cutting Offline-First & Platform | `encrypted-pack.ts`, `audio-library.ts`, storage hierarchy | 6 tests | 6 tests | 3 tests | Scenarios 4, 5 |
| **TOTAL** | **All 10 Features** | **Full Workspace Suite** | **60 tests** | **60 tests** | **12 tests** | **6 tests** |

**Grand Total Test Suite Count**: **138 test cases** (exceeds the $\ge 115$ requirement).

---

## 4. Test Harness & Execution Engine

### 4.1 Framework & Tools
- **Test Runner**: Node.js built-in test runner (`node:test`, `node:assert/strict`) for deterministic, zero-dependency test execution.
- **Bundler**: `esbuild` 0.25+ targeting Node 20/26 ESM, bundling TypeScript modules with `.css` loaders stubbed to empty.
- **Headless Test Environment**: Lightweight mock runtime (`test-env.ts`) providing browser polyfills:
  - `localStorage` in-memory key-value store.
  - `DOMParser` for XML/HTML parsing (RSS feed extraction and Markdown AST generation).
  - `indexedDB` transactional mock for `coucou-audio` object stores (`tracks`, `state`, `playlists`).
  - `Web Crypto API` (`crypto.subtle`, `crypto.getRandomValues`) for PBKDF2-SHA256 and AES-GCM encryption.

### 4.2 Runner Command
Tests are executed via the project test script or direct node runner:
```bash
# Standard project runner:
cd windows && npm test

# Direct E2E test runner:
cd windows && node scripts/test-e2e.mjs
```

### 4.3 Test Pass/Fail Gates
1. **Compilation**: All TypeScript test files compile without error.
2. **Deterministic Assertions**: No facade or placeholder tests; all assertions test state transitions, mathematical properties, and payload integrity.
3. **Pass Rate**: 100% pass rate across all 138 test cases.
4. **Zero Production Mutation**: Production code in `windows/src/` and crates remains completely untouched.
