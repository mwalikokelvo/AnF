# Handoff Report — LRCLIB Synced Lyrics Integration & Caching Specification
**Agent**: `teamwork_spec_miner_m1_2`  
**Milestone**: M1 (Area 2: LRCLIB Synced Lyrics Integration & Caching)  
**Date**: 2026-10-31T02:55:00Z  
**Workspace Target**: `windows/src/workspace/lyrics.ts`, `windows/src/workspace/lyrics-provider.ts`, `windows/src/workspace/music-hub.ts`, `windows/src/workspace/music-hub.css`

---

## 1. Observation

### 1.1 Direct File Observations & Code Layout
1. **`windows/src/workspace/lyrics.ts` (75 lines)**:
   - Implements `parseLyrics(source: string): Lyrics` (lines 9–33). Line limit is `MAX_LINES = 5000`, character limit `MAX_TEXT = 200_000`. Strips leading BOM (`\uFEFF`). Parses timestamp tag `/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g`. Rejects seconds `>= 60` (line 23). Parses `[offset:±ms]`, converts to seconds, and subtracts from line timestamps (`t - offset`).
   - Implements `activeLine(lyrics: Lyrics, time: number): number` (lines 36–44). Binary search over sorted timestamps (`time` in seconds). Returns `-1` if unsynced or before first line; returns `mid` where `time >= line.time`.
   - Implements `toLrc(lines: {text: string; timestamp?: number}[]): string` (lines 47–53). Formats millisecond timestamps into `[mm:ss.xx]` strings.
   - Implements `baseName(name: string): string` and `matchLyricsTrack(file, tracks, importedIds)` (lines 56–74). Matches sidecar `.lrc` files to audio tracks using folder path stem (`webkitRelativePath`) or base name. Rejects ambiguous duplicate matches by returning `undefined`.
2. **`windows/src/workspace/lyrics-provider.ts` (129 lines)**:
   - Uses LRCLIB client identification header (lines 13–15):
     ```typescript
     const LRCLIB_CLIENT_HEADER = {
       'Lrclib-Client': 'AnF-Desktop/0.1.22 (https://github.com/mwalikokelvo/AnF)',
     };
     ```
   - Implements `cleanTitle(title: string): string` (lines 34–40) using 9 regexes stripping promotional, video, audio, remaster, and featured artist tags.
   - Implements `primaryArtist(artist: string): string` (lines 43–52) using separator array:
     ```typescript
     const artistSeparators = [
       ' feat. ', ' feat ', ' ft. ', ' ft ', ' featuring ', ' & ', ' and ', ', ', ' x ', ' X ', ' with '
     ];
     ```
   - Implements `fetchOnlineLyrics(track)` (lines 57–128). Tries exact match `https://lrclib.net/api/get` (lines 75–89), backs off on 429/503 (lines 79–83), falls back to fuzzy search `https://lrclib.net/api/search?q=${query}` (lines 100–122).
3. **`windows/src/workspace/music-hub.ts` (133 lines)**:
   - Manages state machine, lyrics rendering, and scrolling:
     - Line 53: Creates `lyricsPanel = h('div', {class: 'music-lyrics', role: 'region', 'aria-label': 'Lyrics'})`.
     - Line 55: `lookupLyrics()` queries `fetchOnlineLyrics(target)`, writes to `target.lyrics`, persists to IndexedDB via `await library.put(target)`, calls `renderLyrics()` and `paintLyrics()`.
     - Line 56: `renderLyrics()` renders synced lines as `<button class="music-lyric">` with `onclick: () => { audio.currentTime = line.time!; paint(); save(); }`, or plain lines as `<p class="music-lyric">`. Header displays badge "Synced (MKR / LRCLIB)" or "Plain lyrics". Empty state shows "No lyrics for this track... Find Synced Lyrics (MKR)".
     - Line 57: `paintLyrics()` calls `activeLine(lyrics, audio.currentTime || 0)`. Sets `dockLyric.textContent = '♪ ' + lyrics.lines[i].text`. Updates `.active` class and `aria-current="true"`. Triggers `lyricsPanel.scrollTo({top: row.offsetTop - (lyricsPanel.clientHeight - row.offsetHeight) / 2, behavior: ...})`.
     - Line 60: `openFullPlayer()` opens `<dialog class="music-player music-full-player">`, sets `lyricIndex = -2`, and invokes `paintLyrics()`.
     - Line 68: `select(track)` loads `track.lyrics` (Stage 1 cache), revokes previous object URLs, and calls `renderLyrics()`.
     - Lines 90–97: `importFiles()` reads embedded tags with `readAudioMetadata(file)` (Stage 2) and pairs `.lrc` files via `matchLyricsTrack` (Stage 3).
