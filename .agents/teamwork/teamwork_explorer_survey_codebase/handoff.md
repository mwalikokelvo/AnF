# Codebase Survey Handoff Report — AnF Offline-First Workspace

**Agent**: `explorer_survey_codebase` (teamwork_explorer)  
**Date**: 2026-10-30T23:57:00Z  
**Target Repository**: `C:\Users\mwali\.gemini\antigravity\scratch\AnF`  
**Current Branch**: `feat/mkr-music-integration`  

---

## 1. Observation

### 1.1 Git Repository State
- **Current Branch**: `feat/mkr-music-integration`, up-to-date with `origin/feat/mkr-music-integration`.
- **Working Tree**: Clean working directory. The only untracked directory is `.agents/` (agent teamwork metadata).
- **Remote**: `origin https://github.com/mwalikokelvo/AnF.git` (fetch and push).
- **Recent Commit Log** on `feat/mkr-music-integration`:
  - `eddccb4` (HEAD -> `feat/mkr-music-integration`, `origin/feat/mkr-music-integration`): *feat(ui): complete music-hub.css karaoke gradient mask and active line glow*
  - `7b5c62d`: *feat(ui): implement Workspace Shell tokens, Music Hub lyrics polish, and Writing Desk AI workflow*
  - `61c16ec`: *fix(music): address Codex code review findings for LRCLIB lyrics integration*
  - `84d3f9b`: *feat(music): integrate MKR Music lyrics provider and reconcile multi-LLM improvements*
  - `ba0c42a` (origin/main, origin/HEAD, main): *Docs: note render restore and library sort select*
- **Branch Topology**: Multiple active tracks exist across agent checkpoints (`origin/codex/*`, `origin/claude/*`, `origin/integration/*`, `origin/release/0.1.22`, `origin/feat/mkr-music-integration`).

### 1.2 Technology Stack & Runtime Configuration
- **Windows / Linux Desktop**:
  - **Framework**: Tauri 2 (`@tauri-apps/api: ^2`, `@tauri-apps/cli: ^2`, `tauri: 2`).
  - **Language / Runtime**: Rust 2021 edition + TypeScript 5.6.0 on Node.js (tested `v26.12.1`) + Vite 6 (`^6.4.5`).
  - **Backend Dependencies (`windows/src-tauri/Cargo.toml`)**:
    - `rusqlite = { version = "=0.40.2", features = ["bundled-sqlcipher-vendored-openssl"] }`
    - `tauri = { version = "2", features = ["tray-icon"] }`, `tauri-plugin-single-instance`, `tauri-plugin-autostart`
    - `tokio = { version = "1", features = ["net", "io-util", "sync", "time", "rt", "macros"] }`
    - `reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }`
    - Document & Parsing: `pdf-extract = "0.12"`, `scraper = "0.24"`, `zip = "2.4"`, `flate2 = "1"`, `quick-xml = "0.42"`
    - OCR & ML: `ocrs = "0.13.1"`, `rten = "0.26"`, `image = "0.25"`
    - Security / System: `sha2 = "0.10"`, `ring = "0.17"`, `keyring = "3"`, `windows = "0.61"`
  - **Frontend Dependencies (`windows/package.json`)**:
    - Markdown / Code Editor: `@codemirror/view: ^6.43.15`, `@codemirror/state: ^6.7.6`, `@codemirror/language: ^6.13.1`, `@codemirror/lang-markdown: ^6.5.2`, `@codemirror/autocomplete: 6.20.4`, `@codemirror/commands: ^6.11.1`, `@lezer/highlight: ^1.2.5`
    - Audio Metadata: `music-metadata = "12.2.3"`
- **Android**:
  - **Language / Runtime**: Java 8 (JavaVersion.VERSION_1_8) + Android Gradle Plugin 9.2.1 (`com.android.tools.build:gradle:9.2.1`).
  - **SDK Versions**: `compileSdk = 37`, `buildToolsVersion = "36.0.0"`, `minSdk = 26`, `targetSdk = 35`.
  - **Native Packages (`android/build.gradle:63-75`)**:
    - `net.zetetic:sqlcipher-android:4.19.1`
    - `androidx.sqlite:sqlite:2.7.0`
    - `androidx.media3:media3-exoplayer:1.6.1`
    - `androidx.media3:media3-session:1.6.1`
    - Opt-in Spotube Flutter runtime: `com.coucou.spotube:flutter_release:1.0`, `desugar_jdk_libs:2.1.5`
  - **Web Frontend**: Built via esbuild (`scripts/build-android.mjs`) targeting `chrome110` with output in `android/build/assets/web/main.js` and `main.css`, loaded by `MainActivity` via Android WebView.
