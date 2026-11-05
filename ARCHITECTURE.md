# AnF Workspace Architecture Specification

## 1. System Overview & Philosophy

**AnF** is an offline-first, local-first workspace for desktop (Windows/Linux) and mobile (Android). All documents, audio, knowledge bases, and AI inference run locally on the user's hardware without telemetry or mandatory cloud connections.

### Core Architectural Principles
- **Offline Autonomy**: Every capability—including text processing, OCR, audio synthesis, DSP equalization, and Spicetify styling—functions without internet access.
- **Embedded Protocol Security**: The Windows desktop shell (built with Tauri v2) embeds all web assets directly within the executable using the `custom-protocol` runtime (`tauri://localhost`). It does not rely on ephemeral local HTTP development servers.
- **Unified Domain Boundaries**: The workspace frontend logic is modularized into cohesive domains with backwards-compatible barrels.

---

## 2. Workspace Domain Structure (`windows/src/workspace/`)

```
windows/src/workspace/
├── audio/          # Playback engine, streaming providers, DSP, lyrics, visualizer
├── ai/             # Local LLM orchestration, RTEN OCR client, answer grounding
├── reader/         # Document library, ZIM offline archives, knowledge graphs
├── editor/         # Live Markdown editor, drafting guards, article publishing
├── storage/        # Encrypted SQLCipher vault, backup pack tools, snapshotting
├── marketplace/    # Spicetify theme engine, offline catalog, visual themes
├── index.ts        # Master workspace domain barrel
└── main.ts         # Application bootloader, layout orchestration, and IPC binding
```

### Domain Descriptions

### 2.1 Audio Domain (`src/workspace/audio/`)
- **`music-hub.ts` & `music-hub.css`**: Floating frosted-glass pill player bar (`border-radius: 9999px`, `backdrop-filter: blur(32px)`), dynamic reactive ambient glow (`120px` radius based on album art palettes), and ultrawide 3-column studio layout.
- **`audio-engine.ts` & `native-music-player.ts`**: WebAudio audio graph, track queuing, shuffle/repeat loops, and native OS media controls.
- **`audio-dsp.ts` & `audio-denoise.ts`**: Parametric EQ bands, spatial audio convolvers, and spectral subtraction denoisers.
- **`lyrics.ts`, `lyrics-provider.ts` & `echo-lyrics-orchestrator.ts`**: Synchronized LRC parser, LRCLIB API bridge with offline caching, and real-time lyric scrubbing.
- **`spotube-desktop.ts` & `streaming-provider.ts`**: Spotube integration, multi-source streaming abstraction, and fallback audio streams.
- **`podcast-feeds.ts` & `speech-player.ts`**: RSS podcast parser, chapter marker support, and local text-to-speech reader.
- **`echo-canvas.ts` & `echo-music-dna.ts`**: Real-time FFT spectrum visualizer, tempo tracking, and audio DNA harmonic signatures.

### 2.2 AI & OCR Domain (`src/workspace/ai/`)
- **`local-ai-manager.ts`**: Spawns and manages local `llama-server.exe` child processes, monitors system RAM limits, and streams completions.
- **`ocr-client.ts`**: Interacts with the embedded RTEN OCR engine (`ocrs`) on native endpoints with auto-failover.
- **`answer-evidence.ts` & `followups.ts`**: Document excerpt citation attribution (`[1]`) and proactive offline follow-up suggestion generator.

### 2.3 Reader & Knowledge Domain (`src/workspace/reader/`)
- **`reader.ts` & `reader.css`**: High-performance document reader supporting Markdown, plaintext, and formatted books.
- **`zim-reader.ts`**: Offline Wikipedia, Wiktionary, and Project Gutenberg reader using `.zim` compressed archives.
- **`library.ts` & `library-data.ts`**: Indexed document metadata cache and cross-document search index.
- **`knowledge-data.ts` & `quick-capture.ts`**: Bidirectional note linkages, tags, and low-friction capture scratchpad.

