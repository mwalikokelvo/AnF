# Neural read-aloud wiring (Phase 5 prep)

## What exists now

- `windows/src/workspace/tts-service.ts` — disk voice cache (`synthesizeChunk`, `VoiceDisk`, `TtsProvider`).
- `windows/src/workspace/neural-speech.ts` — playback glue:
  - `playNeuralSentence` — plays provider/cache audio bytes through `HTMLAudioElement` (blob URL).
  - `createNeuralUtterancePlayer` — sentence loop using `synthesizeChunk` + playback.
  - `registerNeuralSpeechProvider` / `neuralSpeechEnabled()` — feature flag (`localStorage` key `anf-neural-tts=1`) plus a registered provider.
  - `NullTtsProvider` — test stub only; throws if synthesis is attempted.

- `windows/src/workspace/speech-player.ts` — Reader read-aloud tries neural when the flag and a provider are both present; otherwise unchanged system / Android speech.

## Settings UI

Settings includes **Neural read-aloud (experimental)** (`<details>`). The checkbox stays **disabled** until `registerNeuralSpeechProvider` has been called with a real provider (Piper/Kokoro or a Tauri command wrapper). On current `main` nothing registers a provider, so users cannot turn neural on yet.

## Phase 5 (still blocked)

1. Ship an offline neural model provider (Piper, Kokoro, or Rust TTS command).
2. On app startup (Tauri), create a file `VoiceDisk` under the user data directory and call `registerNeuralSpeechProvider({ disk, provider, config })`.
3. Re-enable the Settings checkbox automatically via `neuralSpeechToggleAvailable()`.

No UI restyle is required for Phase 5 beyond optional voice picker copy.

## Tests

`windows/tests/neural-speech.test.ts` — fake provider, in-memory disk, injected audio playback. `windows/tests/tts-cache.test.ts` — cache semantics (unchanged).