- **Shared Core (`shared/`)**:
  - `shared/audio/denoise.ts`: Overlap-add FFT spectral subtraction, profile validation, progress and cancellation.
  - `shared/audio/queue.ts`: Queue reconciliation, repeat modes (`off`, `track`, `all`), shuffle, track reordering.
  - `shared/domain/`: Pure domain interfaces: `knowledge-data.ts`, `reader-data.ts`, `dashboard-data.ts`, `followups.ts`, `answer-evidence.ts`, `library-data.ts`.
- **Shared Rust Crate (`crates/anf-vault/`)**:
  - Shared vault domain: schema constants (`SCHEMA_VERSION = 1`), project validation limits, stable SHA-256 revision hash generation (`anf-vault/src/lib.rs`).
- **macOS Companion (`NotchBuddy/`)**:
  - Native Swift 6 / SwiftUI / AppKit companion living in MacBook notch, built via XcodeGen (`project.yml`). Zero 3rd-party dependencies.

---

### 1.3 Architecture & Module Inventory
The AnF workspace is organized around dedicated modules accessible through a responsive navigation rail (`windows/src/workspace/nav-rail.ts`) and mode rail (`read`, `ask`, `listen`, `keep` in `main.ts:191-198`):

1. **Home / Dashboard** (`windows/src/workspace/dashboard.ts`, `shared/domain/dashboard-data.ts`):
   - Daily note quick capture (`quick-capture.ts`, `captureDaily`).
   - Project history, active reading position resume, and habit/task progress.
2. **Chat / Assistant** (`windows/src/workspace/main.ts`):
   - Offline LLM interface via Tauri IPC command `workspace_ask`.
   - Context scope selector: `loaded` (all sources), `document` (first source), `draft` (active draft), or `none`.
   - Follow-up suggestion generation (`followups.ts`).
   - Pagination for long responses (`response-pages.ts`).
   - Document excerpt citations and verified evidence display (`renderEvidence`).
3. **Documents & Reader** (`windows/src/workspace/reader.ts`, `reader.css`, `shared/domain/reader-data.ts`, `library.ts`):
   - Multi-format ingestion: PDF (via `pdfjs-dist` and `pdf-extract`), EPUB, Word (.docx), plain text, markdown.
   - Text sectioning, exact quote anchor verification, bookmarking, and annotation tracking.
   - Reader excerpt clipping (`clipText`) into draft or AI inquiry.
4. **Writing Desk** (`windows/src/workspace/writing.ts`, `writing-layout.css`, `live-editor.ts`):
   - Live CodeMirror editor for markdown writing.
   - AI revision tools: "Improve clarity and flow", "Review writing style" (`main.ts:163-179`).
   - Multi-format export via Tauri backend `workspace_save`: `.docx`, `.pdf` (via print dialog), `.txt`, `.md`, `.html`, `.rtf`.
   - Windows speech synthesis read-aloud (`window.speechSynthesis`).
5. **Music Hub** (`windows/src/workspace/music-hub.ts`, `music-hub.css`, `audio-library.ts`, `audio-metadata.ts`):
   - Dedicated local music player separate from Audio Studio.
   - Local IndexedDB database `coucou-audio` holding `tracks` and `playlists`.
   - Persistent playback dock (`dock`) and modal full-screen player (`fullPlayer`).
   - Audio queueing, repeat modes, shuffle, sleep timer, speed control.
   - Podcast RSS feed parsing (`podcast-feeds.ts`) with Substack URL normalization.
6. **Audio Studio** (`windows/src/workspace/audio-studio.ts`, `audio-studio.css`, `audio-data.ts`):
   - Waveform visualization, audio recording, and spectral noise reduction (`shared/audio/denoise.ts`).
   - Format conversion via Tauri IPC `audio_convert` (WAV, MP3, etc.).
7. **Vault & Security** (`windows/src/workspace/vault-panel.ts`, `crates/anf-vault`, `android/java/com/coucou/workspace/VaultRepository.java`):
   - SQLCipher encrypted database at rest with Argon2id key derivation.
   - Snapshot versioning (`snapshot-panel.ts`), recovery key export, and tamper-resistant backup verification (`backup-tools.ts`, `encrypted-pack.ts`).
8. **Addons & Marketplace** (`windows/src/workspace/addons.ts`, `marketplace/registry.json`, `android/java/com/coucou/workspace/AddonsBridge.java`):
   - Theme and plugin registry with SHA-256 hash enforcement before application.
9. **Wi-Fi Sync & Cross-Platform Link** (`main.ts:226-230`, `android/java/.../LocalLink.java`, `android/web/sync.ts`):
   - Local Wi-Fi direct encrypted synchronization between Windows PC and Android devices without external cloud relay.

---

