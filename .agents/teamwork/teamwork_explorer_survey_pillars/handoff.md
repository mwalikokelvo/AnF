# Architectural Expansion Pillars Survey & Specification Report

**Agent**: `teamwork_explorer_survey_pillars`  
**Working Directory**: `C:\Users\mwali\.gemini\antigravity\scratch\AnF\.agents\teamwork\teamwork_explorer_survey_pillars`  
**Workspace**: `C:\Users\mwali\.gemini\antigravity\scratch\AnF`  
**Date**: 2026-10-30T23:55:00Z  

---

## 1. Observation

### 1.1 Existing Architecture & Technology Boundaries
From direct inspection of the workspace (`README.md`, `CLAUDE.md`, `docs/AF-Master-Plan.md`, and `docs/PROJECT-BOUNDARIES.md`):
- **Windows Host**: Tauri 2 (Rust backend in `windows/src-tauri/`, TypeScript/DOM frontend in `windows/src/workspace/`).
- **Android Host**: Java WebView host (`android/java/com/coucou/workspace/`) + AndroidX Media3 (`PlaybackService.java`, `MediaBridge.java`) + opt-in Flutter music adapter (`integrations/spotube/`, `android/spotube-host/`).
- **Shared Logic**: Portable TypeScript modules in `shared/` (`shared/audio/`, `shared/domain/`) and `windows/src/workspace/`.
- **Vault & Storage**: Portable domain crate in `crates/anf-vault/` governed by versioned contracts (`docs/contracts/vault-v1.md`, `docs/contracts/vault-bridge-v1.md`, `docs/contracts/sync-v1.md`). SQLite/SQLCipher databases (`anf-vault`, `coucou.sqlite`), IndexedDB databases (`coucou-audio`, `anf-music-player`), and local filesystem caches.
- **Strict Project Boundary**: `_core` belongs to ThingsBook and is explicitly forbidden from being used as AnF's storage backend or vault (`docs/PROJECT-BOUNDARIES.md:9-19`).

### 1.2 Baseline Pillar Status in Codebase
1. **Podcast & RSS**:
   - `windows/src/workspace/podcast-feeds.ts:1-124`: Implements basic RSS parsing (`parseRss`), duration parsing, Substack URL normalization (`substackFeedUrl`), and Android bridge fetching (`AnFAndroid.fetchRss`). Stores up to 40 feeds in `localStorage` under key `anf-podcast-feeds`.
   - `windows/src/workspace/music-hub.ts:28, 109-120`: Has a `podcasts` tab, but currently only renders feed titles with "Refresh" and "Remove". Episodes, episode playback, progress persistence, and offline audio caching are not yet hooked up into the main library or UI cards.
2. **Streaming Audio & Metadata**:
   - `windows/src/workspace/music-hub.ts:1-133`: Full dark-mode local player supporting IndexedDB `coucou-audio`, local audio tags, playlists, queue management, volume/speed/sleep-timer, and LRCLIB synchronized lyrics (`lyrics-provider.ts`).
   - `docs/MUSIC-HUB.md:1-176`: Spotube native Flutter module is an opt-in review build.
   - `integrations/mkr-music/README.md:1-53`: Documents MKR Music integration for synchronized lyrics (`lyrics-provider.ts`, `lyrics.ts`), multi-engine streaming, and studio EQ.
3. **Reader & Publishing**:
   - `windows/src/workspace/reader.ts:1-55` & `reader-data.ts`: Overlay reading modal with themes (soft dark, AMOLED black, warm sepia, light, night amber), typography (serif, sans, mono, size, line-spacing), text-to-speech (`speech-player.ts`), bookmarks, and annotations.
   - `windows/src/workspace/writing.ts:1-83` & `live-editor.ts`: Markdown editor with live preview, word counter, and revision proposal diffing.
   - Gap: No dedicated article reading list / subscription feed inbox, no rich Substack rendering with embedded media, and no publishing / export pipeline (static site, RSS, EPUB/PDF bundle).
