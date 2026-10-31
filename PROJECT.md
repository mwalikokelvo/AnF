# Project: AnF Offline-First Workspace Expansion

## Architecture
AnF is an offline-first, private personal workspace targeting Windows (Tauri 2 with Rust backend and TypeScript/DOM frontend) and Android (native Java host with Media3/SQLCipher and esbuild-bundled WebView), sharing portable TypeScript domain modules and Rust crates.

### Module Boundaries & Data Flow
1. **Media & Music Hub** (`windows/src/workspace/music-hub.ts`):
   - Audio playback engine (HTML5 Audio on desktop, Media3 on Android).
   - MKR Music synchronized lyrics engine (`lyrics.ts`, `lyrics-provider.ts`) querying LRCLIB with 7-stage offline cache cascade.
   - AntennaPod podcast parsing & subscription management (`podcast-feeds.ts`).
   - Spotube-style streaming audio resolution and offline audio blob caching (`audio-library.ts`).
2. **Reader & Publishing Desk** (`windows/src/workspace/reader.ts`, `writing.ts`):
   - Substack-style article reading queue with distraction-free typography and themes.
   - Rich Markdown authoring with frontmatter metadata.
   - Publishing and export pipeline (clean HTML, Markdown ZIP bundle, RSS 2.0).
3. **Vault & Knowledge Base** (`crates/anf-vault/`, `windows/src/workspace/vault-panel.ts`, `zim-reader.ts`):
   - Kiwix-style OpenZIM archive reader with virtual `zim://` protocol routing.
   - SQLCipher encrypted note storage and SQLite FTS5 search indexing.
4. **Audio Studio** (`windows/src/workspace/audio-studio.ts`, `shared/audio/`):
   - Audacity-inspired multi-track live microphone recording with AudioWorklet and dual-channel dBFS VU meters.
   - Interactive zoomable waveform canvas with time ruler and region selection.
   - Non-destructive split, trim, delete operations with anti-click crossfading.
5. **Addons Marketplace & Local AI** (`marketplace/`, `windows/src/workspace/addons.ts`, `windows/src-tauri/src/local_ai.rs`):
   - Orion Store addon manifest schema, pre-bundled offline catalog cache, and sandboxed execution.
   - DeepSeek-V4.1-Flash and fast model weight manifests (Hugging Face Flint Bucket).
   - Resumable chunked weight downloader and OpenAI-compatible `/v1/chat/completions` API abstraction.
6. **Cross-Cutting Offline-First Core** (`windows/src/workspace/offline-sync.ts`):
   - 4-tier storage hierarchy: SQLCipher (Tier 1), IndexedDB (Tier 2), Filesystem (Tier 3), Session State (Tier 4).
   - Global network connectivity listener, offline mutation queue, and graceful zero-connectivity fallback.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | MKR Music Audio Player Engine | Complete audio playback controls (play, pause, seek, stop), playback state machine, audio sink, queue management, volume/speed/sleep-timer | M1 | ORIGINAL_REQUEST §R1 |
