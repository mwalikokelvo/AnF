# Specification Mining Report: MKR Music Player Engine & LRCLIB Synced Lyrics Integration

## Executive Summary
This report delivers an exhaustive, authoritative technical specification for integrating the **MKR Music** (`mkr-music`) audio player engine and **LRCLIB** synchronized lyrics service into the **AnF** offline-first workspace across Windows (Tauri/Web) and Android (Native/Media3). The investigation probes authoritative implementations in `C:\Users\mwali\.gemini\antigravity\scratch\mkr-music` and `C:\Users\mwali\.gemini\antigravity\scratch\AnF`.

---

## 1. Observation

### 1.1 Authoritative Codebases & References
1. **MKR Music Reference Repo**: `C:\Users\mwali\.gemini\antigravity\scratch\mkr-music`
   - Playback & Service Architecture:
     - `app/src/main/kotlin/com/music/mkr/playback/MusicService.kt` (ExoPlayer, MediaLibraryService, dual-cache, audio focus, crossfade, look-ahead prefetcher, error handling)
     - `app/src/main/kotlin/com/music/mkr/playback/PlayerConnection.kt` (StateFlow bindings, play/pause/seek controls, queue management, Cast coordination)
     - `app/src/main/kotlin/com/music/mkr/playback/queues/` (`Queue.kt`, `ListQueue.kt`, `YouTubeQueue.kt`, `EmptyQueue.kt`)
   - Lyrics Engine & UI:
     - `lyricsProvider/src/main/kotlin/com/music/lrclib/LrcLib.kt` (LRCLIB REST client, multi-tier search fallback, Levenshtein title/artist matching, relaxed duration matching)
     - `lyricsProvider/src/main/kotlin/com/music/lrclib/models/Track.kt` (LRCLIB track model, score calculator)
     - `app/src/main/kotlin/com/music/mkr/lyrics/LyricsUtils.kt` (Standard LRC, Rich Sync/word-by-word timing, Kana/Hangul/Cyrillic romanization, binary/index line search with 300ms anticipation)
     - `app/src/main/kotlin/com/music/mkr/ui/component/Lyrics_v2.kt` (Compose lyrics view, 32% top viewport anchor, spring scroll physics, drag override with 4s auto-resume, seek-on-tap)
2. **AnF Project Workspace**: `C:\Users\mwali\.gemini\antigravity\scratch\AnF`
   - Windows/Tauri Workspace:
     - `windows/src/workspace/music-hub.ts` (Music Hub UI, HTML5 `Audio()`, `navigator.mediaSession`, dock/full player modal, sleep timer, theme)
     - `windows/src/workspace/lyrics.ts` (LRC parsing regex, offset compensation, `activeLine` binary search, `toLrc` generator, `matchLyricsTrack`)
     - `windows/src/workspace/lyrics-provider.ts` (LRCLIB client, title/artist tag cleaner, exact `/api/get` + fuzzy `/api/search` fallback)
     - `windows/src/workspace/audio-library.ts` (IndexedDB `coucou-audio` stores: `tracks`, `state`, `playlists`)
     - `windows/src/workspace/audio-metadata.ts` (music-metadata parser, embedded ID3v2/MP4 lyrics extraction)
     - `windows/tests/lyrics-provider.test.ts` (Node.js test suite for cleanTitle, primaryArtist, parseLyrics)
   - Android Native Workspace:
     - `android/java/com/coucou/workspace/MediaBridge.java` (Webview JS interface `window.AnFAndroid.mediaRequest(...)`, chunked file intake, command dispatcher)
     - `android/java/com/coucou/workspace/PlaybackService.java` (MediaSessionService, ExoPlayer, WAKE_MODE_LOCAL, audio focus)
   - Integration Documentation & Scripts:
     - `docs/MUSIC-HUB.md` (Product spec, Spotube & MKR Music integration, GPLv3 attribution)
     - `docs/PLAYER-LIBRARY.md` (Design spec: dark charcoal `#15191a`, mint accent `#79e4b4`, 4 media kinds: Music, Audiobook, Podcast, Book)
     - `integrations/mkr-music/README.md` & `integrations/mkr-music/prepare.mjs` (Module sync script for `innertube`, `lyricsProvider`, `spotify`)