4. **Knowledge Base & ZIM Archive**:
   - `shared/domain/knowledge-data.ts:1-35`: Implements note graph connections, wiki links (`[[note]]`), hierarchical tags (`#tag/subtag`), and task checklist parsing.
   - `crates/anf-vault/src/lib.rs:16-22`: Defines schema v1 with FTS5 virtual table `project_search`.
   - Gap: Zero ZIM (openZIM archive) inspection, reading, or indexing capabilities exist in the codebase today.
5. **Audio Studio & Waveform Editing**:
   - `windows/src/workspace/audio-studio.ts:1-100`: Waveform overview canvas (`canvas.getContext('2d')`), spectral clean (`audio-denoise.ts`), 50/60Hz hum filter, and WAV export up to 32MB (`audio-data.ts:8-14`).
   - Gap: Bounded to 5-minute/16MB decoded clips (`audio-studio.ts:93`). Live microphone audio recording with input monitoring is missing; non-destructive region slicing/trimming/pasting and gain envelope adjustment are not implemented.
6. **Addon Store & Marketplace Catalog**:
   - `marketplace/registry.json:1-24`: Minimal registry declaring `catppuccin-mocha` (theme) and `hello-plugin` (plugin).
   - `windows/src-tauri/src/addons.rs:1-82` & `android/java/com/coucou/workspace/AddonRules.java:1-52`: Strictly enforces theme-only installation with SHA-256 verification, forbidding plugins until sandboxed.
   - Gap: Catalog requires live network connectivity to GitHub raw URLs; cannot be browsed offline; no sandboxed runtime (iframe / Web Worker / WASM) for extensible plugins.
7. **Local AI Model Execution & Weight Storage**:
   - `windows/src-tauri/src/local_ai.rs:1-100`: Spawns a loopback-authenticated child process `llama-server.exe` binding `127.0.0.1:0` with `--api-key` and `--alias coucou-local`, expecting `local-ai/model.gguf` or `model-fast.gguf`.
   - Gap: No weight downloader or manifest manager from Hugging Face / Flint Bucket (`https://huggingface.co/buckets/mwalikokelvo/flint-bucket`); no quantization profile selector for DeepSeek-V4.1-Flash; no Android local execution bridge.
8. **Offline-First & Cross-Platform (Windows & Android)**:
   - Android uses `MediaBridge.java` and `PlaybackService.java` for audio intake up to 16MB per track.
   - Windows uses Tauri Rust commands and IndexedDB `coucou-audio`.
   - Network connectivity listeners and persistent offline sync queues are fragmented across components.

---

## 2. Logic Chain

1. **Alignment with Core Philosophy**:
   AnF is an offline-first, private personal workspace. Any architectural extension must:
   - Run 100% locally with zero cloud account lock-in.
   - Gracefully degrade when completely disconnected from the Internet.
   - Avoid bloated dependencies or external server runtimes.
   - Respect the separation of concerns: Windows (Tauri) and Android (Java WebView / Media3) sharing portable TypeScript and Rust contracts.

2. **Pillar Cohesion**:
   - The **Media Hub** unites *Podcasts (AntennaPod)*, *Streaming Audio (Spotube/Spotify/MKR)*, and *Synchronized Lyrics (MKR/LRCLIB)* into one unified audio engine and queue.
   - The **Reader & Knowledge Hub** unites *Substack-style Article Reading/Publishing* with *Offline ZIM Archives (Kiwix)*, backed by the *SQLCipher/FTS5 Vault*.
   - The **Audio Studio** builds upon the existing `audio-studio.ts` and `audio-data.ts`, elevating it from a simple playback/cleaning preview into an Audacity-inspired multi-track recorder, slicer, and gain editor.
   - The **Addon Marketplace** expands the secure `addons.rs` / `AddonRules.java` architecture with an offline catalog manifest cache and an isolated Web Worker sandbox for extensible plugins (Orion Store reference).
   - The **Local AI Module** expands `local_ai.rs` to support DeepSeek-V4.1-Flash GGUF weights, providing automated weight manifests, download validation from Hugging Face / Flint Bucket, and resilient fallback handling.
   - The **Cross-Cutting Offline Strategy** establishes a formal tiering: In-Memory / IndexedDB / SQLCipher / Filesystem with an offline sync queue and network status listener.

