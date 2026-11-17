# Phase 1 brief: Ears (listening on the PC)

Version 0.2.x. Starts only after Phase 0 has passed on the owner's PC. Each step is one pull request. Claude design review (a fresh subagent) is required on every pull request in this phase.

Why: the browser's recogniser sends audio to Microsoft's online service, fails with "network" errors, has no wake-word engine (11 misheard spellings of "Kevo" in the code), and sometimes never confirms words. See `docs/KEVO-PLAN.md`.

Phase 1 is done when, on the owner's PC, the self-test shows: at least 19 of 20 "Kevo" clips wake Kevo; at most 1 false wake in the look-alike and background clips; the five Phase 0 checks pass; and listening makes no network request (step 1.4).

## 1.1 Build check

Add the official `sherpa-onnx` crate (static linking, the default on Windows: https://docs.rs/sherpa-onnx) to `windows/src-tauri` behind a cargo feature `kevo-ears`, on in release builds. Add one Rust test that runs voice activity detection on a WAV from `resources/kevo-selftest/`. It must pass in the `Windows` and `Linux` workflows. Nothing user-facing changes in this step.

## 1.2 Models

Three models, downloaded on first use through AnF's existing checked download (`model_download`: pinned URL, size and SHA-256, resumable). They are never put in the installer.
- voice activity detection: Silero VAD
- wake word: a sherpa-onnx English open-vocabulary keyword-spotting model, for example `sherpa-onnx-kws-zipformer-gigaspeech-3.3M`. The keyword file holds "KEVO" and "HEY KEVO" with a boosting score and threshold, tuned in 1.4 (https://k2-fsa.github.io/sherpa/onnx/kws/index.html)
- transcription: a sherpa-onnx streaming English zipformer, small enough to keep up on a 4-core CPU

Before adding each model, record in the pull request its exact file, size, SHA-256, source URL and licence. Use only models whose licence allows shipping in a public app.

## 1.3 Listening pipeline

In Rust: microphone capture (`cpal`) at 16 kHz mono, then VAD, then the keyword spotter, then streaming transcription. Transcription runs only while VAD hears speech.

Events to the web view: `kevo-ears-wake`, `kevo-ears-partial`, `kevo-ears-final`, `kevo-ears-error`.

In TypeScript, add `KevoEarsListener` with the same public interface as `JarvisVoiceListener` (start, stop, setMuted, keepAwake, isAwake, callbacks). `jarvis-command-desk.ts` then only chooses which class to construct.

A setting "Hearing: on this PC (recommended) / browser (old)" defaults to on this PC. The browser option stays for one release, then is removed in Phase 2.

The microphone still rests while Kevo speaks (`setMuted`). The settle and follow-up rules carry over from `jarvis-voice-listener.ts`, with their tests.

## 1.4 Audio tests in CI

Extend the synthetic clips (Phase 0 step 0.4): 20 "Kevo" and "Hey Kevo" clips in at least 4 voices, 10 look-alike words ("cave", "Kevin", "carbo", "heavy"…), 3 minutes of ordinary speech without the name, and the 10 Phase 0 requests.

A Rust test feeds them through the pipeline from WAV, with no microphone, and checks: wake rate, false wakes, transcription of the requests against `clips.json`, and that no network call is made (for example run with no proxy and an unreachable network, and confirm it still works). Tune the keyword boosting and threshold here, and record the chosen values and the measured rates in the pull request.

## 1.5 Self-test on the PC

The Phase 0 self-test gains the 20 wake clips, the look-alikes and 1 minute of background speech, played through the speakers. It reports wake rate, false wakes and idle CPU (average over 60 s of silence) in `selftest-<version>.json`.