### 2.4 Editor & Publishing Domain (`src/workspace/editor/`)
- **`writing.ts` & `writing-layout.css`**: CodeMirror 6 markdown authoring canvas with split live preview.
- **`writing-guard.ts`**: Real-time draft recovery, atomic auto-saves, and collision guards.
- **`article-publishing.ts`**: Generates standalone single-file HTML articles and syndication RSS/Atom feeds from Markdown frontmatter.
- **`live-editor.ts` & `reply-to-draft.ts`**: In-place sentence rewriting and diff previews.

### 2.5 Storage & Cryptography Domain (`src/workspace/storage/`)
- **`vault-panel.ts`**: SQLCipher-backed local encrypted database interface.
- **`encrypted-pack.ts`**: AES-GCM encrypted export/import bundle format for cross-device migrations.
- **`snapshot-panel.ts` & `backup-tools.ts`**: Point-in-time state snapshot manager and automatic backup rotation.

### 2.6 Marketplace & Theming Domain (`src/workspace/marketplace/`)
- **`addons-core.ts` & `addons.ts`**: 1-click theme activation engine, dynamic stylesheet injection, and SHA-256 integrity validation.
- **`apps-catalog.ts`**: Local registry for verified extensions, community plugins, and offline utilities.
- **Spicetify Themes**: Pre-bundled high-contrast and ambient styles (`dribbblish-dynamic`, `sleek-oled`, `burnt-sienna-ember`, `starry-night-cosmic`, `shark-blue-frosted`, `mocha`).

---

## 3. Test Verification Tiers

Quality assurance is enforced across 4 discrete testing tiers before any binary packaging:

1. **Tier 1: Category-Partition Functional Coverage**:
   - 60 discrete functional tests (6 per core feature) covering happy-path flows, audio engine states, theme swaps, and document ingestion.
2. **Tier 2: Boundary Value Analysis & Stress Limits**:
   - 60 stress tests asserting behavior at payload limits (e.g., 200-entry inventory caps, large audio buffer allocations, malformed ZIM headers).
3. **Tier 3: Pairwise Combinatorial Cross-Feature Tests**:
   - 12 integration tests exercising cross-domain flows (e.g., audio playback during active OCR indexing while switching Spicetify visual themes).
4. **Tier 4: Real-World Multi-Step Workflows**:
   - 6 end-to-end user journeys executed via `windows/scripts/test-e2e.mjs`.
5. **Release Regression Checks**:
   - 10 checks in `scripts/check-release.mjs` verifying esbuild bundling and runtime safety.

---

## 4. Release Packaging & Verification Pipeline

Releases are built and packaged via `scripts/package-release.py`:

```
scripts/package-release.py --version X.Y.Z
```

### Build Artifacts:
1. **Windows NSIS Setup Installer** (`releases/anf-X.Y.Z/AnF-Windows-X.Y.Z-setup.exe`):
   - Built via Tauri CLI with `custom-protocol` enabled.
   - Bundles embedded WebView2 assets, local AI runners, and icons.
2. **Windows Portable Archive** (`releases/anf-X.Y.Z/AnF-Windows-X.Y.Z-portable.zip`):
   - Standalone directory structure containing `AnF.exe` and offline runtimes.
3. **Android Sideloadable Debug APK** (`releases/anf-X.Y.Z/AnF-Android-X.Y.Z-debug.apk`):
   - Verified via `scripts/check-android-apk.py`.
   - Verified for Android 15 16 KB ELF page-alignment (`zipalign -c -P 16 4`).
4. **Android Production Unsigned APK** (`releases/anf-X.Y.Z/AnF-Android-X.Y.Z-unsigned.apk`):
   - Verified for manifest compliance, ABI configurations, and 16 KB page-alignment.
5. **Cryptographic Manifest** (`releases/anf-X.Y.Z/SHA256SUMS`):
   - SHA-256 hash manifest covering all 4 deliverables.