---

## 3. Caveats

1. **Read-Only Scope**: This report provides structural analysis, architectural blueprints, schemas, and design specifications. Source code was not altered.
2. **Project Boundaries**: `_core` is strictly ThingsBook. No AnF component should reference `_core`.
3. **Hardware & Resource Limits**:
   - Local AI models (e.g. DeepSeek-V4.1-Flash or small 1.5B/3B GGUF weights) require substantial RAM (minimum 4GB free for Q4_K_M). Graceful degradation to remote API keys or offline notices is mandatory.
   - Large ZIM files (e.g. Wikipedia 100GB) cannot be loaded in memory; random access file reading via HTTP Range or Rust memory-mapped streaming is essential.
4. **Android Native Capabilities**: Background services on modern Android (API 34/35) are governed by strict battery optimizations and foreground service requirements. Android Media3 `PlaybackService` is the required baseline.

---

## 4. Architectural Expansion Specifications (The 8 Pillars)

### Pillar 1: Podcast Parsing, RSS Feed Management, and Playback (AntennaPod Reference)

#### 1.1 Architectural Pattern & Reference
AntennaPod's architecture (`de.danoeh.antennapod.core`) separates feed processing into:
1. `FeedParser`: Extracts channel metadata, episodes, enclosures (`<enclosure url="..." length="..." type="audio/...">`), chapters (`<psc:chapters>`), and iTunes tags (`<itunes:image>`, `<itunes:duration>`).
2. `FeedManager`: Maintains subscription list, refresh scheduling, and auto-download policies.
3. `DownloadService`: Chunked downloading of audio enclosures to local storage with pause/resume support.
4. `PlaybackController`: Episode state tracking (position, played status, playback speed, skip silence).

#### 1.2 Enhanced Schema & Data Model
Extend `windows/src/workspace/podcast-feeds.ts` and `audio-library.ts`:

```typescript
export interface PodcastEpisode {
  id: string;               // GUID or feedUrl#guid
  feedUrl: string;          // Parent feed ID
  title: string;
  summary: string;
  descriptionHtml?: string;
  audioUrl: string;         // Remote enclosure URL
  localAudioPath?: string;  // Local cached path or IndexedDB key
  duration: number;         // Duration in seconds
  published: string;        // ISO string or RFC 2822
  played: boolean;          // Whether episode is completed
  playbackPosition: number; // In seconds
  downloadStatus: 'none' | 'pending' | 'downloading' | 'downloaded' | 'error';
  downloadProgress?: number;// 0.0 to 1.0
  fileSize?: number;        // In bytes
}

export interface PodcastFeed {
  id: string;               // Normalized feed URL
  url: string;
  title: string;
  description: string;
  author?: string;
  image?: string;
  link?: string;
  episodes: PodcastEpisode[];
  updated: number;          // Unix timestamp ms
  autoDownload: boolean;    // Download new episodes automatically
  playbackSpeed?: number;   // Specific feed playback speed override
}
```

#### 1.3 Offline Caching & Enclosure Manager
- **Storage Strategy**:
  - Metadata: Stored in IndexedDB store `podcast_feeds` and `podcast_episodes` (upgrading `coucou-audio` to version 3).
  - Audio Files: On desktop, downloaded to `%APPDATA%/AnF/podcasts/{feed_hash}/{episode_id}.mp3`. On Android, downloaded via `DownloadManager` or `MediaBridge.java` into app-private cache `vault/audio/podcasts/`.