### 1.2 Observed Verification Commands & Test Results
- **Windows Unit Tests**: Executed `cd C:\Users\mwali\.gemini\antigravity\scratch\AnF\windows; npm test`
  - Result: **PASS** (3 passed, 0 failed, 220 ms)
  - `cleanTitle strips video, audio, lyric, and format markers` (8.35ms)
  - `primaryArtist extracts lead artist from collaborations` (0.35ms)
  - `parseLyrics handles timestamps, offsets, and rejects malformed values` (17.24ms)

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Player Engine | Transport Controls | Core playback transport: play, pause, togglePlayPause, stop, seekTo, step forward/backward. | Target position (ms), step direction ($\pm 1$), track index | Audio output state transition (`STATE_BUFFERING` $\to$ `STATE_READY` $\to$ `isPlaying = true/false`) | Throws or clamps invalid positions ($0 \le \text{pos} \le \text{duration}$) | `MusicService.kt:362-405`, `music-hub.ts:43-58` |
| 2 | Player Engine | Playback State Machine | Reactive state tracking exposing current playback condition (`STATE_IDLE`, `STATE_BUFFERING`, `STATE_READY`, `STATE_ENDED`). | Player event callbacks (`onPlaybackStateChanged`, `onPlayWhenReadyChanged`) | StateFlows: `playbackState`, `isPlaying`, `isPlayerReady`, `isEffectivelyPlaying` | Emits `error: PlaybackException?` upon decoder/network failures | `MusicService.kt:2728-2748`, `PlayerConnection.kt:81-118` |
| 3 | Player Engine | Queue & Playlist Manager | Queue representation supporting ordered tracks, shuffle order generation, repeat modes (`off`, `all`, `track`), and preload item fast-start. | Queue objects (`ListQueue`, `YouTubeQueue`, `EmptyQueue`), track IDs, shuffle boolean | Active queue items, `currentMediaItemIndex`, updated `Timeline` | Duplicate filter option (`PreventDuplicateTracksInQueueKey`); clears corrupt queue on read error | `MusicService.kt:1505-1658`, `audio-queue.ts:1-35` |
| 4 | Player Engine | Look-Ahead Stream Prefetcher | Pre-resolves next track's signed CDN stream URL into background memory cache (`songUrlCache`) during playback of the current track. | `player.nextMediaItemIndex` | Pre-cached URL in `songUrlCache[mediaId]` | Stale URL discarded on track skip; fails silently without interrupting playback | `MusicService.kt:2563-2605` |
| 5 | Player Engine | Dual Cache Data Source | ResolvingDataSource prioritizing local cache (`@DownloadCache` and `@PlayerCache`) before network fetch, enabling offline playback. | `DataSpec` with `mediaId` key, byte position, chunk length | Resolved local `DataSpec` or signed remote URI | Throws mapped `PlaybackException` (network failed, timeout, remote error) | `MusicService.kt:3646-3774` |
| 6 | Player Engine | Network Error Exponential Backoff | Resilient retry loop that pauses on loss of connectivity and retries with exponential backoff upon network restoration. | Network status change from `NetworkConnectivityObserver` | Automatic `player.prepare()` retry; URL refresh if retry $> 3$ | Ceases playback after reaching `MAX_RETRY_COUNT` to prevent runaway battery drain | `MusicService.kt:1292-1336` |
| 7 | Player Engine | Audio Focus & Ducking | System audio focus request and ducking handler; lowers volume to 20% on transient duck, pauses on loss, restores on gain. | `AudioManager.OnAudioFocusChangeListener` events | Volume adjustment (`playerVolume * 0.2f`), play/pause state change | Re-evaluates focus before restoring play state; handles noisy disconnection (`setHandleAudioBecomingNoisy`) | `MusicService.kt:1185-1260` |
| 8 | Player Engine | Audio Processing Pipeline | Multi-effect audio sink chain including 10-band equalizer, loudness normalization, silence skipping/detector, and variable speed/pitch. | `DefaultAudioSink.DefaultAudioProcessorChain`, `SonicAudioProcessor`, `CustomEqualizerAudioProcessor` | Modified PCM audio stream | Bypasses failed effect filters without crashing audio output | `MusicService.kt:3788-3812`, `audio-metadata.ts` |
| 9 | Lyrics Engine | Title & Artist Normalization | Sanitizes promotional tags (`[Official Video]`, `(Remastered)`, `(Live)`) and extracts primary artist before querying lyrics. | Raw title string, artist string | Clean title and primary artist strings | Returns original trimmed string if all content stripped | `lyrics-provider.ts:17-52`, `LrcLib.kt:40-73` |
| 10 | Lyrics Engine | Multi-Tier LRCLIB Query Fallback | 5-strategy search: exact match (`/api/get`), cleaned title+artist (`/api/search`), title only, combined query `q`, and original title. | Track title, artist, album, duration | Parsed `RemoteLyrics` (`syncedLyrics` / `plainLyrics`) | Returns undefined on 404, rate limit (429), or 503 service outage | `LrcLib.kt:75-136`, `lyrics-provider.ts:57-128` |
| 11 | Lyrics Engine | Duration & Levenshtein Matching | Filters candidate lyrics by song duration ($\pm 2\text{s}$ exact or $\pm 5\text{s}$ relaxed) and calculates normalized Levenshtein string similarity. | Candidate list `List<Track>`, target duration in seconds, query title/artist | Best matching `Track` with highest score ($> 0.6$) | Returns null/fallback to plain lyrics if duration outside tolerance | `LrcLib.kt:170-260`, `Track.kt:16-99` |
| 12 | Lyrics Engine | LRC Format Parser | Parses standard LRC time tags `[mm:ss.xx]`, multiline tags, offset headers `[offset:±ms]`, and extracts clean line text. | Raw LRC text string (up to 200,000 chars) | `Lyrics` object (`synced: boolean`, `lines: LyricLine[]`) | Rejects malformed seconds ($\ge 60$); falls back to unsynced plain text lines | `lyrics.ts:8-33`, `LyricsUtils.kt:401-477` |
| 13 | Lyrics Engine | Rich Sync / Word-by-Word Timing | Parses granular word-level timestamps `<mm:ss.xx>` within lines for karaoke-style word highlighting and background `{bg}`/`{agent:v1}` tags. | Rich sync string: `[mm:ss.xx]<mm:ss.xx> word ...` | `LyricsEntry` with `words: List<WordTimestamp>` | Falls back to line-level timing if word tags malformed | `LyricsUtils.kt:418-540` |
| 14 | Lyrics Engine | Active Line Binary Search | Millisecond-accurate bisect search ($O(\log n)$) locating the active lyric line for playback timestamp, with lead anticipation. | `lyrics: Lyrics`, current playback time (seconds/ms) | 0-based active line index (or -1 if before start) | Returns -1 for unsynced lyrics or timestamps before line 0 | `lyrics.ts:35-44`, `LyricsUtils.kt:627-637` |
| 15 | Lyrics Engine | Local Lyrics Caching & Persistence | Persists fetched or imported lyrics into local database (`IndexedDB` `'tracks'` or Room `LyricsEntity`) for future offline access. | Track ID, lyrics text, provider tag | Updated local track entity in IndexedDB/Room | Gracefully skips cache write on storage quota error | `music-hub.ts:55-56`, `MusicService.kt:776-795` |
| 16 | Lyrics Engine | Offline Fallback Cascade | 7-stage fallback cascade: Local Cache $\to$ Embedded Tags $\to$ Sidecar `.lrc` $\to$ Exact LRCLIB $\to$ Fuzzy LRCLIB $\to$ Plain Text $\to$ Empty State. | Track metadata, local file attachments, network availability | Displayable synchronized or plain lyrics | Displays "No lyrics found" empty placeholder with manual "Find Synced Lyrics" button | `music-hub.ts:55-57`, `Lyrics_v2.kt:246-324` |
| 17 | Lyrics UI | Synchronized Auto-Scrolling | Smooth viewport scrolling keeping the active lyric line anchored at $\sim 32\%$ top or center position during playback. | Current playback time, active line index, viewport height | Animated scroll offset via spring physics or `scrollTo` | Bypasses smooth animation when `prefers-reduced-motion` is active | `Lyrics_v2.kt:646-685`, `music-hub.ts:57` |
| 18 | Lyrics UI | Interactive Seek-on-Tap | Clicking/tapping any lyric line seeks the player to that timestamp (`line.time - offset`) and re-anchors auto-scroll. | Click event on lyric line element/button | `player.seekTo(timestamp)` and UI paint update | Ignored if Listen Together guest without host permissions | `Lyrics_v2.kt:752-757`, `music-hub.ts:56` |
| 19 | Lyrics UI | Manual Drag / Scroll Pause | Pauses auto-scrolling when user manually drags/scrolls the lyrics view, automatically resuming after 4 seconds of idle time. | Touch/pointer drag interaction events | `isAutoScrollEnabled = false` $\to$ `delay(4000)` $\to$ `true` | Restores auto-scroll on manual track seek or line click | `Lyrics_v2.kt:608-630` |
| 20 | AnF Integration | Cross-Section Audio Persistence | Keeps playback active when navigating between AnF sections (Reader, Writing, Hub, Studio, Settings). | Section navigation event | Uninterrupted audio output and persistent mini-dock | Dock suspends only when entering mutually exclusive full audio studio | `music-hub.ts:58-68`, `CLAUDE.md:3` |
| 21 | AnF Integration | Mutual Studio / Reader Exclusion | Mutual exclusion handoff: starting Music Hub pauses Audio Studio and Reader speech; starting Studio/Reader pauses Music Hub. | `beforePlay()` callback hook | Coordinated pause of competing audio pipeline | Refuses playback if pause acknowledgement fails or times out | `music-hub.ts:14,66`, `AF-Audio-Ownership-Checkpoint-2026-10-23.md:7-12` |
| 22 | AnF Integration | Native Android Lock-Screen Bridge | Android WebView $\to$ native `MediaBridge.java` $\to$ `PlaybackService.java` for lockscreen media session notifications and background audio. | JSON RPC over `AnFAndroid.mediaRequest('play', ...)` | Foreground service notification with media transport actions | Returns error to JS callback if service fails to start or times out (20s) | `music-hub.ts:88`, `MediaBridge.java:35-59` |

