# Player Library (Music · Audiobooks · Podcasts · Books)

Visual reference: [mkr-music](https://github.com/mkr-infinity/mkr-music) — immersive full-bleed artwork, dark canvas, persistent player. **UI only.** Do not copy its YouTube Music / Spotify / JioSaavn engines.

## Product shape

One library, four kinds:

| Kind | Source | Surface |
| --- | --- | --- |
| **Music** | Local files (MP3, FLAC, M4A, OGG, WAV, OPUS) | Music Hub grid + queue |
| **Audiobook** | Local M4B or long audio; chapter markers when present | Chapter list, resume, speed, sleep timer |
| **Podcast** | RSS feeds the user adds (Substack, Catholic Answers, any enclosure feed) | Episode list, resume, speed |
| **Book** | EPUB, PDF, DOCX, TXT, MD (existing Reader) | Reader + optional Listen |

Streaming (YouTube-style, Spotify-style) stays on the **optional native Spotube** path already in the repo. Local library is the Funkwhale-like private store. No new cloud catalogue is claimed.

## Visual direction (from mkr-music, kept AnF)

- Dark charcoal canvas (`#15191a`) and mint accent (`#79e4b4`) — already in Music Hub.
- Artwork cards with title under the image.
- Persistent dock; tapping opens a full player with large art, progress, transport, queue.
- Tabs: **Music · Audiobooks · Podcasts**. Books stay in Reader; a Listen action there reuses the speech player.

## Podcasts

User pastes an RSS URL. First-class patterns:

- **Substack**: `https://<publication>.substack.com/feed` (audio episodes include enclosures).
- **Catholic Answers**: magazine/blog feeds exist at `https://www.catholic.com/feeds/magazine/rss` and `/feeds/blog/rss`. Audio shows (Catholic Answers Live, Counsel of Trent, etc.) are added as their own podcast RSS when the user has the feed URL. The app does not scrape the website.

Playback is progressive download of the enclosure. Episodes are not copied into the encrypted vault. Background media session is the same path as local music.

## What this is not

- Not a YouTube Music or Spotify client.
- Not a replacement for the Flutter Spotube host.
- Not Funkwhale server hosting — local library only.
- Not automatic discovery of every Catholic Answers or Substack show.

## Implementation order

1. Classify imports (music vs audiobook) and add Podcasts tab + RSS add. **Done.**
2. Sleep timer and speed on the existing player. **Done.**
3. Chapter list for M4B when metadata provides it.
4. Reader “Listen” remembers last sentence (speech player already exists).
5. Device-verify background playback on Android.

## Status

Immersive full player, episode resume, speed, sleep timer, chapters, and native Android RSS fetch are in. Device-verify background playback next.