4. **`windows/src/workspace/music-hub.css` (151 lines)**:
   - Line 121: `.music-full-player .music-lyrics` sets container mask:
     `-webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 12%, #000 85%, transparent 100%)`
   - Line 125: `.music-full-player .music-lyric` sets inactive lyric styling: `color: #f4f7f580; font-size: 18px; line-height: 1.45; font-weight: 500`.
   - Line 127: `.music-full-player .music-lyric.active` sets active highlight: `color: #79e4b4; font-size: 22px; font-weight: 700; transform: scale(1.05); text-shadow: 0 0 16px rgba(121,228,180,0.4)`.
   - Line 129: `.music-now-lyric` sets mini-player lyric: `color: #79e4b4; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis`.
   - Line 135: `.music-full-player .music-lyrics { position: relative }` ensures `row.offsetTop` is relative to lyrics container.
5. **`windows/src/workspace/audio-metadata.ts` (17 lines)**:
   - Lines 5–8: `embeddedLyrics` extracts ID3 SYLT frame (`timeStampFormat === 2` millisecond sync text, converted via `toLrc()`) or ID3 USLT frame (`tags.find(t => t.text?.trim())`).
6. **`PROJECT.md` Interface Contract Discrepancies**:
   - `PROJECT.md` line 66: `export interface LyricLine { time: number; // millisecond timestamp; text: string; }`
   - `lyrics.ts` line 2: `export type LyricLine = { time?: number; text: string };` where `time` is floating-point SECONDS (`audio.currentTime`).
   - `PROJECT.md` line 74: `export interface ParsedLyrics { lines: LyricLine[]; offsetMs: number; syncType: 'LINE_SYNCED' | 'WORD_SYNCED' | 'UNSYNCED'; }`
   - `lyrics.ts` line 3: `export type Lyrics = { synced: boolean; lines: LyricLine[] };`
   - `PROJECT.md` line 77: `export interface LyricsProvider { fetchLyrics(track): Promise<ParsedLyrics | null>; cleanTitle(title): string; primaryArtist(artist): string; getCachedLyrics(trackId): Promise<ParsedLyrics | null>; }`
   - `lyrics-provider.ts`: Exports standalone functions (`fetchOnlineLyrics`, `cleanTitle`, `primaryArtist`) without the unified `LyricsProvider` object or `getCachedLyrics`.

### 1.2 Upstream Reference Implementations
1. **MKR Music (`mkr-music/lyricsProvider/src/main/kotlin/com/music/lrclib/LrcLib.kt`)**:
   - Implements 5 search strategies (`queryLyrics`):
     1. `track_name = cleanedTitle, artist_name = cleanedArtist, album_name = album`
     2. `track_name = cleanedTitle`
     3. Combined search `query = "$cleanedArtist $cleanedTitle"`
     4. Title-only search `query = cleanedTitle`
     5. Original title fallback if cleaned title differed
   - Implements strict duration tolerance (`bestMatchingForRelaxed` in `Track.kt`):
     `takeIf { abs(it.duration.toInt() - duration) <= 5 }`
     Refuses to accept search results whose duration differs by more than 5 seconds.
2. **Spotube (`continuations/af-0.2.0-2026-10-24/spotube/.../lib/provider/lyrics/synced.dart`)**:
   - Cache-first check against local database (`lyricsTable`).
   - If missing or empty, fetches LRCLIB `/api/get` with `User-Agent` / `Lrclib-Client`.
   - On successful fetch, caches lyrics back to database (`mode: InsertMode.replace`).

### 1.3 Empirical Probing Results (Executed Commands & Verbatim Outputs)
Two comprehensive test harnesses were executed:
- `node run_probes.mjs` (58 discrete unit probes against compiled modules).
- `node run_network_probes.mjs` (9 discrete network fault-injection probes).

**Command**: `node run_probes.mjs`
- Clean title normalization: Strips `(Official Video)`, `[Audio]`, `【Official MV】`, `(Live Acoustic Version)`, `| Visualizer HD`, `- Official Music Video`, `(feat. ...)`, `(ft. ...)`, `feat. ...`, `ft. ...`, `(2021 Remaster)`, `[4K 60FPS]`.
- Clean title edge cases:
  - Input: `'Song Name - (Official Video)'` -> Output: `'Song Name -'` (leaves trailing hyphen).
  - Input: `'Song Name (with Singer)'` -> Output: `'Song Name (with Singer)'` (`with` not matched in parentheses).
  - Input: `'[Official Audio]'` -> Output: `'[Official Audio]'` (all stripped, correctly falls back to raw).
