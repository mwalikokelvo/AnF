# Kevo plan

Owner-approved on 16 November 2026. Every assistant working on Kevo follows this plan and the roles below.
The owner's working copy lives in Claude; this file is the copy all assistants read. Update it by pull request.

## Summary

Kevo becomes a personal assistant that remembers, acts on a schedule, and checks its own work. It is built in six
phases, and **nothing new is built until the previous phase has run on the owner's PC with a real microphone**.

Settled: the name and wake word are "Kevo"; the 13 voices ship inside the app; Kevo's everyday brain runs on the PC.

## Where Kevo stands (0.1.53)

| Area | State |
| --- | --- |
| Wake word, listening, speaking | Built. Self-answering loop fixed in 0.1.52; untested with a real microphone |
| Quick commands (time, date, sums, timers, notes, music, opening apps, web search) | Built; opening apps has never run on Windows |
| AI answers | Short and streamed (`kevo_ask`). CI measured 0.3 s to first words with the small model; the PC is unmeasured |
| Voices | 13 recordings built in. Replies are spoken by a Windows voice, not by the recordings |
| Memory | Only the last few exchanges. Nothing lasting about the owner |
| Scheduled work | Timers only, lost when the app closes |
| Team cards (Tom, Scout, Support) | Show made-up numbers |
| Android | No Kevo screen |

## Phases

Each phase ends with a test on the PC. The next phase does not start until that test passes.

| Phase | Delivers | Test on the PC | Done when |
| --- | --- | --- | --- |
| 0. Prove what exists | Nothing new. Install 0.1.53, fix what fails | Ask three things in a row, open an app, set a timer, type a request, press Stop | All five work, or each failure is fixed and retested |
| 1. Memory | Remembers facts the owner tells it and recent requests across restarts; a screen lists them, with delete | Tell Kevo two facts, restart, ask. Delete one, ask again | Recalls after restart; forgets what was deleted |
| 2. Scheduled work | Reminders and a daily briefing that survive a restart and fire while AnF is open | Set a 5-minute reminder, restart, wait | Fires once, on time |
| 3. Verified actions | After opening an app, saving a note or starting music, Kevo checks it happened and reports failure plainly | Ask for an app that is not installed; save a note with the folder missing | Kevo says it failed and why, never "done" |
| 4. A better brain | The largest local model the PC runs well, plus an optional cloud model with a spending cap | Five harder questions on each setting, timed | Owner judges answers better; first sentence in under 5 s |
| 5. Real team, real voices | Team cards show real information or are removed; replies in the pack's own voices if the voice model can be shipped | Compare a reply in "Kevo (Gentle Bass)" with the recording | Owner accepts the voice; no invented numbers remain |

After Phase 5: Kevo on Android, and the voices in ThingsBook.

## Who does what

| Assistant | Role for Kevo |
| --- | --- |
| Claude | Plans each phase, hard bugs, final review and merge |
| Antigravity (Google Pro) | Main builder of each phase, from Claude's task brief |
| Gemini Pro | Watches the owner's screen recordings and writes up what went wrong; research |
| Codex (ChatGPT Business) | Reviews every pull request; second builder for Rust and TypeScript |
| Cursor (free, via OmniRoute), Hermes, DeepSeek | Small, clearly defined tasks: tests, wording, renames |
| Grok bot | Second opinions and ideas. No pushes |
| GitHub bot | Suggestions inside pull requests |

## Rules for every assistant

1. **Never push to `main`.** It is locked on GitHub. Work on your own branch (`<assistant>/<topic>`) and open a pull request.
2. **One phase at a time, from a task brief.** Do not start a later phase or add features the brief does not name.
3. **A pull request merges only when** its checks are green, Codex's review findings are answered, and Claude has reviewed it.
4. **Say what was tested and how.** "Compiled", "automated tests", "browser fixture" and "installed on the PC" are different claims.
5. **Append your result to `HANDOFF.md`** in the same pull request.

## Open decisions (owner)

- PC memory (RAM) and graphics card, to choose the local model for Phase 4
- Phase 4: whether an optional cloud model is wanted, and its monthly spending cap
- Phase 5 and ThingsBook: the folder holding `model.safetensors`, and whether cloned voices go into public or private builds only
