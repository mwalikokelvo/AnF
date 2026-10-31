# Personal listening — 0.1.30

Open Audio → Music Hub → **Local library** for these additions. Spotube remains
the automatic online source; these controls operate on the independent local
player and do not require an account or API key.

- Filter by Music, Podcasts or Audiobooks. Open **Import & playback options** to choose a content type before importing,
  or use an item's **More → Details** to change it later. Existing files remain
  music by default. Imports accept audio files up to 500 MB each, within available
  device storage and decoder support.
- Audiobooks and podcast episodes resume their own saved positions when selected
  again. Details includes **Start from beginning**. Restoring the app never
  autoplays. Playback speed and sleep controls are in **Import & playback options**. Speed persists; sleep timers are session-only.
- Choose Liked items, Recently played or Not played recently to build a queue from
  your actual library. These are transparent filters, not an AI DJ or mood model.
- Add an item to the queue from **More**. Open the full player from its title,
  then **Show queue** to move or remove items. The current item cannot be removed.
  Reordering disables shuffle and saves the edited queue.
- Use **Details → Add your timed lyrics** to import a local LRC file. A line
  follows playback in the player. Files are bounded to 200 KB and 5,000 timestamps;
  online lyric licensing or automatic fetching is not included. Source audio
  format/rate/bit-depth information appears when embedded in the file.
- **Listening recap** shows this year's local listening time and top items, with
  an explicit clear action. It excludes seek jumps, pauses, Spotube and removed
  items. Long suspended gaps are undercounted rather than estimated.
- **Playlists → Export playlist file** writes a recipe with title, artist and
  filename, not audio bytes. On Windows it uses the existing native documents
  export; Android uses the native export bridge. Import previews matches and
  skipped/ambiguous items and creates a new playlist. Export limit: 200 KB;
  import limit: 2 MB / 10,000 entries. This is file exchange, not live collaboration.

The reader and built-in local tools from previous releases remain available.
The complete capability/dependency matrix is in
[LISTENING-CAPABILITIES.md](LISTENING-CAPABILITIES.md). Spotify's linked repository
does not contain its app or licensed catalog. AnF does not grant Premium access,
unlimited licensed audiobooks, Spotify Connect, video catalogs or provider
downloads. The existing Spotube provider 401 is not fixed by this local update.

Verification and artifact identities are recorded in the workspace's
`LOCAL-BUILD-STATUS.md` after packaging. Shared Android assets are updated; a new
Android APK is not part of this Windows package. The prior OCR spelling issue and
unavailable Strix runtime remain separate limitations.