- Primary artist separator order flaw:
  - Input: `'Drake, 21 Savage ft. Project Pat'`
  - Verbatim Output: `'Drake, 21 Savage'`
  - Expected Output: `'Drake'` (Reason: `' ft. '` appears at index 2 in `artistSeparators` before `', '` at index 7. The function iterates through separators in array order rather than finding the earliest separator in the string).
- Multi-artist delimiters missing:
  - Input: `'Artist A / Artist B'` -> Output: `'Artist A / Artist B'` (`/` not in separator list).
  - Input: `'Artist A; Artist B'` -> Output: `'Artist A; Artist B'` (`;` not in separator list).
- Timestamp parsing & offsets:
  - `[00:12.50]` -> 12.5s.
  - `[125:40.00]` -> 7540s (3-digit minutes supported).
  - `[01:23:45]` -> 83.45s (colon delimiter supported).
  - `[00:99.00]` -> Rejected (seconds >= 60).
  - `[offset:+500]` on `[00:10.00]` -> 9.5s (positive offset advances).
  - `[offset:-500]` on `[00:10.00]` -> 10.5s (negative offset delays).
  - `[offset:+15000]` on `[00:10.00]` -> 0s (`Math.max(0, ...)` clamp).
- Binary search `activeLine`:
  - `time = 0` before first line -> `-1`.
  - `time = 5.0` at exact line 0 -> `0`.
  - `time = 8.0` between lines 0 and 1 -> `0`.
  - `time = 12.5` at line 1 -> `1`.
  - `time = 100.0` past all lines -> `2`.
  - Unsynced lyrics -> `-1`.
- Sidecar `.lrc` matching:
  - Exact path stem `Music/Album 1/Song.lrc` matches `Music/Album 1/Song.mp3`.
  - Ambiguous baseName `Song.lrc` with two songs named `Song.mp3` in different folders -> `undefined` (correct, avoids guessing).

**Command**: `node run_network_probes.mjs`
- Scenario 1 (Completely Offline / `TypeError: Failed to fetch`): Caught, returns `undefined`.
- Scenario 2 (DNS Resolution Failure / `ENOTFOUND`): Caught, returns `undefined`.
- Scenario 3 (HTTP 429 Rate Limit with `Retry-After: 60`): Logs backoff warning, returns `undefined`.
- Scenario 4 (HTTP 503 Service Unavailable): Logs backoff warning, returns `undefined`.
- Scenario 5 (HTTP 500 Bad Gateway with HTML error body): Caught without unhandled rejection, returns `undefined`.
- Scenario 6 (HTTP 200 with malformed JSON body): Caught, returns `undefined`.
- Scenario 7 (404 Exact Match -> Fuzzy Search 200): Successfully returns fuzzy search synced lyrics.
- Scenario 8 (404 Exact Match -> Search has 10-minute duration mismatch):
  - Target duration: 120s. Search candidate duration: 800s.
  - Verbatim Output: `"[00:10.00]Completely wrong long track"`
  - Defect Observed: No duration tolerance cutoff is enforced. A 10-minute song is accepted for a 2-minute song.

---

## 2. Logic Chain

1. **LRCLIB REST API Query Normalization**:
   - `primaryArtist` uses a `for (const sep of artistSeparators)` loop. In JavaScript, this tests each separator sequentially against `artist.includes(sep)`. If a string contains multiple separators (e.g., `'Artist 1, Artist 2 ft. Artist 3'`), the separator that appears earlier in `artistSeparators` wins, even if it occurs much later in the string.
   - Therefore, `primaryArtist` must locate all matching separators and split at the minimum string index: `earliestIndex = Math.min(...)`.
   - In standard ID3 and Vorbis tags, collaborations frequently use `" / "` and `"; "`. Adding these delimiters prevents multi-artist tags from failing query resolution.
   - `cleanTitle` strips parenthetical tags, but when a title has a format tag preceded by a hyphen (e.g. `'Song Name - (Official Video)'`), stripping leaves a trailing hyphen `'Song Name -'`. Adding a cleanup step `.replace(/\s*[-–—]\s*$/, '')` resolves this.
   - LRCLIB `/api/get` requires exact matching. If the track's duration in local ID3 metadata differs by 1–2 seconds from LRCLIB's database, `/api/get` returns 404. Falling back to `/api/search` is necessary. However, `/api/search` in `lyrics-provider.ts` lacks duration tolerance. In MKR Music, `bestMatchingForRelaxed` enforces `abs(candidate.duration - target.duration) <= 5`. Without this, searching a common title (e.g. "Intro", "Home") matches an unrelated track with a different duration.

