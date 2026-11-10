# Handoff Report — Milestone M1: Area 3: AntennaPod Podcasts & Spotube Streaming

**Agent**: `teamwork_explorer_m1_3`  
**Date**: 2026-10-31  
**Project**: AnF Offline-First Workspace Expansion  
**Milestone**: M1: Media & Music Hub Integration — Area 3  
**Target Files**:
- `windows/src/workspace/podcast-feeds.ts`
- `windows/src/workspace/audio-library.ts`
- `windows/src/workspace/streaming-provider.ts` (new)
- `windows/src/workspace/music-hub.ts`
- `windows/src/workspace/music-hub.css`
- `windows/tests/podcast-feeds.test.ts` (new)
- `windows/tests/streaming-provider.test.ts` (new)
- `windows/scripts/test.mjs`

---

## 1. Observation

1. **Current Podcast Feeds Parser (`windows/src/workspace/podcast-feeds.ts`)**:
   - Lines 2–18 define `PodcastEpisode` and `PodcastFeed`. `PodcastEpisode` only contains `{ id, title, summary, audioUrl, duration?, published? }`. Missing are: `feedUrl`, `played`, `playbackPosition`, `downloadStatus`, `enclosureLength`, `enclosureType`, `image`, `episodeNo`, and `seasonNo`.
   - Lines 61–74 in `parseRss`:
     ```typescript
     doc.querySelectorAll('item').forEach((item, index) => {
       const enclosure = item.querySelector('enclosure');
       const audioUrl = enclosure?.getAttribute('url') || '';
       if (!audioUrl) return;
       const durationRaw = text(item, 'itunes\\:duration') || text(item, 'duration');
       episodes.push({
         id: text(item, 'guid') || `${feedUrl}#${index}`,
         title: text(item, 'title') || `Episode ${index + 1}`,
         summary: strip(text(item, 'description') || text(item, 'itunes\\:summary') || ''),
         audioUrl,
         duration: parseDuration(durationRaw),
         published: text(item, 'pubDate') || undefined,
       });
     });
     ```
     Enclosure attributes `length` and `type` are not captured. `pubDate` is not normalized. Episode artwork (`itunes:image`) is omitted.
   - Lines 20–33 store feeds exclusively in `localStorage.getItem('anf-podcast-feeds')`. Audio files/blobs are not downloaded or cached offline.
   - Lines 86–92 define `parseDuration(value: string)` which does not handle decimals or edge whitespace cleanly.

2. **Current Music Hub Player & Playback Pipeline (`windows/src/workspace/music-hub.ts`)**:
   - Lines 109–112 render podcasts as a flat, single-level list with only feed titles and "Refresh" / "Remove" buttons:
     ```typescript
     if(tab==='podcasts'){
      content.replaceChildren(button('Add feed',()=>void run(addFeed)),button('Refresh feeds',()=>void run(refreshFeeds)),...feeds.map(f=>h('div',{class:'music-feed'},h('strong',{text:f.title||f.url}),button('Refresh',()=>void run(()=>refreshFeed(f))),button('Remove',()=>void run(()=>removeFeed(f))))));
      return;
     }
     ```
     There is no episode listing, no play button for episodes, no download control, no played toggle, and no two-level drill-down view.
   - Line 68 in `select(track: AudioTrack, play=true, position=0)`:
     ```typescript
     source = URL.createObjectURL(track.blob);
     cover = track.cover ? URL.createObjectURL(track.cover) : '';
     pending = position;
     audio.src = source;
     ```
     `select()` strictly expects `track.blob` as a Blob, revoking Object URLs. It has no handling for stream URLs (`streamUrl` / `audioUrl`), causing any non-blob track to fail.
   - Furthermore, `pending = position` is stored, but nowhere in `audio.addEventListener('loadedmetadata', ...)` is `audio.currentTime = pending` applied, meaning resuming an episode from a saved `playbackPosition` does not actually seek the underlying audio element upon loading.

3. **Audio Library Storage Contract (`windows/src/workspace/audio-library.ts`)**:
   - Line 4 defines `AudioTrack`:
     ```typescript
     export type AudioTrack=TrackMetadata & {id:string;title:string;artist:string;name:string;importPath?:string;blob:Blob;created:number;duration?:number;wave?:number[];sampleRate?:number;kind?:MediaKind;chapters?:{title:string;start:number}[];};
     ```
     IndexedDB `coucou-audio` (version 2) contains object stores: `'tracks'` (keyPath: `'id'`), `'state'`, `'playlists'`.
   - `AudioTrack` requires `blob: Blob`. In `windows/src/workspace/audio-studio.ts` (lines 89, 91, 93, 140), `track.blob.size` and `URL.createObjectURL(t.blob)` are accessed under strict mode (`"strict": true` in `tsconfig.json`). Retaining `blob: Blob` (with a zero-byte placeholder `new Blob([], { type: ... })` for online streams, or downloaded blob for offline tracks) prevents breaking `audio-studio.ts` and passes strict compiler checks.

4. **Spotube Streaming Integration State**:
   - `windows/src/workspace/spotube-desktop.ts` currently delegates to Tauri IPC commands (`music_open`, `music_control`) assuming an external Spotube process.
   - No decoupled TypeScript streaming metadata search provider or audio stream resolver exists in `windows/src/workspace/`.
   - `PROJECT.md` §Interface Contracts and §Feature Inventory (Items 3 & 4) mandates Spotube streaming audio resolution and offline audio blob caching into `coucou-audio`.

5. **Build and Test Harness**:
   - Running `cd windows; npm test` executes `windows/scripts/test.mjs`, which currently bundles `windows/tests/lyrics-provider.test.ts` with esbuild and runs Node.js 20 built-in `--test`. Result: 3 tests pass in ~157ms.
   - Running `$env:NODE_OPTIONS="--max-old-space-size=4096"; .\node_modules\.bin\tsc.cmd --noEmit` completes with exit code 0 and zero compiler warnings or errors.

---

## 2. Logic Chain

1. **AntennaPod Parser Alignment**:
   - *Observation 1* shows `PodcastEpisode` is missing critical fields (`feedUrl`, `played`, `playbackPosition`, `downloadStatus`, `enclosureLength`, `enclosureType`, `image`, `episodeNo`).
   - *Observation 1* also shows `<enclosure>` attributes `length` and `type`, and `<itunes:duration>` formats (`HH:MM:SS`, `MM:SS`, seconds) are partially parsed.
   - *Deduction*: Updating `parseRss` to extract `enclosure.getAttribute('length')`, `enclosure.getAttribute('type')`, `pubDate`, `itunes:image`, and adding a robust `parseDuration` function enables AntennaPod parity and populates the data structure specified in `PROJECT.md`.

2. **Episode Playback & Resume Routing**:
   - *Observation 2* reveals that `select()` fails if `track.blob` is empty and does not apply `pending` position upon loading audio metadata.
   - *Deduction*:
     1. In `music-hub.ts`, update `select()`: if `track.blob && track.blob.size > 0`, use `URL.createObjectURL(track.blob)`; else if `track.streamUrl`, use `source = track.streamUrl`.
     2. Add a `loadedmetadata` handler to set `audio.currentTime = pending` whenever `pending > 0`.
     3. On `timeupdate`, if the active track is `kind === 'podcast'`, persist `audio.currentTime` as `playbackPosition`, and when `audio.currentTime >= duration - 15` (or on `ended`), set `played = true`.

3. **Offline Enclosure Downloading into IndexedDB**:
   - *Observation 3* shows `audioLibrary().put(track: AudioTrack)` saves into IndexedDB store `'tracks'` and triggers `'anf-audio-library-changed'`.
   - *Deduction*: When an episode is downloaded:
     1. `fetch(episode.audioUrl)` retrieves the audio as a `Blob`.
     2. Construct `AudioTrack` with `id: 'podcast:' + episode.id`, `kind: 'podcast'`, `blob`, `duration`, and save via `audioLibrary().put(track)`.
     3. Record `downloadStatus = 'downloaded'` and `localTrackId = 'podcast:' + episode.id` in episode state.
     4. Subsequent playback loads directly from IndexedDB without network requests, satisfying offline-first requirements.
     5. A "Delete download" action calls `library.remove(localTrackId)` and resets `downloadStatus = 'none'`.

4. **Two-Level UI View in `music-hub.ts`**:
   - *Observation 2* shows `tab === 'podcasts'` only renders a flat list.
   - *Deduction*: Introduce a `selectedFeed: PodcastFeed | null = null` state.
     - When `selectedFeed === null`: Render Level 1 (subscriptions grid showing podcast artwork, title, episode count, unplayed count, and click-to-open).
     - When `selectedFeed !== null`: Render Level 2 (feed header with back button `← Back to feeds`, feed description, action buttons "Refresh", "Mark all played", and a list of episodes).
     - Each episode row provides: Play/Resume (showing current position), Download/Remove Download, Mark as Played/Unplayed, and Queue buttons.

5. **Spotube Streaming Audio Integration**:
   - *Observation 4* shows missing streaming contracts.
   - *Deduction*: Implement `windows/src/workspace/streaming-provider.ts`:
     1. Contract `StreamingMetadataProvider`: `searchTracks(query)`, `getTrack(id)`.
     2. Contract `StreamResolver`: `resolveStream(track)`.
     3. Implement `SpotubeStreamService` supporting decoupled search, stream resolution, and offline fallback.
     4. Implement `cacheStreamTrack(library, track, blobOrUrl)` to cache streamed audio chunks/blobs into IndexedDB `coucou-audio`.
     5. Handle offline mode gracefully: if `!navigator.onLine`, search queries cached tracks in IndexedDB, and stream resolution uses cached blobs, displaying non-blocking UI notifications instead of unhandled errors.

---

## 3. Caveats

1. **CORS on Desktop Desktop vs Android WebView**: In desktop browser / web dev mode, fetching remote RSS feeds and audio enclosures from third-party podcast servers may be subject to CORS restrictions if servers do not send `Access-Control-Allow-Origin: *`. In Tauri production and Android host (`AnFAndroid.fetchRss` / `MediaBridge`), native request bypasses CORS. For offline test suites, mock RSS XML and mock blobs should be used.
2. **Storage Quotas**: Storing large podcast enclosures in IndexedDB consumes device storage. A quota check or display of downloaded file size (via `enclosureLength` or `blob.size`) is recommended, and the user must be able to remove downloaded episodes.
3. **AudioTrack Type Compatibility**: `AudioTrack` in `windows/src/workspace/audio-library.ts` is referenced across `audio-studio.ts`, `music-hub.ts`, and `native-music-player.ts`. Modifying `AudioTrack` to keep `blob: Blob` while adding optional `streamUrl?: string` and `coverUrl?: string` maintains 100% backward compatibility and compiles cleanly under TypeScript strict mode.

---

## 4. Conclusion & Actionable Implementation Plan

### Architecture Overview

```
               ┌────────────────────────────────────────────────────────┐
               │              Music Hub UI (music-hub.ts)               │
               │  - Tabs: Music, Audiobooks, Podcasts, Streaming, etc.  │
               │  - Level 1: Subscriptions Grid                         │
               │  - Level 2: Feed Detail & Episodes List                │
               │  - Resume from playbackPosition                        │
               └──────────────┬──────────────────────────┬──────────────┘
                              │                          │
              ┌───────────────▼─────────┐      ┌─────────▼──────────────┐
              │ podcast-feeds.ts        │      │ streaming-provider.ts  │
              │ - Full RSS Parser       │      │ - Spotube Stream Svc   │
              │   (enclosures, pubDate) │      │ - Decoupled Metadata   │
              │ - Episode state store   │      │ - Stream Resolution    │
              │ - Enclosure Downloader  │      │ - Offline Degradation  │
              └───────────────┬─────────┘      └─────────┬──────────────┘
                              │                          │
                              └───────────┬──────────────┘
                                          │
                        ┌─────────────────▼─────────────────┐
                        │ audio-library.ts (coucou-audio)   │
                        │ - Tier 2: IndexedDB 'tracks'      │
                        │ - Cached Audio Blobs              │
                        │ - Persistent 4-tier storage       │
                        └───────────────────────────────────┘
