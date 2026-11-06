# Regression audit: reader, sync, and voice cache

Date: 2026-11-03, 3:56 PM America/Chicago. Branch `cursor/regression-boundary-audit-8f17`.

Label: **tested on Linux**. Not installed. No screen changed, so there is no screenshot.

## What was reviewed

`windows/tests/` for the modules merged on 2026-11-03: reader navigation and theme, KOReader progress sync, the disk voice cache, synced LRC, and OPDS cover fetch (the network path next to the reader).

Assertions that only echoed a mock were replaced. The lyrics abort test used to throw `AbortError` before the signal fired. It now waits until `AbortSignal` aborts, then checks both LRCLIB URLs. The tier-2 LRC case used to assert only `lines.length >= 1`. It now requires the one valid line at 60 seconds and rejects the lines with illegal seconds.

Reader navigation tests already assert shortcut, focus zone, and open/collapsed transitions. Reader theme tests compute contrast from the stylesheet tokens. Those were left as they are.

## Boundary coverage added

- Voice cache decoding: a frame built in the test (SHA-256, `ANF1`, big-endian length) is what a cache hit returns. FLAC and an ID3v2.3 header round-trip. A 15-byte Ogg page, a RIFF file that is not WAVE, and an HTML body are discarded and synthesized again. Truncation, an extra trailing byte, a zero length, a flipped hash byte, a swapped length endian, and a bad magic byte each miss and are rewritten. 8 MiB is stored; 8 MiB + 1 is refused and leaves no file. Mutating the returned `Uint8Array` does not change the next hit.
- Invalid LRC: seconds 60 and above are dropped; 59.999 is kept. Minutes may pass 59 (`[61:00.00]`, `[120:00]`). A one-digit second, a colon fraction, and `[00:00.000]` parse. A four-digit fraction or four-digit minute is not a stamp. `[offset:+1500]` does not move `parseSyncedLyrics` times. `parseLyrics` still applies that offset to the surviving line. `Infinity` is not an active line.
- Network timeouts: lyrics exact lookup and search each abort on the real 5 second signal (about 10 seconds total) and return undefined. HTTP 408 does not return that response body; the search body is used. HTTP 504 on both hops returns undefined. A KOReader push that throws `AbortError`, or returns 408 or 504, stays queued with the same document, progress, and percentage, and a later drain sends it. OPDS cover URLs that never finish abort, report `timeout`, and write nothing.

## Bug found by the decode test

`isNeuralAudioChunk` compared four characters with `'ID3'`. An ID3 tag is three bytes plus a version byte, so the comparison never matched and a normal ID3v2 header was treated as not audio. The check now matches the three magic bytes. FLAC and OggS were already four-byte magics and were left alone.

## Commands

Both runs were in `windows/` after `npm ci`.

| Run | Command | Result |
|---|---|---|
| 1 | `npm test` | 292 pass, 0 fail |
| 1 | `npm run test:e2e` | 138 pass, 0 fail |
| 2 | `npm test` | 292 pass, 0 fail |
| 2 | `npm run test:e2e` | 138 pass, 0 fail |
| 2 | `npx tsc --noEmit` | exit 0 |

No failure differed between the two runs.

`bash scripts/simplify-code.sh` exited 1. The script starts with a UTF-8 BOM, so line 1 is not a valid shebang, and `npx ponytail-cli` returns npm 404. It did not edit the tree. The `console.log` calls in `windows/tests/tts-cache.test.ts` were removed directly.

Not run: `npm run build`, `cargo test`, an installed app, a live LRCLIB or KOReader server, a live TTS provider.
