## 2026-10-31T02:52:39Z

Objective:
Implement Milestone M1: Media & Music Hub Integration on branch feat/mkr-music-integration.
You must synthesize and implement all recommendations from the 3 Explorer handoff reports:
- Area 1 (Audio Player Engine & Controls): C:\Users\mwali\.gemini\antigravity\scratch\AnF\.agents\teamwork\teamwork_explorer_m1_1\handoff.md
- Area 2 (LRCLIB Synced Lyrics & Caching): C:\Users\mwali\.gemini\antigravity\scratch\AnF\.agents\teamwork\teamwork_spec_miner_m1_2\handoff.md
- Area 3 (AntennaPod Podcasts & Spotube Streaming): C:\Users\mwali\.gemini\antigravity\scratch\AnF\.agents\teamwork\teamwork_explorer_m1_3\handoff.md

Exclusive Write Ownership:
You exclusively own and may edit the following files:
- shared/audio/queue.ts
- windows/src/workspace/music-hub.ts
- windows/src/workspace/music-hub.css
- windows/src/workspace/lyrics-provider.ts
- windows/src/workspace/podcast-feeds.ts
- windows/src/workspace/streaming-provider.ts
- windows/src/workspace/audio-library.ts
- windows/tests/podcast-feeds.test.ts
- windows/tests/streaming-provider.test.ts
- windows/tests/audio-player.test.ts
- windows/scripts/test.mjs

Specific Implementation Tasks:
1. shared/audio/queue.ts:
   - Implement `previousTrack(ids, current, repeat)` with proper handling for repeat: 'off', 'track', 'all'.
   - Implement helper queue functions: `enqueueTrack`, `playNextTrack`, `playPreviousTrack`, `removeTrack`.
2. windows/src/workspace/music-hub.ts:
   - Introduce `type PlaybackState = 'idle' | 'buffering' | 'ready' | 'playing' | 'paused' | 'ended' | 'error'`.
   - Implement explicit `stop()` method to pause, reset currentTime=0, set idle state, and clear mediaSession.
   - Attach audio event listeners for `loadstart`, `waiting`, `canplay`, `playing`, `pause`, `ended`, and `error` (handling MediaError decode/src/network codes).
   - Re-apply `prefs.speed` on track change / `loadedmetadata` (preventing silent reset to 1.0x).
   - Seek to `pending` playback position on `loadedmetadata` (fixing resume from saved position).
   - Handle `track.streamUrl` in `select()` for remote audio streams and cached blobs.
   - Clean up mediaSession on `suspend()` and `stop()` to prevent collision with Audio Studio.
   - Support two-level Podcast navigation (Subscriptions Grid -> Feed Details & Episode List with play, resume, download, and mark-played controls).
   - Update `playOnLockScreen` for Android to use operation `'play_remote'` for remote podcast URLs.
3. windows/src/workspace/lyrics-provider.ts & music-hub.css:
   - Fix `primaryArtist`: regex split on `/\s*(?:feat\.|ft\.|&|\bx\b|,|\/|;)\s*/i` to preserve separator precedence.
   - In `fetchOnlineLyrics`, support duration matching with ±5s tolerance on fallback search.
   - Add network timeout / AbortSignal (5000ms) and `navigator.onLine` check to avoid hanging offline.
   - In `music-hub.css`, replace hard-coded `#79e4b4` green with dynamic theme variable `var(--accent, #79e4b4)` for active lyrics glow.
4. windows/src/workspace/podcast-feeds.ts:
   - Expand `PodcastEpisode` and `PodcastFeed` interfaces per PROJECT.md.
   - Expand `parseRss` to capture enclosure `length`, `type`, `pubDate`, `itunes:image`, `itunes:duration`.
   - Implement robust `parseDuration(value)` handling HH:MM:SS, MM:SS, and seconds.
   - Implement persistent episode states (`loadEpisodeStates`, `saveEpisodeState`, `markEpisodePlayed`).
5. windows/src/workspace/streaming-provider.ts:
   - Create decoupled streaming metadata and resolver services (`StreamingMetadataProvider`, `StreamResolver`, `SpotubeStreamService`) with offline cache fallback.
6. windows/src/workspace/audio-library.ts:
   - Support optional `streamUrl?: string` and `coverUrl?: string` on `AudioTrack` while preserving `blob: Blob` for compatibility with Audio Studio.
7. Verification & Tests:
   - Update `windows/scripts/test.mjs` to execute all unit tests in `windows/tests/*.test.ts`.
   - Run tests:
     `cd windows && npm test`
     `cd windows && node scripts/test-e2e.mjs`
     `cd windows && npx tsc --noEmit`
     `cd windows && npx vite build`
     `node scripts/check-release.mjs`
     `node scripts/check-styles.mjs windows/dist`
   All must pass with exit code 0!