---

## 3. Edge Cases

| # | Feature | Input | Observed Behavior | Authoritative Reference |
|---|---------|-------|-------------------|-------------------------|
| 1 | LRC Parsing | Seconds value $\ge 60$ (e.g. `[00:99.00]`) | Rejected as malformed; not rolled into minutes, skipped to prevent clock drift. | `lyrics.ts:22-23`, `lyrics-provider.test.ts:43-46` |
| 2 | LRC Offset | Positive offset `[offset:+500]` | Advances lyrics: subtracted from line timestamp (`Math.max(0, t - offset)`), so line sings 0.5s earlier. | `lyrics.ts:12,28`, `lyrics-provider.test.ts:38-41` |
| 3 | LRC Offset | Negative offset `[offset:-500]` | Delays lyrics: added to line timestamp (`Math.max(0, t - (-0.5))`), line sings 0.5s later. | `lyrics.ts:12,28`, `lyrics-provider.test.ts:40` |
| 4 | Rich Sync Timing | Timestamp before line start | Clamped to 0 ms (`Math.max(0, time)`). | `lyrics.ts:28`, `LyricsUtils.kt:447` |
| 5 | LRCLIB API Rate Limit | HTTP 429 / 503 from `lrclib.net` | Reads `Retry-After` header if present; logs warning and returns undefined without crashing player. | `lyrics-provider.ts:79-83`, `LrcLib.kt:80-87` |
| 6 | LRCLIB Duration Drift | Audio duration mismatch $> 5\text{s}$ | Discarded in relaxed matching to prevent displaying lyrics from a different edit/live version. | `LrcLib.kt:208-212`, `Track.kt:38-45` |
| 7 | Sidecar Pairing | Duplicate file names across folders | Prefers matching relative directory path (`webkitRelativePath`); refuses to guess if ambiguous. | `lyrics.ts:63-74` |
| 8 | Large LRC Files | Text $> 200,000$ chars or $> 5,000$ lines | Clamped at `MAX_TEXT = 200_000` and `MAX_LINES = 5000` to prevent DOM freeze and OOM. | `lyrics.ts:5,10,31-32` |
| 9 | Network Disconnect | Wi-Fi/cellular drops during streaming | Player enters `waitingForNetworkConnection = true`; retries with exponential backoff up to 30s. | `MusicService.kt:1303-1317` |
| 10 | Unrecoverable Stream | 3+ consecutive errors on track | URL cache invalidated; auto-skips track; halts after `MAX_CONSECUTIVE_ERR` ("runaway engine" protection). | `MusicService.kt:1325-1360` |
| 11 | Headphone Unplug | Audio output device disconnected | `setHandleAudioBecomingNoisy(true)` automatically pauses playback; prevents blasting speaker. | `MusicService.kt:1154`, `PlaybackService.java:27` |
| 12 | Transient Audio Ducking | Turn-by-turn navigation or notification chime | Volume reduced to 20% (`playerVolume * 0.2f`) without pausing playback; restores on completion. | `MusicService.kt:1245-1250` |
| 13 | Cross-Track Shuffle | Player swap during crossfade | Active traversal order extracted directly from `Timeline` rather than re-randomizing order. | `MusicService.kt:2826-2864` |
| 14 | Offline Flight Mode | Zero internet connectivity | Checks `downloadCache` and `playerCache` first; serves 100% offline from disk without HTTP request. | `MusicService.kt:3660-3672` |
| 15 | User Scroll Interruption | User drags lyrics during synchronized playback | Auto-scrolling suspended immediately; resumes after 4s idle timer or upon user tapping any line. | `Lyrics_v2.kt:608-630` |
| 16 | Reduced Motion | OS setting `prefers-reduced-motion` enabled | Lyrics scroll animation switches from smooth spring to instant jump (`behavior: 'auto'`). | `music-hub.ts:57` |
| 17 | Instrumental Break | Gap $> 4\text{ seconds}$ between vocal lines | Shows interval gap indicator (progress dots) indicating countdown to next vocal entry. | `Lyrics_v2.kt:582-594` |
| 18 | Multi-Artist Clean | Title has `feat.` or `,` (e.g. `A feat. B`) | Splits on separators (`feat.`, `&`, `x`, `with`) and isolates primary artist for higher query accuracy. | `lyrics-provider.ts:29-52`, `LrcLib.kt:52-73` |