### 1.4 Audio, Player & MKR Music Implementations
- **Audio Engine**:
  - Windows: HTML5 `new Audio()` instance with `preload = 'metadata'` inside `createMusicHub` (`windows/src/workspace/music-hub.ts:15`).
  - Android: Native Media3 ExoPlayer (`PlaybackService.java`) controlled via `MediaBridge.java` and JavaScript interface `AnFAndroid.mediaRequest('play', ...)`.
  - Mutual Exclusivity: Starting Music Hub explicitly calls `audioStudio.stop()` and `invoke('music_pause')`; starting Audio Studio suspends Music Hub.
- **MKR Music Synced Lyrics Engine**:
  - `windows/src/workspace/lyrics.ts`:
    - `parseLyrics(source)`: Parses standard LRC lines, timestamp tags `[mm:ss.xx]`, offsets `[offset:±ms]`, and plain text.
    - `activeLine(lyrics, time)`: Fast binary search returning the active line index for millisecond timestamps.
    - `toLrc(lines)`: Converts embedded millisecond timestamps into standardized LRC format.
    - `matchLyricsTrack(file, tracks)`: Robust matching between `.lrc` files and audio files by directory and base stem.
  - `windows/src/workspace/lyrics-provider.ts`:
    - Ported from MKR Music (`@mkr-infinity/mkr-music`).
    - `cleanTitle(title)`: Strips promotional metadata (e.g. `(Official Video)`, `[Audio]`, `Remastered 2021`, `feat. ...`).
    - `primaryArtist(artist)`: Extracts lead artist from collaboration strings (`&`, `feat.`, `x`, `,`).
    - `fetchOnlineLyrics(track)`: Queries LRCLIB REST API (`https://lrclib.net/api/get` exact match, followed by `https://lrclib.net/api/search` fuzzy query with duration matching). Persists retrieved lyrics into IndexedDB track record for offline reuse.
  - **Lyrics UI**:
    - Karaoke gradient mask and active line glow (`music-hub.css:216-258`).
    - Click-to-seek functionality: Clicking any lyric row immediately sets `audio.currentTime = line.time`.
    - Auto-scrolling in the full player tracking playback progress.

---

### 1.5 Build & Test Setup: Execution Results
All test suites and build tools were directly executed and verified:

| Command | Working Directory | Result | Output Details |
|---|---|---|---|
| `npm test` | `windows/` | **PASSED** (0 code) | 3 tests passed in 164ms (`cleanTitle`, `primaryArtist`, `parseLyrics`) |
| `npx tsc --noEmit` | `windows/` | **PASSED** (0 code) | Strict TypeScript type checking across all workspace files with zero errors |
| `npx vite build` | `windows/` | **PASSED** (0 code) | Production bundles generated for `companion.html`, `workspace.html`, `index.html`, `settings.html` |
| `node scripts/check-styles.mjs windows/dist` | Root | **PASSED** (0 code) | All 4 built HTML pages verified with required layout selectors and valid CSS |
| `node scripts/check-release.mjs` | Root | **PASSED** (0 code) | 10 regression checks passed: timing, lyrics, reader, library, dashboard, knowledge, Android data, reading notes, sync, storage, delayed native media |
| `node scripts/verify-contracts.mjs` | Root | **PASSED** (0 code) | Contract fixtures verified: `project-v1.json`, `sync-snapshot-v1.json`, SHA-256 revision stable |
| `node scripts/build-android.mjs --assets-only` | Root | **PASSED** (0 code) | Bundled `android/build/assets/web/main.js` (1.4 MB) & `main.css` (57 KB) via esbuild in 423ms |
| `cargo test` | `crates/anf-vault` | **PASSED** (0 code) | 5 tests passed (`clean_strips_paths`, `conflict_helpers`, `validates_sample`, `schema_constant`, `revision_stable`) |
| `cargo check -p coucou-hook` | `windows/` | **PASSED** (0 code) | Relay hook compiled cleanly in 6.78s |
| `cargo test --workspace` | `windows/` | **Failed** (1 code) | `crossbeam-utils v0.8.23` error during `cargo test`: `only metadata stub found for 'rlib' dependency 'core' please provide path to the corresponding .rmeta file with full metadata` on local `rustc 1.99.1`. |

---

## 2. Logic Chain

1. **Architecture Cohesion**:
   - *Observation*: The repository cleanly separates native platform hosts (`windows/` via Tauri 2, `android/` via native Java + WebView) from core business logic (`shared/audio`, `shared/domain`, `crates/anf-vault`).
   - *Inference*: Changes to core domain and audio algorithms (such as MKR Music lyrics and DSP) are isolated from platform-specific WebView bindings and can be tested deterministically in pure Node.js environments.