| 2 | LRCLIB Synced Lyrics Integration | Synchronized lyrics retrieval, LRC parsing, binary search active line tracking, click-to-seek, auto-scroll, 7-stage offline cache cascade | M1 | ORIGINAL_REQUEST §R1 |
| 3 | AntennaPod Podcast RSS & Playback | RSS feed fetching & parsing, subscription management, episode enclosure downloading/caching, progress tracking, episode playback | M1 | ORIGINAL_REQUEST §R2 |
| 4 | Spotube Streaming Audio Integration | Decoupled metadata search/retrieval, stream URL resolution, offline caching of audio blobs and metadata | M1 | ORIGINAL_REQUEST §R2 |
| 5 | Substack Article Reader & Publishing | Reading queue/inbox, distraction-free typography & theme options, article authoring with frontmatter, publishing/export pipeline (HTML, ZIP bundle, RSS) | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Kiwix ZIM Archive Reading & Knowledge | OpenZIM archive reader, virtual `zim://` protocol asset resolution, article extraction, FTS5 search indexing in Vault | M3 | ORIGINAL_REQUEST §R2 |
| 7 | Audacity Audio Studio Waveform Editing | Live microphone recording with AudioWorklet & dBFS VU meters, zoomable waveform canvas with time ruler, split/trim/delete with crossfading, export | M4 | ORIGINAL_REQUEST §R2 |
| 8 | Orion Store Addon Marketplace | Unified addon manifest schema, pre-bundled offline catalog cache, isolated Web Worker / iframe sandbox with capability tokens | M5 | ORIGINAL_REQUEST §R2 |
| 9 | Local AI Model Execution & Weights | DeepSeek-V4.1-Flash weight manifest, resumable chunked weight downloader (HF Flint Bucket), memory pre-flight checks, `/v1/chat/completions` abstraction | M5 | ORIGINAL_REQUEST §R2 |
| 10 | Cross-Cutting Offline-First & Platform | 4-tier storage hierarchy enforcement, global network connectivity listener, offline sync mutation queue, zero-connectivity degradation | M6 | ORIGINAL_REQUEST §R3 |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Media & Music Hub Integration | Features 1, 2, 3, 4: MKR Music player engine, LRCLIB synced lyrics, AntennaPod podcasts, Spotube streaming metadata & audio caching | none | COMPLETED |
| M2 | Reader & Publishing Desk | Feature 5: Substack article reading queue, typography themes, draft authoring, multi-format publishing/export | none | COMPLETED |
| M3 | Vault & Kiwix ZIM Knowledge | Feature 6: OpenZIM archive parser, `zim://` virtual protocol, article viewer, FTS5 vault integration | none | COMPLETED |
| M4 | Audacity Audio Studio | Feature 7: Live microphone capture, real-time dBFS meters, waveform canvas, split/trim/delete crossfade, export | none | COMPLETED |
| M5 | Addon Store & Local AI Weights | Features 8, 9: Orion Store offline addon catalog & sandbox, DeepSeek/Flint bucket weight manager & AI API | none | COMPLETED |
| M6 | Offline-First & Platform Hardening | Feature 10: 4-tier storage hierarchy, global connectivity listener, offline mutation queue, graceful degradation | M1, M2, M3, M4, M5 | COMPLETED |
| M7 | E2E Test Suite Pass & Adversarial Hardening | Phase 1: Pass 100% of E2E tests (Tiers 1-4). Phase 2: Tier 5 adversarial coverage hardening | M6, TEST_READY.md | COMPLETED |

---

## Interface Contracts

### Media Hub ↔ Lyrics Provider (`lyrics-provider.ts` ↔ `music-hub.ts`)
```typescript
export interface LyricLine {
  time: number; // millisecond timestamp
  text: string;
}

export interface ParsedLyrics {
  lines: LyricLine[];
  offsetMs: number;
  syncType: 'LINE_SYNCED' | 'WORD_SYNCED' | 'UNSYNCED';
}

export interface LyricsProvider {
  fetchLyrics(track: { title: string; artist: string; duration: number }): Promise<ParsedLyrics | null>;
  cleanTitle(title: string): string;
  primaryArtist(artist: string): string;
  getCachedLyrics(trackId: string): Promise<ParsedLyrics | null>;
}
```

### Media Hub ↔ Podcast Enclosure Manager (`podcast-feeds.ts` ↔ `audio-library.ts`)
```typescript
export interface PodcastEpisode {
  id: string;
  feedUrl: string;
  title: string;
  summary: string;
  audioUrl: string;
  localAudioPath?: string;
  duration: number;
  published: string;
  played: boolean;
  playbackPosition: number;
  downloadStatus: 'none' | 'downloading' | 'downloaded' | 'error';
}

export interface PodcastManager {
  subscribe(feedUrl: string): Promise<PodcastFeed>;
  refreshFeeds(): Promise<void>;
  downloadEpisode(episodeId: string): Promise<void>;
  updatePlaybackPosition(episodeId: string, position: number): Promise<void>;
}
```

### Reader ↔ Publishing Exporter (`reader.ts` ↔ `writing.ts`)
```typescript
export interface ArticleDraft {
  id: string;
  title: string;
  subtitle: string;
  slug: string;
  author: string;
  contentMarkdown: string;
  tags: string[];
  created: number;
  updated: number;
}

export interface PublishingExporter {
  exportStaticHtml(draft: ArticleDraft): string;
  exportMarkdownBundle(draft: ArticleDraft): Blob;
  exportRssFeed(drafts: ArticleDraft[]): string;
}
```

### Vault ↔ ZIM Reader (`anf-vault` ↔ `zim-reader.ts`)
```typescript
export interface ZimEntryHeader {
  url: string;
  title: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ZimReader {
  openArchive(archivePath: string): Promise<{ uuid: string; articleCount: number; mainPageUrl?: string }>;
  readArticle(url: string): Promise<{ mimeType: string; data: Uint8Array; title: string }>;
  searchTitles(query: string, limit: number): Promise<ZimEntryHeader[]>;
}
```