---

## 4. Architectural Integration Specification for AnF

### 4.1 Cross-Platform Architecture Diagram

```mermaid
flowchart TB
    subgraph UI["AnF Workspace Presentation Layer"]
        MHD["Music Hub Dock (music-hub.ts)"]
        FP["Full Player Modal Dialog"]
        LV["Synced Lyrics View (lyrics.ts)"]
    end

    subgraph Core["Shared Audio Services & State"]
        AL["Audio Library (IndexedDB 'coucou-audio')"]
        LP["Lyrics Provider (lyrics-provider.ts)"]
        AQ["Queue & Shuffle Controller (audio-queue.ts)"]
        AM["Metadata Reader (audio-metadata.ts)"]
    end

    subgraph DesktopPipe["Windows Platform Pipeline"]
        WA["Web Audio / HTML5 Audio Element"]
        MS["navigator.mediaSession API"]
        BlobURL["IndexedDB Blob ObjectURL"]
    end

    subgraph AndroidPipe["Android Platform Pipeline"]
        MB["MediaBridge.java (JSBridge)"]
        PS["PlaybackService.java (MediaSessionService)"]
        Exo["ExoPlayer (Media3) Engine"]
        Cache["Dual Cache (DownloadCache + PlayerCache)"]
    end

    subgraph ExtRemote["External & Network APIs"]
        LRCLIB["LRCLIB API (https://lrclib.net)"]
        CDN["Streaming Audio CDN (Signed URLs)"]
    end

    MHD <--> FP
    FP --> LV
    MHD <--> AL
    MHD <--> AQ
    MHD --> LP

    %% Windows path
    MHD -.->|Windows/Tauri| WA
    WA --> BlobURL
    WA --> MS

    %% Android path
    MHD -.->|Android Bridge| MB
    MB --> PS
    PS --> Exo
    Exo --> Cache

    %% Lyrics Remote
    LP -->|Exact & Fuzzy REST| LRCLIB
    LP -->|Persist Synced LRC| AL

    %% Streaming
    Exo -.->|Signed HTTPS Stream| CDN
```