- **Playback Integration**:
  - In `music-hub.ts`, the `podcasts` tab expands into a two-level view:
    1. Feeds Overview: Grid of podcast subscription cards with unplayed count badges.
    2. Feed Detail View: Feed header (artwork, title, author, description, RSS URL) and scrollable episode list with:
       - Direct Play / Enqueue button (routes to unified `audio` player with automatic resume from `episode.playbackPosition`).
       - Download Offline button (triggers background download and converts episode to local playback track).
       - Mark as Played / Unplayed toggle.
  - Progress Persistence: Recorded every 5 seconds during playback into `localStorage` (`anf-podcast-progress:{id}`) and synced back to `podcast_episodes` in IndexedDB.

---

### Pillar 2: Streaming Audio Metadata & Playback (Spotube / Spotify Reference)

#### 2.1 Architectural Pattern & Reference
Spotube decouples **metadata discovery** from **audio streaming**:
- Metadata aggregation: Queries Spotify public endpoints or OpenGraph data for track/album/artist metadata, playlist collections, and high-res cover art.
- Audio Resolution: Resolves playable audio streams via YouTube Music / `innertube` (or Piped/JioSaavn), matching duration and artist cleanly.
- Caching: Stores track metadata in local SQLite/IndexedDB, with optional offline caching of resolved audio chunks.

#### 2.2 Integration Architecture in AnF
Building upon the existing MKR Music integration (`integrations/mkr-music/` and `windows/src/workspace/lyrics-provider.ts`):

```
+-------------------------------------------------------------+
|                        Music Hub UI                         |
|   [ Search Bar ] -> [ All / Spotify / YouTube / Local ]     |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|              Streaming Metadata Resolver Layer              |
| - Search Aggregator (Spotube API / OpenGraph / JioSaavn)    |
| - Track Model: { id, title, artist, album, duration, art }  |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                Audio Stream Resolution Engine               |
| - MKR Innertube / Audio Piped API resolver                  |
| - Returns HTTPS stream URL + expiry TTL + bitrate options   |
+-------------------------------------------------------------+
                              |
               +--------------+--------------+
               v                             v
+-----------------------------+ +-----------------------------+
|    Online Stream Player     | |     Offline Audio Cache     |
| - HTML5 Audio / Android     | | - Cache stream blob to      |
|   Media3 PlaybackService    | |   IndexedDB / app storage   |
| - Dynamic buffer management | | - LRU Eviction Policy       |
+-----------------------------+ +-----------------------------+
               |
               v
+-------------------------------------------------------------+
|            MKR Music Lyrics Provider (LRCLIB)               |
| - Clean promotional tags via cleanTitle()                   |
| - Match line-by-line synced lyrics -> Interactive Scrolling |
+-------------------------------------------------------------+
```

#### 2.3 Offline Caching & Stream Resolution Contract
```typescript
export interface StreamSource {
  streamUrl: string;
  bitrate: number;          // e.g. 128, 256, 320 kbps
  codec: 'aac' | 'opus' | 'mp3';
  expiresAt: number;        // Epoch timestamp
}

export interface StreamResolver {
  search(query: string): Promise<AudioTrack[]>;
  resolveStream(trackId: string): Promise<StreamSource>;
  cacheTrack(track: AudioTrack, blob: Blob): Promise<void>;
  getCachedTrack(trackId: string): Promise<AudioTrack | undefined>;
}
```

---

### Pillar 3: Article Reader & Publishing Workflows (Substack Reference)

#### 3.1 Architectural Pattern & Reference
Substack combines a distraction-free, publication-quality reading experience with an intuitive Markdown/rich-text publishing workflow:
- **Reader**: Elegant typography (customizable serif/sans font, optical kerning, margins, reading progress, estimated reading time, night/sepia modes, pull quotes, image captions, and offline reading queues).
- **Publishing**: Draft management, frontmatter metadata (title, subtitle, author, tags, cover image), scheduled publishing/export, static site generator / newsletter exporter (clean standalone HTML, EPUB, PDF bundle, or RSS feed).

#### 3.2 Reader Module Architecture
Expand `windows/src/workspace/reader.ts` and `reader-data.ts`:
1. **Reading Queue / Inbox**:
   - IndexedDB store `anf_reader_articles`.
   - Ingestion points:
     - Direct URL import (extracting article text via Readability-style HTML parser).
     - Substack / RSS newsletter articles from Pillar 1.
     - Document extraction from PDF / EPUB / Markdown imports in the Vault.
