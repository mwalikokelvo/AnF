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

In `.github/workflows/windows.yml`, add a job that runs only on a push to `main`. After the build, it publishes a GitHub prerelease tagged `kevo-test-v<version>` with `AnF-Windows-<version>-setup.exe` and `SHA256SUMS-Windows`. Give it `contents: write` for that job only.

AnF's normal "Check for updates" already ignores prereleases (`updates.rs` `pick_latest`). Keep it that way, and add a test that proves it.

## 0.4 Self-installing test builds and the self-test

A new setting in AnF Settings, **"Install Kevo test builds automatically and run Kevo's self-test"**, is off by default. Only the owner turns it on, once. When it is on:

1. Every 2 hours, and at start, ask GitHub's public releases API for the newest `kevo-test-v*` prerelease newer than the running version.
2. Download its setup file and `SHA256SUMS-Windows` from that release only (`https://github.com/mwalikokelvo/AnF/releases/download/...`). Check the SHA-256, and stop on a mismatch.
3. Run the installer silently (Tauri's NSIS installer takes `/S`; confirm in the Windows CI job), then start AnF with `--kevo-selftest`.

`--kevo-selftest` (also a "Run self-test" button on the Kevo screen):
- opens Kevo and turns the microphone on
- turns on **dry-run**: actions are logged as what they would do, never carried out (no app or site opens, no note is saved, no music plays)
- plays each test clip through the speakers while listening with the real microphone. In self-test mode the microphone stays on while a clip plays (it is not Kevo's own voice)
- waits for Kevo's answer, and records what was heard, the action, the reply and timings
- writes `~/AnF-Kevo/selftest-<version>.json` (creating the folder) and copies the log beside it as `kevo-log-<version>.jsonl`. The JSON also holds `system_stats` (RAM, CPU) and the graphics card name

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