2. **Synchronized Scrolling & Visual Mechanics**:
   - Binary search in `activeLine` runs in $O(\log N)$ time and returns the greatest index $i$ where `lines[i].time <= currentTime`. This guarantees smooth line transitions during normal playback and instant updates upon manual seeking.
   - In `music-hub.ts`, line click handlers assign `audio.currentTime = line.time!`, followed by `paint()`. `paint()` calls `paintLyrics()`, which re-evaluates `activeLine`, marks the clicked line with `.active` and `aria-current="true"`, and scrolls `lyricsPanel` using `scrollTo({top: row.offsetTop - (lyricsPanel.clientHeight - row.offsetHeight) / 2, behavior: ...})`.
   - In `music-hub.css`, the container uses CSS mask gradient `linear-gradient(to bottom, transparent 0%, #000 12%, #000 85%, transparent 100%)`. Inactive lines are `color: #f4f7f580; font-size: 18px`. Active lines scale up (`transform: scale(1.05); font-size: 22px; font-weight: 700`) with text glow `text-shadow: 0 0 16px rgba(121, 228, 180, 0.4)`.
   - Styling defect: The active line color (`#79e4b4`), text-shadow glow (`rgba(121,228,180,0.4)`), badge background (`rgba(121,228,180,0.15)`), and docked mini lyric (`#79e4b4`) use hard-coded emerald green. When the user selects the `ember` (`#ff6b4a`), `violet` (`#c084fc`), or `dusk` (`#7eb6ff`) themes in `music-hub.ts`, the lyrics panel remains green. Replacing hard-coded hex colors with `var(--music-accent)` restores visual coherence across all themes.

3. **7-Stage Offline Cache Cascade Mechanics**:
   - Stage 1 (IndexedDB `AudioTrack.lyrics`): Loaded synchronously in `select(track)`. If present, renders immediately without network activity.
   - Stage 2 (Embedded ID3/Vorbis): Extracted during `importFiles()` via `readAudioMetadata(file)`. ID3 SYLT (sync text format 2) is converted to LRC via `toLrc()`. Unsynced USLT is stored as plain text. Stored in IndexedDB as Stage 1.
   - Stage 3 (Sidecar `.lrc` files): Imported alongside audio. Matched via `matchLyricsTrack()`. If matching track exists, sidecar `.lrc` overwrites embedded tags and updates IndexedDB.
   - Stage 4 (Online LRCLIB Exact `/api/get`): Queried via `lookupLyrics()`. Provides exact match with metadata header `Lrclib-Client`.
   - Stage 5 (Online LRCLIB Search `/api/search`): Fuzzy fallback with duration ranking.
   - Stage 6 (Unsynchronized Plain Text Fallback): If LRCLIB returns only `plainLyrics`, or ID3 contains USLT, `parseLyrics` returns `synced: false`. Displayed as non-clickable text with badge "Plain lyrics".
   - Stage 7 (Graceful Offline Placeholder): If offline or no lyrics found, renders `.music-lyrics-empty` with message "No lyrics for this track..." and retry button "Find Synced Lyrics (MKR)". Audio playback continues without error.

4. **Network Offline Resilience & Promise Handling**:
   - `fetchOnlineLyrics` handles network rejections (`TypeError: Failed to fetch`) and JSON parsing errors inside `try/catch` blocks, returning `undefined`. No unhandled promise rejections escape `fetchOnlineLyrics`.
   - However, `fetch` requests lack a timeout (`AbortSignal.timeout(...)`). On high-latency or dropped connections, requests can hang indefinitely while `music-hub.ts` displays "Searching synced lyrics...". Adding a 6-second timeout (`signal: AbortSignal.timeout(6000)`) guarantees prompt failure recovery.
   - Furthermore, `lookupLyrics` in `music-hub.ts` reports `"No online lyrics found for ..."` even when the failure was caused by being completely offline. Adding a check for `typeof navigator !== 'undefined' && !navigator.onLine` allows reporting `"Offline: Connect to network to search lyrics"`, preventing unnecessary DNS/network attempts.

---

## 3. Caveats

