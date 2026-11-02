# Sleep timer: "End of chapter"

Status: implemented on `feat/sleep-end-of-chapter`.

## Why
`docs/MUSIC-HUB-STREAMING.md` (Phase 3, "Sleep Timer Extensions") lists "End of Chapter" for the audiobook sleep timer. The player already stores chapter markers (`AudioTrack.chapters`, filled from M4B metadata by `audio-metadata.ts`) and shows a Chapters list, but the sleep timer only offers fixed minutes or "End of track". Falling asleep to a long audiobook means the timer either cuts mid-chapter or runs to the end of the whole book.

## Behaviour
- New option "End of chapter" in the Sleep select and a "Chapter" chip next to "End".
- Arming computes the end of the chapter containing the playback position: the start of the next chapter, or the track duration for the last chapter.
- Playback pauses when the position reaches that point (0.3 s tolerance so a coarse `timeupdate` cannot overshoot). The select and chips return to Off and the status line says so.
- If the user seeks forward past the armed point (more than 1.5 s beyond it), the timer re-arms on the chapter they landed in instead of stopping at once. Seeking backward keeps the armed point.
- No chapters on the current track: falls back to "End of track" and says so in the status line.
- Changing track, picking another sleep option, suspending the player: the chapter timer is cleared.

## Non-goals
Custom minutes, any change to existing options, layout or styling, the data model, storage, network.

## Design
- Pure logic in `windows/src/workspace/sleep-timer.ts` (`chapterEndAt`, `chapterSleepStep`), unit-tested in `windows/tests/sleep-timer.test.ts`.
- Wiring in `music-hub.ts` reuses the existing select, chip class (`music-chip`) and status `report()`.
- Playwright fixture `scripts/app-qa/sleep-chapter.mjs` drives the built workspace with a synthetic WAV carrying chapter markers.

## Decisions made without asking
- Picked this over other gaps because it is documented, has an existing data model (chapters) and touches no vault, crypto or network code.
- Chip label is "Chapter" (the chip row is narrow; the select carries the full "End of chapter").
- No persistence: like the other sleep timers it is session-only.
- Tolerance values (0.3 s stop, 1.5 s re-arm) are chosen to be larger than a `timeupdate` interval (about 250 ms) and smaller than any real seek gesture (Forward 30s / Back 15s).
- Chapters are sorted by start before use, because tags are not guaranteed ordered.