```

### Concrete Module Designs & Diffs

#### 1. `windows/src/workspace/podcast-feeds.ts`
Expand `PodcastEpisode`, `PodcastFeed`, add enclosure length/type parsing, robust duration parsing, episode state persistence (`anf-podcast-episode-states`), and enclosure downloader into `audioLibrary`:

```typescript
// Proposed additions to windows/src/workspace/podcast-feeds.ts
export type EpisodeDownloadStatus = 'none' | 'downloading' | 'downloaded' | 'error';

export type PodcastEpisode = {
  id: string;
  feedUrl: string;
  title: string;
  summary: string;
  audioUrl: string;
  localAudioPath?: string;
  localTrackId?: string;
  duration?: number; // seconds
  published?: string;
  played: boolean;
  playbackPosition: number; // seconds
  downloadStatus: EpisodeDownloadStatus;
  enclosureLength?: number;
  enclosureType?: string;
  image?: string;
  episodeNo?: number;
  seasonNo?: number;
  link?: string;
};

export type PodcastFeed = {
  id: string;
  title: string;
  url: string;
  description?: string;
  image?: string;
  link?: string;
  author?: string;
  episodes: PodcastEpisode[];
  updated: number;
};

// Robust duration parser for itunes:duration (HH:MM:SS, MM:SS, seconds)
export function parseDuration(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const num = Math.round(Number(trimmed));
    return num >= 0 ? num : undefined;
  }
  const parts = trimmed.split(':').map(p => Number(p.trim()));
  if (parts.some(n => !Number.isFinite(n) || n < 0)) return undefined;
  return parts.reduce((total, part) => total * 60 + Math.round(part), 0);
}