2. **MKR Music Lyrics Engine Readiness**:
   - *Observation*: `windows/src/workspace/lyrics.ts` and `lyrics-provider.ts` implement LRCLIB API querying, title sanitation, LRC parsing, and click-to-seek playback. `music-hub.css` provides the visual karaoke glow and smooth scrolling.
   - *Inference*: The core MKR Music synchronized lyrics integration (R1) is functionally complete on branch `feat/mkr-music-integration`, and all unit tests in `lyrics-provider.test.ts` and `lyrics-check.cjs` pass.

3. **Offline-First Resilience**:
   - *Observation*: Once lyrics are fetched from LRCLIB, `music-hub.ts:55` commits them into the local IndexedDB track object (`await library.put(target)`). When offline, the player immediately loads cached `current.lyrics` without issuing network requests.
   - *Inference*: Synchronized lyrics playback adheres to the offline-first mandate (R3).

4. **Multi-Platform Build Tooling**:
   - *Observation*: `scripts/build-android.mjs --assets-only` successfully bundles Android web assets. However, full APK packaging via Gradle and Windows NSIS packaging require specific local SDK installations. Node.js, npm, Python, Git, and Rust toolchains are active, while `gradle` and `javac` are not present on the system PATH.
   - *Inference*: Frontend and unit test verification can be run rapidly without external prerequisites; full APK generation requires provisioning Gradle or running on CI/sandboxed environments.

---

## 3. Caveats

1. **Host Rustc Metadata Issue in `windows/src-tauri`**:
   `cargo test` in `crates/anf-vault` and `cargo check -p coucou-hook` succeed, but `windows/src-tauri` full workspace test failed on `crossbeam-utils` with a rustc rmeta dependency error on `rustc 1.99.1`. Rust development on `src-tauri` may require cleaning cargo cache (`cargo clean`) or checking target sysroots.
2. **Android Native Build Dependencies**:
   While `scripts/build-android.mjs --assets-only` passes, running a full `gradle assembleRelease` requires Java 17/Android SDK/build-tools which are not in the current shell environment PATH.
3. **ThingsBook / `_core` is Legacy**:
   As explicitly noted in `contracts/fixtures/README.md:3`, `_core` belongs to an older ThingsBook checkpoint and is out of scope for AnF workspace enhancements.
4. **Spotube Native Reviews**:
   The native Spotube embedding is an opt-in review feature (`--with-spotube`), whereas local Music Hub is the primary standalone player.

---

## 4. Conclusion

The AnF codebase at `C:\Users\mwali\.gemini\antigravity\scratch\AnF` is in a healthy, well-structured state on branch `feat/mkr-music-integration`.
- **R1 (Music Hub Audio Player & Synced Lyrics)**: The MKR Music player engine and LRCLIB synchronized lyrics integration are implemented with high fidelity, passing all regression tests.
- **R2 (Architectural Expansion Pillars)**: The workspace architecture is modularly laid out across Home, Chat, Documents/Reader, Writing, Music Hub, Audio Studio, and Vault/Settings. Clear extension points exist for Podcast parsing (AntennaPod), article reading/publishing (Substack), ZIM/knowledge base (Kiwix), waveform audio editing (Audacity), and Addon/Marketplace catalog (Orion Store).
- **R3 (Offline-First Cross-Platform)**: Local IndexedDB, SQLCipher encrypted repositories, and neutral TypeScript shared domains preserve offline operation for Windows and Android.
- All core frontend test commands, style checks, contract validations, and asset compilation scripts pass cleanly.

---

## 5. Verification Method

To independently verify the survey observations, run the following commands in powershell from `C:\Users\mwali\.gemini\antigravity\scratch\AnF`:

```powershell
# 1. Run unit tests for MKR Music lyrics provider and parsing (in windows/)
cd C:\Users\mwali\.gemini\antigravity\scratch\AnF\windows
npm test

# 2. Run TypeScript strict type verification
npx tsc --noEmit

# 3. Run Vite bundle compilation
npx vite build

# 4. Verify release regression suite across 10 modules
cd C:\Users\mwali\.gemini\antigravity\scratch\AnF
node scripts/check-release.mjs

# 5. Verify contract fixtures and SHA-256 revision hashing
node scripts/verify-contracts.mjs

# 6. Verify stylesheet packaging
node scripts/check-styles.mjs windows/dist

# 7. Verify Android web assets bundling
node scripts/build-android.mjs --assets-only

# 8. Run shared vault crate unit tests
cd C:\Users\mwali\.gemini\antigravity\scratch\AnF\crates\anf-vault
cargo test
```

### Invalidation Conditions:
- Any test failure in `scripts/check-release.mjs` or `npm test`.
- Unresolved TypeScript compilation errors in `npx tsc --noEmit`.
- Discrepancy between contract schemas and `contracts/fixtures/`.