2. **Typography & UI Specifications**:
   - Reading themes: `Soft Dark`, `AMOLED Black`, `Warm Sepia`, `Paper Light`, `Night Amber`.
   - Reading font families: `Serif` (Charter / Merriweather / Georgia), `Sans` (Inter / system-ui), `Mono` (JetBrains Mono / monospace).
   - Rich markup components:
     - Substack-style section breaks (`···`).
     - Pull quotes and highlighted excerpts.
     - Footnote tooltips and bi-directional jumping.
     - Image zoom modals with captions.

#### 3.3 Authoring & Publishing Workflow
Expand `windows/src/workspace/writing.ts`:
```typescript
export interface ArticleDraft {
  id: string;               // 64-hex ID
  title: string;
  subtitle: string;
  slug: string;
  author: string;
  contentMarkdown: string;
  tags: string[];
  coverImageUrl?: string;
  created: number;
  updated: number;
  status: 'draft' | 'review' | 'published';
}

export interface PublishingExporter {
  exportStaticHtml(draft: ArticleDraft): string;
  exportMarkdownBundle(draft: ArticleDraft): Blob; // ZIP containing markdown + local images
  exportRssFeed(drafts: ArticleDraft[]): string;   // Valid RSS 2.0 feed
  exportEpub(draft: ArticleDraft): Promise<Blob>;
}
```

---

### Pillar 4: Offline Knowledge Base and ZIM Archive Reading (Kiwix Desktop Reference)

#### 4.1 Architectural Pattern & Reference
Kiwix Desktop is built around the **openZIM (.zim)** specification:
- An open, compressed container format designed to store entire offline wikis, encyclopedias (Wikipedia), and educational repositories with full text, images, and stylesheets.
- Internal Structure:
  - Header (magic `0x4D495A` / `ZIM`, version, article count, cluster count, URL pointer table offset, title pointer table offset, MIME list offset).
  - MIME type table (mapping integer IDs to content types like `text/html; charset=utf-8`, `image/jpeg`).
  - Directory entries (URL, title, cluster pointer, blob offset).
  - Clusters: Groups of compressed articles (Zstandard or LZMA compression).
  - Full-text search index (Xapian or SQLite FTS5).

#### 4.2 AnF Vault Integration Architecture
Rather than importing massive C++ dependencies, AnF will employ a lightweight, high-performance reader architecture:

```
+-------------------------------------------------------------+
|                      Vault / Knowledge UI                   |
|  - ZIM Library Explorer (Wikipedia, Gutenberg, Wikivoyage)  |
|  - Instant Article Viewer with internal link navigation     |
|  - Full-Text Search Bar across offline ZIM archives         |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|          ZIM Virtual Protocol / Bridge Layer                |
| - Intercepts requests for zim://<archive-id>/<article-path> |
| - Maps internal href/src URLs to on-demand unpacked assets  |
+-------------------------------------------------------------+
                              |
               +--------------+--------------+
               v                             v
+-----------------------------+ +-----------------------------+
|      Desktop (Tauri Rust)   | |      Android (Java/JNI)     |
| - crates/anf-zim or         | | - Streaming RandomAccessFile|
|   Memory-mapped File reader | |   parser in Java/Rust NDK   |
| - Zstandard chunk decompress| | - Intercepts WebView        |
| - SQLite FTS5 indexing      | |   shouldInterceptRequest    |
+-----------------------------+ +-----------------------------+
```

#### 4.3 ZIM Reader Specification (Rust Domain / TypeScript Bridge)
```rust
// Proposed crates/anf-zim/src/lib.rs
pub struct ZimArchive {
    pub uuid: [u8; 16],
    pub article_count: u32,
    pub cluster_count: u32,
    pub main_page_url: Option<String>,
}

impl ZimArchive {
    pub fn open(path: &Path) -> Result<Self, ZimError>;
    pub fn get_article_by_url(&self, url: &str) -> Result<ZimArticle, ZimError>;
    pub fn search_titles(&self, prefix: &str, limit: usize) -> Vec<ZimEntryHeader>;
}

pub struct ZimArticle {
    pub mime_type: String,
    pub data: Vec<u8>,
    pub title: String,
}
```

