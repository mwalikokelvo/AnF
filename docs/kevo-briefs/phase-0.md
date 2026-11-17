# Phase 0 brief: close Phase 0, and make Kevo testable without the owner

Version 0.1.57 onward. Each step below is one pull request, merged in order. Read `docs/KEVO-MAP.md` first.

Phase 0 is done when the self-test on the owner's PC passes all five Phase 0 checks (step 0.5) on one build.

## 0.1 Kevo's log

Every event is one JSON line, appended through a new Tauri command `kevo_log_append` to `kevo/kevo-log.jsonl` in AnF's app data folder. The file is cut back to the newest 2,000 lines when it passes 3,000. Nothing leaves the PC.

Record:
- microphone on or off; recognition errors with their code
- every final phrase heard. For one that was ignored, the reason: `no_wake_word`, `window_closed`, `muted`, `own_voice`
- wake word heard
- each request: text, `actionName`, reply, ms from heard to the first word spoken
- timers set and fired; Stop pressed

For ignored phrases, add `onIgnored(text, reason)` to `JarvisVoiceListener` (today `handleFinalTranscript` returns early) and report `own_voice` from `handleCommand` in `jarvis-command-desk.ts`.

Add "Save log" (copies the file to Downloads as `kevo-log-<version>.jsonl`) and "Open log folder" buttons to the voice bar, in the existing button style.

Tests: an ignored phrase and an answered request each write one line; trimming keeps the newest lines.

## 0.2 Phrase list

`windows/tests/kevo-phrases.json` is a list of `{ "say": "...", "expect": "<actionName or actionName+actionName>", "source": "session 1|2|3|variant" }`. Include every request from the session 1, 2 and 3 reports in the owner's exact words (`tests/kevo-phase0-session2.test.ts` and `kevo-phase0-session3.test.ts` hold most of them), and at least 60 variations: polite forms, chains, follow-ups, misheard "Kevo".

A node test runs every entry through `JarvisVoiceAgent` with fake actions and prints the pass rate. Phase 0 requires 100% on owner phrases and 90% on variants. Phase 2 raises both to 95% with the real model.

## 0.3 Test builds

In `.github/workflows/windows.yml`:
- add a `push` trigger for `main`
- let the `AnF-Windows-portable` and `AnF-Windows-setup` uploads run on pushes to `main` too (today they are skipped on every `push` while `PUBLISH` is false)
- stop `cancel-in-progress` for `main`, so merges that come back to back each get their build
- limit the code-signing step to `windows-v*` tags and manual runs, so a push to `main` never receives the signing secrets
- add a publish job that runs only on a push to `main`, after the build. When no release tagged `kevo-test-v<version>` exists yet (so docs-only merges and merges without a version bump publish nothing), it publishes a GitHub prerelease with that tag, pointing at the merge commit. It carries `AnF-Windows-<version>-kevo-test.zip`, made from the portable folder **without** `local-ai/model.gguf` and `local-ai/model-fast.gguf` (together about 2.4 GB, over GitHub's 2 GiB limit per file), and its SHA-256. Give it `contents: write` for that job only. Title the release "Kevo test build <version>, not for general use", and say in its notes that Windows Defender may wrongly flag the unsigned build (see the `PUBLISH` note in the workflow).

The owner cleared these test builds for their own PC on 16 Nov 2026 (`docs/KEVO-PLAN.md`, "Decisions on record"). General publishing stays paused (`PUBLISH: 'false'`) until the installer is signed or the Defender detection is cleared.

AnF's normal "Check for updates" already ignores prereleases (`updates.rs` `pick_latest`, with a test). Keep that test.

## 0.4 Self-installing test builds and the self-test

A new setting in AnF Settings, **"Run Kevo test builds and Kevo's self-test automatically"**, is off by default. Only the owner turns it on, once. Nothing is installed: the owner's installed AnF stays as it is, and the test build runs from its own folder. When the setting is on:

1. Every 2 hours, and at start, ask GitHub's public releases API for the newest `kevo-test-v*` prerelease newer than the last one tested.
2. Accept it only if its tag points at a commit on `main` (compare API) and its asset was uploaded by `github-actions[bot]`. Download the portable zip and its SHA-256 from that release only (`https://github.com/mwalikokelvo/AnF/releases/download/...`). Check the SHA-256, and stop on a mismatch.
3. Extract to `~/AnF-Kevo/builds/<version>/`, keeping only the newest two builds there. Record the version as "last tested" before launching it, so a crash cannot cause a retry loop.
4. Start a small detached helper and exit AnF (with its `llama-server`): AnF is a single-instance app. The helper waits until both have exited, starts the test build with `--kevo-selftest`, waits for it to finish and exit, then starts the owner's installed AnF again.
5. A test build has no models in its folder. Under `--kevo-selftest` it uses `model.gguf` and `model-fast.gguf` from the installed AnF's `local-ai` folder (found from AnF's install location), read-only.
6. Under `--kevo-selftest`, AnF never polls for test builds, whatever the setting says (the test build shares the installed app's settings).
7. If the test build cannot start (for example Windows Defender quarantined it), write `selftest-<version>.json` with `"result": "could_not_start"` and the reason, so the autopilot can tell the owner.

`--kevo-selftest` (also a "Run self-test" button on the Kevo screen):
- opens Kevo and turns the microphone on
- turns on **dry-run**: actions are logged as what they would do, never carried out (no app or site opens, no note is saved, no music plays)
- plays each test clip through the speakers while listening with the real microphone. In self-test mode the microphone stays on while a clip plays (it is not Kevo's own voice)
- waits for Kevo's answer, and records what was heard, the action, the reply and timings
- writes `~/AnF-Kevo/selftest-<version>.json` (creating the folder). It holds, per request clip: the clip's id, the expected result, what was heard while that clip played, the action, the reply and timings. For wake, look-alike and background clips it holds counts only (wakes, false wakes), never heard text. It also holds errors, `system_stats` (RAM, CPU) and the graphics card name. This file is published to the public state branch, so nothing heard outside a request clip's playback window goes into it, and the user's home folder in any path is written as `~`
- quits when done (the helper then restarts the owner's AnF)

Test clips: 16 kHz mono WAV files under `windows/src-tauri/resources/kevo-selftest/`, made with a free offline voice (for example Piper) in at least two voices, plus a `clips.json` listing each clip's words and expected result. Generate them with a script kept in `scripts/`, so they can be remade.

## 0.5 The five Phase 0 checks, as self-test scripts

| Check | Clips (in order) | Passes when |
|---|---|---|
| Several requests in a row | "Kevo, what time is it?" then, within the follow-up window, "What can you do?" then "Set a timer for ten seconds" | Three answers, the right actions, no answer to its own voice |
| Open an app | "Kevo, open Brave browser" | Action `open_app` for Brave (dry-run) |
| Timer | the timer above | "Your 10 seconds timer is done" spoken 10 s later (±2 s) |
| Typed request | typed by the self-test: "What can you do?" with the microphone off | The help answer, spoken |
| Stop | "Kevo, tell me about black holes", then Stop pressed 2 s into the reply | Speech ends within 0.5 s and nothing more is said |

Then fix any failure the PC result shows, one round per pull request, until all five pass on one build.
