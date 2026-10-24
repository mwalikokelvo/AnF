# A&F audio and read-aloud safety checkpoint — 23 October 2026

Current editable source: `build-work/af/work/coucou`. This continues the Android responsive-workspace checkpoint. Balanced reading, writing, AI help, Music Hub and Audio Studio scope remains confirmed. Synced references and earlier delivered archives/packages are preserved.

## Implemented source changes

- Shared reader speech now has a guarded preparation step. Stop, a newer read request, or another reader invalidates pending speech. Native utterance IDs are unique within and across reader instances; late completion/error callbacks cannot advance a newer reading session. Speech errors stop progression. Sentence advancement does not repeat initial preparation.
- Android writing and document read-aloud first stop browser audio and await embedded Music Hub and native queue pause. A refusal, malformed native state or superseded pause prevents speech from starting. Stop reading during preparation prevents a late start. Starting Music Hub, browser playback or native queue playback stops reader speech and invalidates pending draft read-aloud.
- Native queue replies now validate playback state. A transport success with `playing: true` is insufficient to confirm pause. Delayed status replies still cannot take playback back after a newer command.
- Browser audio playback uses a request generation: Stop, clearing/opening a track, or a newer playback request invalidates an older pending preparation. Windows reader/writing read-aloud and Audio Studio also stop the other host-controlled audio path when starting.

These are bounded host handoff safeguards, not a completed native audio ownership service. Android `stopSpeaking` still has no acknowledgement. Background embedded-player media-session resume, audio focus/ducking, simultaneous native transfer/play requests, lifecycle recovery and real device behavior require further work and acceptance tests. No Flutter or native Android/Windows source was changed in this pass.

## Verification

- Windows TypeScript and Vite production frontend: PASS. Android strict TypeScript and interface bundle: PASS.
- All **19** focused suites: PASS. New browser Audio Studio lifecycle checks exercise actual UI/storage code with DOM, IndexedDB and audio doubles. Speech checks cover delayed preparation, cancellation, refused preparation, unique IDs, old callbacks, reader ownership and native/browser errors. Android workspace checks exercise actual Read aloud/Stop reading controls against delayed/refused/acknowledged Music Hub pause replies. Native queue checks reject still-playing and malformed pause responses.
- Android debug build: PASS, 38 tasks (4 executed, 34 up-to-date). Existing Flutter AAR repository reused.
- APK signature v2, ZIP CRC, 16 KB ZIP alignment, three Flutter engine/AOT ABI payloads and exact packaged JS/CSS comparison: PASS. Existing 32-bit SQLite ELF alignment caveat remains recorded in inventory; do not infer universal 16 KB runtime acceptance from ZIP alignment.
- Evidence: `build-work/verification/audio-ownership-2026-10-23/`. Doubles do not establish audible playback, native storage, live editor/IME, Bluetooth, lock-screen or service lifecycle acceptance. No Android device connected. Native Windows toolchain remains unavailable; native compilation/storage tests were not run. Production signing access remains unavailable.

## Artifacts for continuation

- Source-only export: `build-work/AF-0.2.0-audio-ownership-checkpoint-2026-10-23.zip`. It includes the source, continuity, dated reports and verification records; generated dependency/build directories and signing material are excluded. Checksum is recorded under `build-work/verification/` beside previous checkpoint checksums.
- Development APK: `build-work/artifacts/AF-0.2.0-embedded-music-development-audio-ownership-2026-10-23.apk`, 191777418 bytes.
- APK SHA256: `c77a21ddf9f681b30bad37086837484adb5a5f65d51aabef3f8d9f93364ac504`.
- Package `com.coucou.workspace.dev`; version `0.2.0-dev` / 2000; same development certificate as previous checkpoints. This is a development package, without device or production release acceptance.

## Next work

Continue native audio ownership/focus coordination and Android local-music discovery/progress work, then test transitions between Music Hub, native queue, Studio and read-aloud on a device (including Stop during delayed preparation, lock/unlock, interruptions and external media controls). Provision Windows native tooling and validate storage/schema changes and embedded music feasibility. Full revision-safe background jobs, stable source anchoring, collaboration/GitHub baseline and production signing/release gates remain open as recorded in the main handoff and blueprint.
