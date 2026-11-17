# Kevo plan

Owner-approved on 16 November 2026 (replaces the plan of the same morning). The owner's copy is the "Kevo master plan" doc in Claude; this file is the copy every assistant reads. It runs on autopilot: `docs/kevo-autopilot/AUTOPILOT.md`.

## Goal

Kevo becomes a personal assistant that hears its name reliably, understands everyday phrasing, does what was asked and checks it happened, remembers, acts on a schedule, and answers in the pack's voices. Windows first, then Android, then ThingsBook. Kevo's hearing and understanding move onto the PC and are rebuilt once, properly, instead of being patched after every test.

Finished means, on the owner's PC (targets, measured from Kevo's log and self-test):
- wakes for "Kevo" at least 19 times in 20; at most 1 false wake in 10 minutes of TV or talk
- everything except web pages and the optional cloud model works offline
- at least 95% of the phrase list handled correctly
- a command starts its reply within 1.5 s, an AI answer within 5 s
- never says "done" when an action failed
- facts and reminders survive a restart
- the owner accepts the voice, or keeps Windows voices

## Why Phase 0 kept failing

1. Hearing is rented: the browser's recogniser in WebView2 uses Microsoft's online service, fails with "network" errors, has no wake-word engine, and sometimes never confirms words.
2. Understanding is a pattern list: every new phrasing needs new code.
3. The AI is never told what Kevo can do.
4. Evidence is second-hand: a video and a write-up, no log.

## Design

Microphone → **Ears** (silence detection, "Kevo" detector, offline transcription: sherpa-onnx in Rust) → **Understanding** (instant commands first, else the local model choosing from a fixed action list by tool calling) → **Hands** (each action checks its result) → **Voice**. **Memory and schedule** are read and written by actions. Every step goes into **Kevo's log**.

## Phases

| Phase | Version | Delivers | Brief | Done when (on the PC) |
|---|---|---|---|---|
| 0. Close Phase 0 | 0.1.57+ | Log, phrase list, test-build prereleases, automatic test builds and self-test | `kevo-briefs/phase-0.md` | Self-test passes the five Phase 0 checks |
| 1. Ears | 0.2.x | Listening on the PC, offline, real wake-word detector | `kevo-briefs/phase-1.md` | 19/20 wakes, at most 1 false wake, Phase 0 checks pass, no network used |
| 2. Understanding | 0.3.x | Tool calling with one action list; Kevo knows itself; instant commands | `kevo-briefs/phase-2.md` | Phrase list 95% in CI; 18/20 varied requests on the PC; commands within 1.5 s |
| 3. Memory | 0.4.x | Facts and recent requests across restarts; list with delete | written when next | Recalls after restart, forgets what was deleted |
| 4. Schedule | 0.4.x | Reminders and a daily briefing that survive a restart | written when next | Each fires once, on time |
| 5. Verified actions | 0.4.x | Each action checks its result | written when next | Never "done" when it failed; reason said |
| 6. Better answers | 0.5.x | Largest local model the PC runs within 5 s | written when next | First sentence within 5 s; harder questions answered better |
| 7. Pack voices, real team | 0.6.x | Pack voices if a voice model can ship; team cards real or removed | **owner decides first** | Owner accepts the voice; no made-up numbers |
| 8. Android, then ThingsBook | 0.7.x | Kevo on the phone; voices in ThingsBook | written when next | Phase 0 checks pass on the phone |

No phase starts before the previous one passed on the PC, with one exception: Phases 3, 4 and 5 are built and merged one after another on CI gates alone, and one PC test after Phase 5 covers all three.

## Who does what

| Who | Role |
|---|---|
| Claude autopilot (scheduled, every 2 hours) | Builds every step from its brief, fixes CI and review findings, merges when the gates pass, writes the next brief |
| Claude "Kevo PC results" (scheduled, on the owner's PC) | Copies the self-test results to the state branch |
| Codex | Reviews every pull request automatically |
| Owner | Once, when step 0.4 ships: installs that build and turns on "Run Kevo test builds and Kevo's self-test automatically" in AnF Settings. Decides Phase 7. Can stop the autopilot at any time (`paused: yes` in `STATE.md` on the branch `kevo-autopilot-state`) |
| Other assistants | Optional: any brief can be handed to Antigravity, Codex or others; they follow the same rules and open pull requests, never merging their own |

## Rules for every assistant

1. Never push to `main` directly. Branch, pull request, merge only when the gates in `AUTOPILOT.md` pass.
2. One brief step per pull request. Nothing the brief does not name.
3. Every fixed request gets a test with the owner's words, and goes into the phrase list.
4. Say what was tested: "compiled", "automated tests", "audio tests" and "installed on the PC" are different claims.
5. Add a `HANDOFF.md` entry; add lessons to `docs/KEVO-MAP.md`.

## Decisions on record (owner, 16 Nov 2026)

- Hearing moves onto the PC (Phase 1).
- RAM and graphics card are read by the self-test.
- No cloud model, no paid services.
- Test audio uses synthetic voices, kept in the repo.
- Autopilot may merge into `main` when every gate passes, and may test on the owner's PC when it is on.
- Kevo test builds (unsigned; Defender has wrongly flagged AnF's installer before) are cleared to run on the owner's PC through AnF's opt-in setting. They are published only as prereleases named "not for general use"; general publishing stays paused.
- Phase 7 (pack voices, `model.safetensors`, public or private cloned voices) waits for the owner.