---

### Pillar 5: Audio Studio Waveform Editing and Audio Recording (Audacity Reference)

#### 5.1 Architectural Pattern & Reference
Audacity provides non-destructive multi-track audio editing:
- High-fidelity microphone capture with real-time level monitoring (dBFS peak & RMS meter).
- Multi-scale waveform visualization (overview waveform, zoomed sample inspection, time ruler).
- Non-destructive region selection, slicing, trimming, cutting, pasting, and crossfading.
- Gain envelopes, normalization, spectral noise removal, and parametric equalization.
- Multi-format audio mixdown and export (WAV, MP3, FLAC, Ogg).

#### 5.2 Audio Studio Module Architecture
Expand `windows/src/workspace/audio-studio.ts` and `audio-data.ts`:

1. **Live Microphone Recording**:
   - Uses `navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000 } })`.
   - Audio input processing via `AudioWorkletNode` for zero-drop PCM buffer capture.
   - Real-time dual-channel VU meters with dBFS readout:
     $$\text{dBFS} = 20 \times \log_{10}(\text{Peak Amplitude})$$
     With color-coded thresholds: Green (< -12 dBFS), Yellow (-12 to -3 dBFS), Red (> -3 dBFS / clipping).

2. **Interactive Zoomable Waveform Canvas**:
   - Time Ruler: Shows timestamps (`mm:ss.ms`) matching horizontal zoom levels.
   - Selection Tool: Click-and-drag cursor selection defining `selectionStart` and `selectionEnd`.
   - Split & Trim Controls:
     - `Split at Cursor`: Breaks audio clip into distinct segments at the playhead.
     - `Trim Selection`: Keeps only the selected region, discarding unselected audio.
     - `Delete Selection`: Removes selected region and joins adjacent edges with optional 5ms anti-click crossfade.

3. **Gain Envelope & Normalization**:
   - Peak Normalization: Scales waveform to user-specified target (e.g. -1.0 dBFS or -0.1 dBFS).
   - Region Gain: Applies localized amplitude multipliers (+/- 12 dB) to quiet or loud passages.
   - Spectral Clean & Hum Filter: Retain and expand existing `spectralClean` and 50/60Hz notch filtering.

4. **Multi-Format Audio Export Engine**:
   - WAV: 16-bit / 24-bit PCM using existing `wav()` in `audio-data.ts`.
   - MP3 / Ogg / Opus: Encoded via WebAssembly encoders (e.g. `lamejs` / `opus-wasm`) or native platform converter (`nativeConvert` in `audio-studio.ts:17`).

---

### Pillar 6: Addon Store / Marketplace Catalog for Offline Extensible Modules (Orion Store Reference)

#### 6.1 Architectural Pattern & Reference
Orion Store (`RookieEnough/Orion-Store`) provides a decentralized, offline-capable package manager:
- Package schema: Manifest specifying id, name, version, type, entrypoint, permissions, and integrity hash.
- Offline catalog: Pre-seeded local catalog manifest allowing discovery and inspection without internet connectivity.
- Sandboxed runtime: Plugins execute within strict isolation barriers, preventing direct disk or network escape.

#### 6.2 Addon Architecture & Sandboxing in AnF
Upgrade `marketplace/` and `windows/src-tauri/src/addons.rs`:

```
+-------------------------------------------------------------+
|                     Addon Store Interface                   |
|  - Category filters: Themes, Plugins, Dictionaries, Effects |
|  - Offline Browse: Reads local manifest cache               |
|  - One-Click Install, Activate, Deactivate, Configure       |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                Addon Host & Sandboxing Runtime              |
|                                                             |
|  +---------------------------+ +--------------------------+ |
|  |       Theme Sandbox       | |      Plugin Sandbox      | |
|  | - CSS Sanitizer           | | - Isolated Web Worker or | |
|  | - Forbid @import          | |   iframe with sandbox    | |
|  | - Restrict url() to data: | | - Capability Token IPC   | |
|  +---------------------------+ +--------------------------+ |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                 Integrity & Manifest Manager                |
| - Verifies SHA-256 checksums before unpacking               |
| - Offline Catalog: bundled catalog-snapshot.json            |
| - Storage: %APPDATA%/AnF/addons/ or Android files/addons/   |
+-------------------------------------------------------------+
```

#### 6.3 Unified Addon Manifest Schema
```json
{
  "$schema": "https://anf.local/schemas/addon-v1.json",
  "id": "audio-equalizer-pro",
  "name": "Audio Equalizer Pro",
  "version": "1.2.0",
  "type": "audio-effect",
  "author": "AnF Community",
  "description": "10-band studio parametric equalizer plugin for Audio Studio.",
  "minAppVersion": "0.1.22",
  "entry": "eq-bundle.js",
  "sha256": "3a7b8c...",
  "permissions": [
    "audio:process"
  ],
  "offlineReady": true
}
```

---

### Pillar 7: Local AI Model Execution & Weight Management (DeepSeek-V4.1-Flash / Hugging Face Flint Bucket Reference)

#### 7.1 Architectural Pattern & Reference
DeepSeek-V4.1-Flash / Hugging Face Flint Bucket integration:
- Hugging Face Bucket: `https://huggingface.co/buckets/mwalikokelvo/flint-bucket`
- DeepSeek Model: `https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017`
- Execution Runtime: Quantized GGUF inference (Q4_K_M, Q5_K_M) via `llama.cpp` (`llama-server`) on Windows and Android NDK or ONNX Runtime.

#### 7.2 Local AI Architecture & Weight Manager
Expand `windows/src-tauri/src/local_ai.rs`:

1. **Model Weight Manifest**:
```json
{
  "models": [
    {
      "id": "deepseek-v4.1-flash-q4",
      "name": "DeepSeek-V4.1-Flash (Q4_K_M)",
      "family": "deepseek",
      "architecture": "llama",
      "quant": "Q4_K_M",
      "sizeBytes": 4294967296,
      "sha256": "9f8e7d...",
      "contextWindow": 8192,
      "minRamGb": 6,
      "bucketUrl": "https://huggingface.co/buckets/mwalikokelvo/flint-bucket/models/deepseek-v4.1-flash-q4.gguf",
      "recommendedFor": ["writing-feedback", "chat", "code-assistance"]
    },
    {
      "id": "qwen2.5-1.5b-fast",
      "name": "Qwen 2.5 1.5B Fast",
      "family": "qwen",
      "quant": "Q4_K_M",
      "sizeBytes": 980000000,
      "sha256": "1a2b3c...",
      "contextWindow": 4096,
      "minRamGb": 2,
      "bucketUrl": "https://huggingface.co/buckets/mwalikokelvo/flint-bucket/models/qwen2.5-1.5b-q4.gguf",
      "recommendedFor": ["quick-grammar", "mobile-devices"]
    }
  ]
}
```

2. **Resumable Chunked Downloader**:
   - Streams from Hugging Face Flint Bucket using HTTP Range requests (`Range: bytes=START-END`).
   - Writes directly to `.part` file with SHA-256 incremental hashing.
   - Atomically renames upon full download verification.
   - Emits download progress events (`download-progress: { modelId, received, total, speed }`) to UI.

3. **Inference Execution & Graceful Fallback**:
   - Host checks available system memory before launching model.
   - If RAM is insufficient (< 4GB for DeepSeek), UI displays an explicit warning and recommends a smaller model profile (`model-fast.gguf`).
   - Standard OpenAI-compatible `/v1/chat/completions` API abstraction ensures existing assistant and writing revision UI components operate unchanged regardless of whether the model is local GGUF or a configured remote provider.

---