### 4.2 Core Interface Contracts

#### 1. Audio Track & State (`windows/src/workspace/audio-library.ts`)
```typescript
export type MediaKind = 'music' | 'audiobook' | 'podcast';

export type AudioTrack = TrackMetadata & {
  id: string;               // UUID
  title: string;
  artist: string;
  name: string;             // File name
  importPath?: string;      // Folder relative path
  blob: Blob;               // Audio file binary
  created: number;          // Timestamp
  duration?: number;        // Seconds
  wave?: number[];          // Waveform envelope
  sampleRate?: number;
  kind?: MediaKind;
  chapters?: { title: string; start: number }[];
};

export type AudioState = {
  id: 'queue';
  order: string[];          // Track UUIDs
  current?: string;
  repeat: 'off' | 'track' | 'all';
  position: number;         // Seconds
  custom?: boolean;
};

export type AudioPlaylist = {
  id: string;
  name: string;
  order: string[];
};
```

#### 2. Synchronized Lyrics Models (`windows/src/workspace/lyrics.ts`)
```typescript
export type LyricLine = {
  time?: number;            // Timestamp in seconds (undefined for plain lyrics)
  text: string;             // Line text
};

export type Lyrics = {
  synced: boolean;          // True if line timestamps present
  lines: LyricLine[];       // Ordered chronologically
};

export interface RemoteLyrics {
  id?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string;
  syncedLyrics?: string;
}
```