### Audio Studio ↔ Audio Engine (`audio-studio.ts` ↔ `audio-data.ts`)
```typescript
export interface AudioRegion {
  startSec: number;
  endSec: number;
}

export interface StudioAudioEngine {
  startRecording(): Promise<void>;
  stopRecording(): Promise<AudioBuffer>;
  getLiveMeterLevels(): { peakDbfs: number; rmsDbfs: number; isClipping: boolean };
  split(buffer: AudioBuffer, atSec: number): [AudioBuffer, AudioBuffer];
  trim(buffer: AudioBuffer, region: AudioRegion): AudioBuffer;
  deleteRegion(buffer: AudioBuffer, region: AudioRegion, crossfadeMs: number): AudioBuffer;
  exportWav(buffer: AudioBuffer, bitDepth: 16 | 24): Blob;
}
```

### Addon Store ↔ Host Runtime (`addons.ts` ↔ `addons.rs`)
```typescript
export interface AddonManifest {
  id: string;
  name: string;
  version: string;
  type: 'theme' | 'plugin' | 'dictionary' | 'audio-effect';
  entry: string;
  sha256: string;
  offlineReady: boolean;
}

export interface AddonHost {
  loadCatalogSnapshot(): Promise<AddonManifest[]>;
  installAddon(manifest: AddonManifest, packageBlob: Blob): Promise<void>;
  verifyIntegrity(data: Uint8Array, expectedSha256: string): boolean;
}
```

### Local AI ↔ Model Manager (`local-ai-manager.ts` ↔ `local_ai.rs`)
```typescript
export interface ModelWeightProfile {
  id: string;
  name: string;
  quant: string;
  sizeBytes: number;
  sha256: string;
  minRamGb: number;
  bucketUrl: string;
}

export interface LocalAiManager {
  listAvailableProfiles(): ModelWeightProfile[];
  downloadWeights(profileId: string, onProgress: (pct: number) => void): Promise<void>;
  checkSystemMemory(): { totalRamGb: number; availableRamGb: number; isSufficient: boolean };
  chatCompletion(request: { messages: Array<{ role: string; content: string }> }): Promise<string>;
}
```

---

## Code Layout
- `windows/src/workspace/`: TypeScript UI modules for Windows desktop and shared WebView.
  - `music-hub.ts`, `music-hub.css`: Music Hub local player, playlist, and dock.
  - `lyrics.ts`, `lyrics-provider.ts`: LRC parsing, LRCLIB integration, click-to-seek, offline cache.
  - `podcast-feeds.ts`: RSS parsing, subscription management, episode enclosure downloads.
  - `reader.ts`, `reader-data.ts`, `reader.css`: Article reader and reading inbox.
  - `writing.ts`, `live-editor.ts`: Markdown editor and Substack-style publishing pipeline.
  - `audio-studio.ts`, `audio-studio.css`, `audio-data.ts`: Waveform visualization and editing.
  - `zim-reader.ts`: OpenZIM reader interface.
  - `addons.ts`: Addon marketplace UI and offline catalog browser.
  - `local-ai-manager.ts`: Weight manager and local AI execution.
  - `offline-sync.ts`, `connectivity.ts`: Offline queue and network listener.
- `shared/`: Platform-neutral TypeScript domain logic.
  - `shared/audio/queue.ts`: Audio queue reconciliation.
  - `shared/audio/denoise.ts`: Spectral clean and noise filtering.
  - `shared/domain/`: Domain interfaces.
- `crates/anf-vault/`: Rust domain crate for encrypted vault, FTS5, and revision hashing.
- `windows/src-tauri/`: Tauri 2 Rust desktop host.
  - `src/main.rs`, `src/lib.rs`, `src/addons.rs`, `src/local_ai.rs`.
- `android/`: Android native host.
  - `android/java/com/coucou/workspace/`: Java host, `MediaBridge.java`, `PlaybackService.java`, `VaultRepository.java`.
  - `scripts/build-android.mjs`: esbuild bundling of web assets.
- `marketplace/`: Addon registry and offline snapshots.
  - `marketplace/registry.json`, `marketplace/catalog-snapshot.json`.
- `tests/`: Automated unit and E2E test suites.
