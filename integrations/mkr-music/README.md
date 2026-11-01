# MKR Music: reference only

[MKR Music](https://github.com/mkr-infinity/mkr-music) by @mkr-infinity is an Android music app licensed under GPL-3.0 (with an extra restriction on its Musixmatch module). AnF is MIT-licensed.

AnF uses MKR Music as a source of **ideas only**: an immersive player, synced lyrics, LRCLIB lookups. AnF contains no MKR Music code, translated or otherwise. Its lyrics support (`windows/src/workspace/lyrics.ts`, `lyrics-provider.ts`) is written for AnF from the LRC format and [LRCLIB's public API documentation](https://lrclib.net/docs).

Rules for contributors and AI agents:

- Do not copy, translate or closely paraphrase MKR Music source, including Kotlin to TypeScript ports, regex lists and other tables.
- Do not vendor, clone or bundle MKR Music into any AnF build. Shipping GPL code would require relicensing the app.
- When an MKR feature is worth having, describe the behaviour you want and implement it independently against public specifications.