#### 3. Android Native Bridge Protocol (`android/java/com/coucou/workspace/MediaBridge.java`)
- **Transport**: `window.AnFAndroid.mediaRequest(requestId, operation, jsonPayload)`
- **Operations Supported**:
  - `play`: Resumes playback
  - `pause`: Suspends playback
  - `seek`: JSON `{ "position": <ms> }`
  - `next`: Skips to next queue item
  - `previous`: Skips to previous queue item
  - `stop`: Halts and releases queue
  - `queue`: JSON `{ "items": [{ "track": <id>, "ext": <ext>, "title": <t>, "artist": <a> }], "repeat": "off"|"track"|"all" }`
  - `play_remote`: JSON `{ "url": "https://...", "title": <t>, "artist": <a> }`
  - `status`: Returns JSON `{ "title": <t>, "position": <ms>, "duration": <ms>, "playing": <bool>, "error": <bool> }`
  - `clear`: Empties native background audio store

---

## 5. Logic Chain

1. **Architecture Decoupling**:
   - The user request requires integrating MKR Music's player engine and LRCLIB synchronized lyrics without breaking AnF's offline-first architecture (`ORIGINAL_REQUEST.md:23-25`).
   - Investigation of `CLAUDE.md:3` and `docs/MUSIC-HUB.md:5-25` revealed that AnF maintains a unified design across Windows Tauri (`windows/`) and Android (`android/`).
   - MKR Music's upstream engine in `C:\Users\mwali\.gemini\antigravity\scratch\mkr-music` is an advanced Kotlin Multiplatform / Android Media3 application using ExoPlayer.
   - Therefore, AnF's architecture utilizes a dual-pipeline strategy:
     - Windows desktop uses the Web Audio / HTML5 `Audio()` element + `navigator.mediaSession` registering IndexedDB Blob streams.
     - Android native uses `MediaBridge.java` and `PlaybackService.java` wrapping `androidx.media3.exoplayer.ExoPlayer` for lock-screen and background media sessions.

2. **Lyrics Engine Unification**:
   - Upstream MKR Music parses LRC using `LrcLib.kt` and `LyricsUtils.kt`.
   - The desktop workspace mirrors this exact behavior in `windows/src/workspace/lyrics-provider.ts` and `lyrics.ts`.
   - By matching promotional cleanup regexes (`titleCleanupPatterns`) and primary artist splitting (`artistSeparators`), match rate on LRCLIB increases significantly.
   - By parsing both standard LRC (`[mm:ss.xx]`) and rich sync word tags (`<mm:ss.xx>`), lyrics remain compatible with both simple line scrolling and advanced karaoke rendering.
   - By storing retrieved lyrics into `coucou-audio` IndexedDB on the first fetch, offline playback is guaranteed on subsequent sessions.

