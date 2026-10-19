# Reader asset integration contract

`createReader(...).configureAssets({fonts?, voices?})` registers local assets.
Call after asset discovery; repeat to refresh readiness. It stops active speech
before replacing provider objects. Existing installed offline voices stay visible;
the user chooses a custom voice explicitly. No cloud fallback exists.

Fonts: `{id: string, label: string, family: string}[]`. `family` is the CSS font
family registered by the asset module (for example using FontFace). Reader does
not fetch fonts. Use stable IDs and licensed locally registered font families.

Voices: `SpeechVoiceProvider[]`, exported by
`windows/src/workspace/speech-player.ts`:

```ts
interface SpeechVoiceProvider {
  id: string;
  label: string;
  available: () => boolean;
  unavailableReason?: string;
  speak(text: string, rate: number, callbacks: {
    onBoundary(start: number, end: number): void;
    onEnd(): void;
    onError(reason: string): void;
  }): {stop(): void; pause?(): void; resume?(): void};
}
```

All boundary offsets are UTF-16 indices relative to the supplied `text`, end
exclusive. Only report real engine boundaries; omit if unavailable. Reader renders
exact sentence highlighting in that case. Invalid or stale callbacks are ignored.
`onEnd` must occur when playback actually ends, not when synthesis finishes.
`stop()` must cancel synthesis/playback and release resources; callback tokens
prevent stale events from advancing text. Keep work local. No external model API
may be called. Availability false disables that option and presents the reason.
A reference recording alone must not return true.

Provide pause and resume together only if genuine pause/resume works. Otherwise
the player stops and restarts that sentence on Resume, with an explicit status.
Rates passed are 0.75–2.5. A provider must honor these or fail visibly.

Android native installed TTS supports `AnFSpeechBoundary(id,start,end)` along
with existing `AnFSpeechDone(id)` and `AnFSpeechError(id)` callbacks. The
request ID comes from speakPart. Bridge native onRangeStart to that callback;
do not synthesize fake word timings.

Verified with real Chrome rendering and deterministic real-event fixtures; custom
engine generation and Android native boundary forwarding belong to their owners.