// Persistent Episode State Storage
const EPISODE_STATE_KEY = 'anf-podcast-episode-states';

export type EpisodeState = {
  played?: boolean;
  position?: number;
  downloadStatus?: EpisodeDownloadStatus;
  localTrackId?: string;
  lastUpdated?: number;
};

export function loadEpisodeStates(): Record<string, EpisodeState> {
  try {
    return JSON.parse(localStorage.getItem(EPISODE_STATE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveEpisodeState(episodeId: string, patch: Partial<EpisodeState>): void {
  try {
    const states = loadEpisodeStates();
    states[episodeId] = { ...states[episodeId], ...patch, lastUpdated: Date.now() };
    localStorage.setItem(EPISODE_STATE_KEY, JSON.stringify(states));
  } catch {
    // Graceful fallback if storage quota exceeded
  }
}

export function markEpisodePlayed(episodeId: string, played: boolean): void {
  saveEpisodeState(episodeId, { played, position: played ? 0 : undefined });
}

export function updateEpisodePosition(episodeId: string, position: number): void {
  saveEpisodeState(episodeId, { position: Math.max(0, position) });
}

// Full RSS parsing with enclosures, length, type, pubDate, itunes metadata
export function parseRss(xml: string, feedUrl: string): PodcastFeed {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const channel = doc.querySelector('channel');
  const title = text(channel, 'title') || new URL(feedUrl).hostname;
  const description = strip(text(channel, 'description') || text(channel, 'itunes\\:summary') || '');
  const image = channel?.querySelector('image url')?.textContent?.trim()
    || channel?.querySelector('itunes\\:image, image')?.getAttribute('href')
    || undefined;
  const link = text(channel, 'link') || undefined;
  const author = text(channel, 'itunes\\:author') || text(channel, 'author') || undefined;

  const states = loadEpisodeStates();
  const episodes: PodcastEpisode[] = [];

  doc.querySelectorAll('item').forEach((item, index) => {
    const enclosure = item.querySelector('enclosure');
    const audioUrl = enclosure?.getAttribute('url') || '';
    if (!audioUrl) return;

    const lengthAttr = enclosure.getAttribute('length');
    const enclosureLength = lengthAttr && /^\d+$/.test(lengthAttr.trim()) ? Number(lengthAttr.trim()) : undefined;
    const enclosureType = enclosure.getAttribute('type')?.trim() || undefined;

    const durationRaw = text(item, 'itunes\\:duration') || text(item, 'duration');
    const guid = text(item, 'guid') || `${feedUrl}#${index}`;
    const epImage = item.querySelector('itunes\\:image, image')?.getAttribute('href') || image;
    const epNo = Number(text(item, 'itunes\\:episode')) || undefined;
    const seasonNo = Number(text(item, 'itunes\\:season')) || undefined;

    const state = states[guid] || {};

    episodes.push({
      id: guid,
      feedUrl,
      title: text(item, 'title') || `Episode ${index + 1}`,
      summary: strip(text(item, 'description') || text(item, 'itunes\\:summary') || text(item, 'content\\:encoded') || ''),
      audioUrl,
      duration: parseDuration(durationRaw),
      published: text(item, 'pubDate') || undefined,
      played: Boolean(state.played),
      playbackPosition: typeof state.position === 'number' ? state.position : 0,
      downloadStatus: state.downloadStatus || 'none',
      localTrackId: state.localTrackId,
      enclosureLength,
      enclosureType,
      image: epImage,
      episodeNo: epNo,
      seasonNo,
      link: text(item, 'link') || undefined,
    });
  });

  return {
    id: feedUrl,
    title,
    url: feedUrl,
    description,
    image,
    link,
    author,
    episodes: episodes.slice(0, 300),
    updated: Date.now(),
  };
}

// Download Enclosure into audioLibrary (IndexedDB 'coucou-audio')
export async function downloadPodcastEnclosure(
  library: { put: (t: any) => Promise<void>; remove: (id: string) => Promise<void> },
  episode: PodcastEpisode,
  feedTitle: string
): Promise<{ trackId: string; blob: Blob }> {
  saveEpisodeState(episode.id, { downloadStatus: 'downloading' });
  try {
    const res = await fetch(episode.audioUrl);
    if (!res.ok) throw Error(`Enclosure download failed (${res.status})`);
    const blob = await res.blob();
    const trackId = 'podcast:' + episode.id;
    await library.put({
      id: trackId,
      title: episode.title,
      artist: feedTitle,
      name: episode.title,
      album: feedTitle,
      kind: 'podcast',
      blob,
      duration: episode.duration,
      format: episode.enclosureType || blob.type || 'audio/mpeg',
      created: Date.now(),
    });
    saveEpisodeState(episode.id, { downloadStatus: 'downloaded', localTrackId: trackId });
    return { trackId, blob };
  } catch (e) {
    saveEpisodeState(episode.id, { downloadStatus: 'error' });
    throw e;
  }
}

export async function removeDownloadedPodcast(
  library: { remove: (id: string) => Promise<void> },
  episodeId: string
): Promise<void> {
  const state = loadEpisodeStates()[episodeId];
  if (state?.localTrackId) {
    await library.remove(state.localTrackId);
  }
  saveEpisodeState(episodeId, { downloadStatus: 'none', localTrackId: undefined });
}
```

#### 2. `windows/src/workspace/audio-library.ts`
Enhance `AudioTrack` with optional `streamUrl` and `coverUrl`:
```typescript
export type AudioTrack = TrackMetadata & {
  id: string;
  title: string;
  artist: string;
  name: string;
  importPath?: string;
  blob: Blob;
  streamUrl?: string;
  coverUrl?: string;
  created: number;
  duration?: number;
  wave?: number[];
  sampleRate?: number;
  kind?: MediaKind;
  chapters?: { title: string; start: number }[];
};
```

#### 3. New File `windows/src/workspace/streaming-provider.ts`
Decoupled streaming metadata search and audio stream resolution contract:
```typescript
export interface StreamTrackMetadata {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number; // seconds
  artworkUrl?: string;
  source: 'spotube' | 'spotify' | 'public' | 'custom';
  streamUrl?: string;
  isrc?: string;
  year?: number;
}

export interface ResolvedAudioStream {
  streamUrl: string;
  mimeType?: string;
  bitrate?: number;
  expiresAt?: number;
  blob?: Blob;
  cached?: boolean;
}

export interface StreamingMetadataProvider {
  searchTracks(query: string, options?: { limit?: number }): Promise<StreamTrackMetadata[]>;
  getTrack(id: string): Promise<StreamTrackMetadata | null>;
}

export interface StreamResolver {
  resolveStream(track: StreamTrackMetadata): Promise<ResolvedAudioStream | null>;
}

export class SpotubeStreamService implements StreamingMetadataProvider, StreamResolver {
  private cacheKey = 'anf-spotube-cached-tracks';

  isOnline(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true;
  }

  async searchTracks(query: string, options?: { limit?: number }): Promise<StreamTrackMetadata[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    // Offline graceful degradation: search cached tracks
    if (!this.isOnline()) {
      return this.getCachedTracks().filter(t =>
        t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
      );
    }

    try {
      // Query search endpoint (e.g., iTunes / public streaming metadata proxy)
      const res = await fetch(`https://itunes.apple.com/search?media=music&entity=song&term=${encodeURIComponent(q)}&limit=${options?.limit || 25}`);
      if (!res.ok) throw Error(`Search returned status ${res.status}`);
      const data = await res.json();
      const results: StreamTrackMetadata[] = (data.results || []).map((item: any) => ({
        id: String(item.trackId || item.collectionId || crypto.randomUUID()),
        title: item.trackName || 'Unknown Title',
        artist: item.artistName || 'Unknown Artist',
        album: item.collectionName || undefined,
        duration: item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : undefined,
        artworkUrl: item.artworkUrl100 || item.artworkUrl60 || undefined,
        source: 'spotube',
        streamUrl: item.previewUrl || undefined,
      }));

      // Cache successful query metadata for offline lookup
      this.saveCachedTracks(results);
      return results;
    } catch {
      // Network failure fallback
      return this.getCachedTracks().filter(t =>
        t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
      );
    }
  }

  async getTrack(id: string): Promise<StreamTrackMetadata | null> {
    const cached = this.getCachedTracks().find(t => t.id === id);
    return cached || null;
  }

  async resolveStream(track: StreamTrackMetadata): Promise<ResolvedAudioStream | null> {
    if (track.streamUrl) {
      return {
        streamUrl: track.streamUrl,
        mimeType: 'audio/mp4',
        cached: false,
      };
    }
    return null;
  }

  getCachedTracks(): StreamTrackMetadata[] {
    try {
      return JSON.parse(localStorage.getItem(this.cacheKey) || '[]');
    } catch {
      return [];
    }
  }

  saveCachedTracks(newTracks: StreamTrackMetadata[]): void {
    try {
      const existing = this.getCachedTracks();
      const map = new Map(existing.map(t => [t.id, t]));
      for (const t of newTracks) map.set(t.id, t);
      localStorage.setItem(this.cacheKey, JSON.stringify(Array.from(map.values()).slice(0, 500)));
    } catch {}
  }
}

// Offline Caching of Streamed Audio into IndexedDB 'coucou-audio'
export async function cacheStreamTrack(
  library: { put: (t: any) => Promise<void> },
  track: StreamTrackMetadata,
  streamBlobOrUrl: Blob | string
): Promise<void> {
  let blob: Blob;
  if (typeof streamBlobOrUrl === 'string') {
    const res = await fetch(streamBlobOrUrl);
    if (!res.ok) throw Error(`Stream audio download failed (${res.status})`);
    blob = await res.blob();
  } else {
    blob = streamBlobOrUrl;
  }

  await library.put({
    id: 'stream:' + track.id,
    title: track.title,
    artist: track.artist,
    name: track.title,
    album: track.album || 'Streaming',
    kind: 'music',
    blob,
    duration: track.duration,
    format: blob.type || 'audio/mp4',
    created: Date.now(),
  });
}
```

#### 4. `windows/src/workspace/music-hub.ts`
1. Add `let selectedFeed: PodcastFeed | null = null;`
2. Update `select(track: AudioTrack, play=true, position=0)`:
   - If `track.blob && track.blob.size > 0`: `source = URL.createObjectURL(track.blob);`
   - Else if `track.streamUrl`: `source = track.streamUrl;`
   - Add `loadedmetadata` event listener:
     ```typescript
     const onLoaded = () => {
       if (pending > 0 && Number.isFinite(pending)) {
         audio.currentTime = pending;
       }
     };
     audio.addEventListener('loadedmetadata', onLoaded, { once: true });
     ```
3. Update `timeupdate` handler:
   ```typescript
   if (current?.kind === 'podcast') {
     updateEpisodePosition(current.id, audio.currentTime);
     if (audio.currentTime >= (duration() - 15)) {
       markEpisodePlayed(current.id, true);
     }
   }
   ```
4. In `render()` when `tab === 'podcasts'`:
   - If `selectedFeed === null`:
     - Render Level 1 subscriptions grid:
       - Top bar: "Add feed", "Refresh all feeds", subscriptions count.
       - Grid: Podcast card with cover image, title, episode count, unplayed count. Clicking card sets `selectedFeed = f; render();`.
   - If `selectedFeed !== null`:
     - Render Level 2 feed detail:
       - Header: "← Back to all feeds", podcast title, description, "Refresh feed", "Mark all played", "Unsubscribe".
       - Episode list:
         - Each episode displays:
           - Title, pubDate, duration badge.
           - Play/Resume button: if `episode.playbackPosition > 0` and not played, display `Resume (${durationText(episode.playbackPosition)})`.
           - Played / Unplayed status badge and toggle button.
           - Download button: "Download offline" / "Downloading..." / "Delete download" using `downloadPodcastEnclosure` and `removeDownloadedPodcast`.
           - Clicking play creates an `AudioTrack` (using cached local track from `audioLibrary` if downloaded, or streamUrl with placeholder blob if online), and calls `select(track, true, episode.playbackPosition)`.
5. Add 'Streaming' tab:
   - Includes search input querying `SpotubeStreamService`.
   - Shows online search results with "Play Stream" and "Save Offline".
   - Shows offline cached tracks section from `audioLibrary` when offline.

#### 5. `windows/src/workspace/music-hub.css`
Add styling for the two-level podcast views and streaming controls:
- `.music-feed-grid` (responsive grid matching `.music-grid`)
- `.music-feed-card` (compact card with cover art, badge, hover state)
- `.music-feed-detail` (feed header with large artwork and metadata)
- `.music-feed-back` (back button with arrow)
- `.music-episodes-list` (stacked episode cards)
- `.music-episode-card` (episode title, description, duration, actions)
- `.music-episode-actions` (play, download, mark-played action row)
- `.music-stream-panel` (streaming search and offline indicator)

---

## 5. Verification Method

To verify these changes independently:

1. **Unit Test Suite Execution**:
   Run the Node.js test runner in `windows/`:
   ```powershell
   cd C:\Users\mwali\.gemini\antigravity\scratch\AnF\windows
   npm test
   ```
   **Pass Condition**: All unit tests (including `lyrics-provider.test.ts`, `podcast-feeds.test.ts`, and `streaming-provider.test.ts`) must pass with 0 failures.

2. **TypeScript Compilation & Type Safety**:
   Verify type checking with Node memory option:
   ```powershell
   cd C:\Users\mwali\.gemini\antigravity\scratch\AnF\windows
   $env:NODE_OPTIONS="--max-old-space-size=4096"
   .\node_modules\.bin\tsc.cmd --noEmit
   ```
   **Pass Condition**: Command exits with code 0 and outputs no type errors.

3. **Behavioral Invalidation Conditions**:
   - `parseDuration` failing on `MM:SS` or `HH:MM:SS` or decimal seconds.
   - Enclosures missing `length` or `type` in parsed episodes.
   - Resuming podcast episode failing to seek `audio.currentTime` to saved `playbackPosition`.
   - Downloaded podcast enclosure failing to save or retrieve from IndexedDB `coucou-audio`.
   - Offline streaming search throwing unhandled errors instead of falling back to cached tracks.