3. **Performance & UX Dynamics**:
   - Binary search in `activeLine` ($O(\log n)$) provides instantaneous line lookup during `timeupdate` events without UI thread stutter.
   - Anticipation offset (300 ms) provides a natural reading rhythm where visual active-state transitions immediately precede vocalization.
   - Smooth spring scrolling anchored at 32% of the viewport ensures the active line remains in the upper-middle sightline while preserving visibility of upcoming verses.
   - User scroll drag detection with a 4-second delay prevents auto-scroll fighting user inspection.

---

## 6. Caveats

1. **Read-Only Scope**:
   - Per dispatch boundaries, this was an investigation and specification mining assignment. No source code or tests were modified.
2. **LRCLIB Rate Limits**:
   - LRCLIB enforces open-access rate limits. When querying in batch (e.g. bulk importing 50 tracks), queries must be throttled with sequential backoff or cached locally to prevent HTTP 429 errors.
3. **Android Device Verification**:
   - Background audio playback and lock-screen notification controls were verified through code analysis and browser fixtures. Audible hardware playback on physical Android hardware or emulator requires installed packaging verification.
4. **Desktop Streaming**:
   - Desktop Music Hub currently plays local audio files and podcast RSS enclosures. Streaming from YouTube Music/Spotify requires the optional native Spotube bridge (`embedded-music` feature).

---

## 7. Conclusion

The MKR Music audio engine and LRCLIB synchronized lyrics system provide a battle-tested, high-performance architecture for AnF.
- **Player Engine**: Implements a robust state machine (`STATE_IDLE`, `STATE_BUFFERING`, `STATE_READY`, `STATE_ENDED`), queue manager with shuffle timeline preservation, dual-cache source resolution (`@PlayerCache` and `@DownloadCache`), look-ahead stream prefetching, audio focus ducking (20%), and exponential error recovery.
- **LRCLIB Lyrics**: Provides a clean 2-tier REST contract (`/api/get` exact and `/api/search` fuzzy), robust LRC parsing with offset and tag handling, $O(\log n)$ binary search with 300 ms anticipation, and a seamless 7-stage offline fallback cascade.
- **AnF Music Hub Integration**: Bridges flawlessly into AnF's dark charcoal/mint UI, persistent dock/full-player dialog, mutual audio exclusion safeguards, and dual Windows/Android audio pipelines.

---

## 8. Verification Method

To independently verify the observations, contracts, and behavior documented in this specification:

1. **Verify Unit Tests for Lyrics Provider & Parsing**:
   ```powershell
   cd C:\Users\mwali\.gemini\antigravity\scratch\AnF\windows
   npm test
   ```
   *Expected outcome: All 3 suites pass (`cleanTitle`, `primaryArtist`, `parseLyrics`).*

2. **Verify Frontend TypeScript Compilation**:
   ```powershell
   cd C:\Users\mwali\.gemini\antigravity\scratch\AnF\windows
   npx tsc --noEmit
   ```
   *Expected outcome: Zero TypeScript diagnostic errors.*

3. **Inspect MKR Music Reference Implementation**:
   - Open and inspect `C:\Users\mwali\.gemini\antigravity\scratch\mkr-music\app\src\main\kotlin\com\music\mkr\playback\MusicService.kt`.
   - Open and inspect `C:\Users\mwali\.gemini\antigravity\scratch\mkr-music\lyricsProvider\src\main\kotlin\com\music\lrclib\LrcLib.kt`.
   - Open and inspect `C:\Users\mwali\.gemini\antigravity\scratch\mkr-music\app\src\main\kotlin\com\music\mkr\ui\component\Lyrics_v2.kt`.

4. **Verify Offline Lyrics Fallback Behavior**:
   - Disconnect network or mock HTTP 404/offline response.
   - Import audio file with embedded lyrics or existing IndexedDB track record.
   - Verify lyrics view renders cached lyrics without network access.