### Pillar 8: Cross-Cutting Offline-First & Cross-Platform (Windows & Android)

#### 8.1 Tiered Storage Strategy
Establish explicit persistence boundaries across all modules:

| Storage Tier | Technology | Purpose | Platform Parity |
|---|---|---|---|
| **Tier 1: Encrypted Relational & FTS** | SQLCipher via `crates/anf-vault` | Projects, notes, search index, sync revisions, versions | Windows: Tauri Rust; Android: `VaultRepository` |
| **Tier 2: Browser Local Cache** | IndexedDB (`coucou-audio`, `anf-reader`) | Audio library metadata, podcast feeds, article reading queue | Unified in WebView / Web UI |
| **Tier 3: Binary Media Assets** | Local Filesystem Directories | Downloaded podcast MP3s, stream audio cache, ZIM archives, AI GGUF weights | Windows: `%APPDATA%/AnF/`; Android: `context.filesDir` |
| **Tier 4: Ephemeral Session State** | `localStorage` / In-Memory | Active player position, UI theme selection, reading scroll position | Unified in Web UI |

#### 8.2 Network Connectivity Listener & Offline Sync Queue
```typescript
export interface OfflineSyncQueue {
  enqueueMutation(mutation: {
    id: string;
    action: string;
    payload: unknown;
    timestamp: number;
  }): Promise<void>;
  
  processQueue(): Promise<void>;
}

export function initializeConnectivityListener(onStatusChange: (online: boolean) => void) {
  window.addEventListener('online', () => onStatusChange(true));
  window.addEventListener('offline', () => onStatusChange(false));
  onStatusChange(navigator.onLine);
}
```
- **Zero-Connectivity Graceful Degradation**:
  - UI components display subtle status pills (`Offline Mode · Local Storage Active`).
  - Remote calls (e.g. LRCLIB lyrics lookup, feed refreshes) return immediately with fallback cached data or clear offline notices, never throwing unhandled errors or hanging.

---

## 5. Verification Method

To independently verify the observations, architecture, and specifications in this report:

1. **Verify Existing Workspace Structure & Build Capabilities**:
   - Run: `cd C:\Users\mwali\.gemini\antigravity\scratch\AnF\windows && npm exec tsc -- --noEmit` to verify TypeScript contracts across `music-hub.ts`, `podcast-feeds.ts`, `lyrics-provider.ts`, and `audio-studio.ts`.
   - Run: `cargo test --manifest-path C:\Users\mwali\.gemini\antigravity\scratch\AnF\crates\anf-vault\Cargo.toml` to verify vault schema v1, project validation, and sync revision hashing.
2. **Verify Media & Music Hub Integration**:
   - Inspect `windows/src/workspace/music-hub.ts:55-57` and `windows/src/workspace/lyrics-provider.ts:57-128` to confirm LRCLIB synced lyrics integration and title cleanup rules.
   - Inspect `android/java/com/coucou/workspace/MediaBridge.java:89` to verify existing native remote audio playback handling.
3. **Verify Addons Marketplace Integrity Rules**:
   - Inspect `windows/src-tauri/src/addons.rs:21-28` and `android/java/com/coucou/workspace/AddonRules.java:30-43` to confirm the mirrored CSS validation rules (rejecting `@import` and non-data URLs).
4. **Invalidation Conditions**:
   - Any dependency on `_core` invalidates the AnF architectural boundary.
   - Any model requiring mandatory cloud telemetry or unauthenticated remote endpoints invalidates the offline-first privacy guarantee.

---

## 6. Conclusion

AnF possesses a robust foundation across its Windows Tauri and Android WebView hosts. The 8 architectural expansion pillars specified above directly realize the capabilities demonstrated by the reference applications (AntennaPod, Spotube/Spotify, Substack, Kiwix Desktop, Audacity, Orion Store, and DeepSeek-V4.1-Flash on Hugging Face Flint Bucket). Each pillar preserves AnF's strict offline-first guarantees, maintains clean separation of concerns, and builds forward from the verified codebase state.