1. **Word-by-Word Synchronization (Syllable-Level Karaoke)**:
   - `lyrics.ts` line 26 strips inline word timestamps (`<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>`) to normalize lines into standard LRC. Syllable-level progressive filling (like Apple Music or MKR Music's TTML parser) is not currently rendered in the DOM; lyrics are synchronized at the line level.
2. **Auto-Scroll User Override**:
   - When a user manually scrolls `lyricsPanel` to read ahead during playback, the next `timeupdate` event (~250ms later) invokes `paintLyrics()` and immediately scrolls the panel back to the active line. Adding a temporary 3–5 second auto-scroll suppression on user scroll would improve reading UX.
3. **No Direct Filesystem Sidecar Scan on Tauri Desktop**:
   - `matchLyricsTrack` requires `.lrc` files to be passed via the file/folder input (`<input type="file">`). If a user imports a single `song.mp3` on Tauri desktop without selecting its adjacent `song.lrc`, AnF does not currently perform a Tauri Rust filesystem probe for the adjacent `.lrc` file.

---

## 4. Conclusion

The LRCLIB lyrics integration in AnF is well-architected, utilizing standard LRC parsing, efficient binary search active line tracking, CSS mask gradient fades, and a complete 7-stage fallback cascade.

To fully harden the module for production and ensure compliance with MKR Music specifications and `PROJECT.md` contracts, the following 5 concrete improvements are specified for the Worker:
1. **Fix `primaryArtist` Delimiter Precedence**: Replace the array-order loop with an index-based search that splits on the earliest separator in the string, and add support for `" / "` and `"; "`.
2. **Enforce ±5s Duration Tolerance in LRCLIB Fallback**: Filter search results in `fetchOnlineLyrics` with `Math.abs((item.duration || 0) - duration) <= 5` (or up to 8s for relaxed matches) to prevent matching unrelated songs with identical titles.
3. **Add Network Timeout & Offline Detection**: Add `signal: AbortSignal.timeout(6000)` to `fetch` calls, check `navigator.onLine`, and provide descriptive user feedback ("You are offline" vs "No lyrics found").
4. **Theme Accent Harmonization in `music-hub.css`**: Replace hard-coded `#79e4b4` and `rgba(121, 228, 180, ...)` with `var(--music-accent)` in `.music-lyric.active`, `.music-now-lyric`, and `.music-lyrics-badge`.
5. **Contract Alignment with `PROJECT.md`**: Expose a unified `LyricsProvider` object in `lyrics-provider.ts` and document that `LyricLine.time` in `lyrics.ts` is in seconds for HTML5 Audio playback compatibility.

---

## 5. Verification Method

### 5.1 Verification Commands
1. Run existing test suite:
   ```powershell
   cd C:\Users\mwali\.gemini\antigravity\scratch\AnF\windows
   node scripts/test.mjs
   ```
   **Expected Result**: All 3 test suites pass cleanly.

2. Run empirical probe test suites:
   ```powershell
   node C:\Users\mwali\.gemini\antigravity\scratch\AnF\.agents\teamwork\teamwork_spec_miner_m1_2\run_probes.mjs
   node C:\Users\mwali\.gemini\antigravity\scratch\AnF\.agents\teamwork\teamwork_spec_miner_m1_2\run_network_probes.mjs
   ```
   **Expected Result**: All 58 unit probes and 9 network failure probes execute and log expected behaviors.

3. Verify TypeScript build:
   ```powershell
   cd C:\Users\mwali\.gemini\antigravity\scratch\AnF\windows
   npm run build
   ```
   **Expected Result**: TypeScript compile passes with zero errors (`tsc --noEmit && vite build`).

### 5.2 Invalidation Conditions
- Any change to `TAG` regex that breaks support for 3-digit minutes (`[120:30.00]`) or colon millisecond delimiters (`[01:23:45]`).
- Any modification to `activeLine` that alters $O(\log N)$ binary search to linear search.
- Any change that allows `fetchOnlineLyrics` to throw unhandled promise rejections on offline failure.

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Normalization | `cleanTitle` | Strips video, audio, lyric, remaster, format tags, and parens | Track title string | Cleaned song title | Returns original string if all stripped | `windows/src/workspace/lyrics-provider.ts:34` |
| 2 | Normalization | `primaryArtist` | Extracts lead artist from collaboration strings | Artist string | First artist name | Returns original string if no separator | `windows/src/workspace/lyrics-provider.ts:43` |
| 3 | LRCLIB API | Exact Match `/api/get` | Queries LRCLIB for exact track match with client header | Title, artist, album, duration | Synced or plain LRC text | Returns undefined on 404/429/503 | `windows/src/workspace/lyrics-provider.ts:75` |
| 4 | LRCLIB API | Search Fallback `/api/search` | Queries LRCLIB free-text search when exact match fails | Cleaned title and artist query | Synced or plain LRC text | Returns undefined if no results | `windows/src/workspace/lyrics-provider.ts:100` |
| 5 | LRCLIB API | Rate Limit Backoff | Parses `Retry-After` header on 429 and 503 responses | HTTP response headers | Logs warning, terminates query | Graceful undefined return | `windows/src/workspace/lyrics-provider.ts:79` |
| 6 | LRC Parser | `parseLyrics` | Parses LRC string, handles offsets, timestamps, and plain text | Raw LRC or plain text | `{synced: boolean, lines: LyricLine[]}` | Ignores malformed tags, caps at 5000 lines | `windows/src/workspace/lyrics.ts:9` |
| 7 | LRC Parser | Timestamp Extraction | Parses `[mm:ss.xx]` and `[mm:ss:xx]` with up to 3-digit minutes | Timestamp regex tags | Millisecond fraction converted to seconds | Rejects seconds >= 60 | `windows/src/workspace/lyrics.ts:23` |
| 8 | LRC Parser | Offset Adjustment | Shifts lyric timestamps based on `[offset:±ms]` header | LRC header tag | Adjusted seconds timestamps | Clamps negative resulting time to 0 | `windows/src/workspace/lyrics.ts:28` |
| 9 | Synchronization | `activeLine` Binary Search | Locates currently sung lyric line index for given playback time | `Lyrics` object, `time` in seconds | Line index `0..N-1` or `-1` | Returns `-1` before first line or if unsynced | `windows/src/workspace/lyrics.ts:36` |
| 10 | Formatting | `toLrc` | Serializes millisecond timestamped lines to LRC format | Array of `{text, timestamp?}` | Standard LRC string | Omits tag for lines without timestamp | `windows/src/workspace/lyrics.ts:47` |
| 11 | Sidecar Matching | `matchLyricsTrack` | Pairs imported `.lrc` file to audio track by folder or name | `File`, track list, `importedIds` | Matching `AudioTrack` or `undefined` | Returns `undefined` on ambiguous duplicates | `windows/src/workspace/lyrics.ts:64` |
| 12 | UI Rendering | Synced Lines as Buttons | Renders synced lyric lines as interactive buttons for click-to-seek | Synced `Lyrics` lines | `<button class="music-lyric">` | Renders plain `<p>` if unsynced | `windows/src/workspace/music-hub.ts:56` |
| 13 | UI Navigation | Click-to-Seek | Clicking lyric button sets `audio.currentTime = line.time` | User click event on lyric row | Audio seeks, UI highlights and scrolls | Safely updates position and saves prefs | `windows/src/workspace/music-hub.ts:56` |
| 14 | UI Animation | Centered Auto-Scroll | Smoothly centers active line in full player dialog | Active line index, dialog open state | `lyricsPanel.scrollTo({top: ...})` | Respects `prefers-reduced-motion` | `windows/src/workspace/music-hub.ts:57` |
| 15 | UI Styling | Karaoke Mask Gradient | Top and bottom fade mask on lyrics viewport | CSS mask-image | 12% top / 15% bottom fade | Pure CSS rendering | `windows/src/workspace/music-hub.css:121` |
| 16 | UI Styling | Active Line Glow | Scales up and applies text-shadow glow to active lyric | `.music-lyric.active` CSS class | Scaled text with accent glow | Transitions over 0.2s | `windows/src/workspace/music-hub.css:127` |
| 17 | Mini Player | Docked Lyric Display | Shows currently active lyric line with ♪ icon in docked player | `dockLyric` text content | Single-line truncated text | Sets empty text when no line is active | `windows/src/workspace/music-hub.ts:57` |
| 18 | Offline Cache | Stage 1: IndexedDB | Reads `track.lyrics` from local IndexedDB storage | `track.id` key | Stored lyrics string | Renders placeholder if empty | `windows/src/workspace/music-hub.ts:68` |
| 19 | Offline Cache | Stage 2: Embedded Tags | Extracts ID3 SYLT / USLT and Vorbis comment lyrics on import | Audio file blob | LRC string saved to track | Ignores if no lyrics tags present | `windows/src/workspace/audio-metadata.ts:5` |
| 20 | Offline Cache | Stage 3: Sidecar Files | Ingests `.lrc` files imported alongside audio files | File array | Overwrites track lyrics in IndexedDB | Matches uniquely or skips | `windows/src/workspace/music-hub.ts:92` |
| 21 | Offline Cache | Stage 4: Online Exact | Online query to LRCLIB exact match endpoint | Metadata parameters | Synced or plain lyrics | Fails over to Stage 5 | `windows/src/workspace/lyrics-provider.ts:75` |
| 22 | Offline Cache | Stage 5: Online Search | Online query to LRCLIB fuzzy search endpoint | Title + artist query | Closest duration synced lyrics | Fails over to Stage 6 | `windows/src/workspace/lyrics-provider.ts:100` |
| 23 | Offline Cache | Stage 6: Plain Fallback | Renders unsynchronized plain text lyrics | Plain text string | Non-scrolling lyrics view | Badge indicates "Plain lyrics" | `windows/src/workspace/music-hub.ts:56` |
| 24 | Offline Cache | Stage 7: Empty Placeholder | Displays helpful prompt and retry button when no lyrics found | Empty lyrics state | Empty state card with action button | Non-blocking, playback continues | `windows/src/workspace/music-hub.ts:56` |

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | `cleanTitle` | `'Song Name - (Official Video)'` | Leaves trailing hyphen `'Song Name -'` |
| 2 | `cleanTitle` | `'Song Name (with Singer)'` | Leaves `'(with Singer)'` unstripped (`with` missing from paren regex) |
| 3 | `cleanTitle` | `'[Official Audio]'` | Strips all tags and falls back to original string `'[Official Audio]'` |
| 4 | `cleanTitle` | `'Something (2021 Remaster)'` | Correctly strips remaster tag, leaves `'Something'` |
| 5 | `cleanTitle` | `''` (empty string) | Returns `''` safely without throwing |
| 6 | `cleanTitle` | `'   '` (whitespace) | Returns `''` safely |
| 7 | `primaryArtist` | `'Drake, 21 Savage ft. Project Pat'` | Returns `'Drake, 21 Savage'` instead of `'Drake'` (array-order search flaw) |
| 8 | `primaryArtist` | `'Artist A / Artist B'` | Returns `'Artist A / Artist B'` (`/` not in separator list) |
| 9 | `primaryArtist` | `'Artist A; Artist B'` | Returns `'Artist A; Artist B'` (`;` not in separator list) |
| 10 | `primaryArtist` | `'Earth, Wind & Fire'` | Splits at comma to `'Earth, Wind'` (official band name contains comma) |
| 11 | `primaryArtist` | `'Calvin Harris & Dua Lipa'` | Correctly extracts `'Calvin Harris'` |
| 12 | `primaryArtist` | `'The Weeknd feat. Daft Punk'` | Correctly extracts `'The Weeknd'` |
| 13 | `parseLyrics` | `'[00:12.50]Hello world'` | Parses to `{synced: true, lines: [{time: 12.5, text: "Hello world"}]}` |
| 14 | `parseLyrics` | `'[00:05.00][01:00.00]Chorus'` | Duplicates line across both timestamps: 5s and 60s |
| 15 | `parseLyrics` | `'[00:20.123]<00:20.20>Word <00:21.00>timed'` | Strips syllable tags, produces `{time: 20.123, text: "Word timed"}` |
| 16 | `parseLyrics` | `'[125:40.00]Deep into audio'` | Parses 3-digit minutes to 7540s |
| 17 | `parseLyrics` | `'[01:23:45]Colon fraction'` | Parses colon as millisecond separator: 83.45s |
| 18 | `parseLyrics` | `'[00:99.00]Invalid\n[00:10.00]Valid'` | Rejects `00:99`, retains `00:10.00` |
| 19 | `parseLyrics` | `'[offset:+500]\n[00:10.00]Line'` | Advances timestamp by 500ms to 9.5s |
| 20 | `parseLyrics` | `'[offset:-500]\n[00:10.00]Line'` | Delays timestamp by 500ms to 10.5s |
| 21 | `parseLyrics` | `'[offset:+15000]\n[00:10.00]Line'` | Clamps resulting negative time to 0s |
| 22 | `parseLyrics` | `'[ti:T]\n[ar:A]\n[00:05.00]Line'` | Skips LRC metadata header tags |
| 23 | `parseLyrics` | `'[00:10.00]\n[00:20.00]Next'` | Retains empty line `{time: 10, text: ""}` for instrumental breaks |
| 24 | `parseLyrics` | `'Verse 1\nVerse 2'` | Parses to `{synced: false, lines: [{text: "Verse 1"}, {text: "Verse 2"}]}` |
| 25 | `parseLyrics` | `''` (empty string) | Returns `{synced: false, lines: []}` |
| 26 | `parseLyrics` | `'\uFEFF[00:05.00]Line'` | Strips byte order mark (BOM) cleanly |
| 27 | `parseLyrics` | 6000 lines | Capped at 5000 lines (`MAX_LINES`) |
| 28 | `parseLyrics` | >200,000 chars | Capped at 200,000 chars (`MAX_TEXT`) |
| 29 | `activeLine` | `time = 0` (before line 0 at 5s) | Returns `-1` |
| 30 | `activeLine` | `time = 5.0` (at exact line 0) | Returns `0` |
| 31 | `activeLine` | `time = 8.0` (between line 0 and line 1) | Returns `0` |
| 32 | `activeLine` | `time = 12.5` (at exact line 1) | Returns `1` |
| 33 | `activeLine` | `time = 100.0` (past last line) | Returns `2` (last index) |
| 34 | `activeLine` | `synced: false` | Returns `-1` unconditionally |
| 35 | `activeLine` | `lines: []` (empty synced) | Returns `-1` |
| 36 | `toLrc` | `[{text: "Verse", timestamp: 65250}]` | Returns `'[01:05.25]Verse'` |
| 37 | `toLrc` | `[{text: "Start", timestamp: 0}]` | Returns `'[00:00.00]Start'` |
| 38 | `toLrc` | `[{text: "No stamp"}]` | Returns `'No stamp'` (plain text line) |
| 39 | `matchLyricsTrack` | Matching relative path | Returns matching track uniquely |
| 40 | `matchLyricsTrack` | Multiple songs named `Song.mp3` | Returns `undefined` (avoids ambiguous guessing) |
| 41 | `fetchOnlineLyrics` | Complete offline (`TypeError: Failed to fetch`) | Caught cleanly, returns `undefined`, no unhandled rejection |
| 42 | `fetchOnlineLyrics` | DNS failure (`ENOTFOUND`) | Caught cleanly, returns `undefined` |
| 43 | `fetchOnlineLyrics` | HTTP 429 with `Retry-After: 60` | Logs backoff warning, returns `undefined` |
| 44 | `fetchOnlineLyrics` | HTTP 503 Service Unavailable | Logs backoff warning, returns `undefined` |
| 45 | `fetchOnlineLyrics` | HTTP 500 returning HTML error page | `res.ok` check bypasses JSON parse, returns `undefined` |
| 46 | `fetchOnlineLyrics` | HTTP 200 with invalid JSON body | `res.json()` error caught cleanly, returns `undefined` |
| 47 | `fetchOnlineLyrics` | 404 exact match falling back to search | Successfully queries `/api/search` and returns synced lyrics |
| 48 | `fetchOnlineLyrics` | Search result has 10-minute duration delta | Accepted without tolerance check (Defect: needs ±5s cutoff) |

---

## 6. Recommendations for Worker Agent

### Recommendation 1: Fix `primaryArtist` Separator Precedence & Delimiters
In `windows/src/workspace/lyrics-provider.ts`, replace the separator loop with an earliest-index search and add `" / "`, `"; "`, and `";"`:
```typescript
const artistSeparators = [
  ' feat. ', ' feat ', ' ft. ', ' ft ', ' featuring ', ' & ', ' and ', ', ', ' x ', ' X ', ' with ', ' / ', '; ', ';'
];

export function primaryArtist(artist: string): string {
  const trimmed = artist.trim();
  let earliestIdx = -1;
  for (const sep of artistSeparators) {
    const idx = trimmed.toLowerCase().indexOf(sep.toLowerCase());
    if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
      earliestIdx = idx;
    }
  }
  if (earliestIdx !== -1) {
    return trimmed.slice(0, earliestIdx).trim() || trimmed;
  }
  return trimmed;
}
```

### Recommendation 2: Enforce Duration Tolerance in LRCLIB Fallback Search
In `windows/src/workspace/lyrics-provider.ts`, filter search results by duration tolerance (aligned with MKR Music upstream):
```typescript
if (synced.length) {
  if (duration && duration > 0) {
    // Only accept candidates within ±5s tolerance, or relaxed ±8s
    const matching = synced.filter(item => !item.duration || Math.abs(item.duration - duration) <= 8);
    const candidateList = matching.length ? matching : synced;
    candidateList.sort((a, b) => Math.abs((a.duration || 0) - duration) - Math.abs((b.duration || 0) - duration));
    return candidateList[0].syncedLyrics?.trim();
  }
  return synced[0].syncedLyrics?.trim();
}
```

### Recommendation 3: Add Network Timeout & Offline Check
In `windows/src/workspace/lyrics-provider.ts`:
- Check `typeof navigator !== 'undefined' && !navigator.onLine` to abort early when offline.
- Pass `signal: AbortSignal.timeout(6000)` to all `fetch()` calls.

### Recommendation 4: Theme Accent Variables in `music-hub.css`
In `windows/src/workspace/music-hub.css`:
- Replace `.music-full-player .music-lyric.active { color: #79e4b4; text-shadow: 0 0 16px rgba(121,228,180,0.4); }` with:
  `color: var(--music-accent); text-shadow: 0 0 16px var(--music-accent);`
- Replace `.music-lyrics-badge { color: #79e4b4; }` with `color: var(--music-accent);`
- Replace `.music-now-lyric { color: #79e4b4; }` with `color: var(--music-accent);`

### Recommendation 5: Additional Automated Tests for Worker
Add these test cases to `windows/tests/lyrics-provider.test.ts`:
1. Multi-separator collaboration test: `assert.equal(primaryArtist('Drake, 21 Savage ft. Project Pat'), 'Drake')`
2. Slash and semicolon artist test: `assert.equal(primaryArtist('Artist A / Artist B'), 'Artist A')`
3. Trailing hyphen title cleanup: `assert.equal(cleanTitle('Song Name - (Official Video)'), 'Song Name')`
4. Title with "with": `assert.equal(cleanTitle('Song Name (with Artist)'), 'Song Name')`
5. Large duration mismatch rejection in search.
