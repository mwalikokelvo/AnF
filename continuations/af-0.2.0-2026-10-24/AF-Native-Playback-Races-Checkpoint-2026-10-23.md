# A&F native playback race checkpoint — 23 October 2026

Current working source: `build-work/af/work/coucou`. This follows `AF-Audio-Ownership-Checkpoint-2026-10-23.md` and closes an additional bounded portion of AF-10. Balanced product scope remains confirmed. Earlier source exports, packages and synced references are preserved.

## Source changes

Android native-queue preparation now has a separate playback-intent generation. Switching to read-aloud or browser music, pressing native Stop/Previous/Next, or cancelling a transfer invalidates an older pending queue or Play request. The host checks that intent after imports and after asynchronous handoff preparation, before dispatching playback or stopping the new audio owner.

- A cache/import reply that arrives after a handoff cannot start its queue.
- Cancel transfer remains effective while final handoff preparation is pending. The transfer control is disabled once queue dispatch begins; already-dispatched playback is controlled by the player's Stop/Pause controls.
- Multiple pending Play controls permit only the newest request to dispatch after preparation.
- A superseded queue reply cannot advertise successful playback or update the current host state.
- Concurrent pause handoffs use a counter so polling remains suppressed until all handoffs settle. An older pause cannot count as the current acknowledged pause.

Only Android host JavaScript and its focused integration test changed in this pass. No native Java, Flutter or Windows source changes. This prevents delayed host dispatch; it does not remotely cancel a command already delivered to the native service, guarantee native operation ordering, remove cached files, or establish a complete audio focus/ownership service.

## Verification and limits

All **19** focused suites pass. Extended native-media tests exercise actual bundled host code with DOM and bridge doubles: delayed status, malformed/still-playing pause rejection, delayed imports, cancellation during preparation, Stop during preparation, latest-request playback, stale queue replies and concurrent handoffs. Evidence is in `build-work/verification/native-playback-races-2026-10-23/`.

Android strict TypeScript, interface bundling and debug build: PASS (38 tasks, 4 executed / 34 up-to-date). APK signature v2, ZIP CRC, 16 KB ZIP alignment, three Flutter engine/AOT ABI payloads and exact packaged JS/CSS identity: PASS. Existing 32-bit SQLite ELF alignment caveat remains; ZIP alignment does not establish universal runtime compatibility. No Android device is connected. Windows frontend source/build remains at the preceding passing checkpoint; it was unchanged and not rebuilt this pass. Real-device audible playback, lock-screen/Bluetooth controls, interruptions and service lifecycle acceptance remain required. Native Windows toolchain and original Android production signing access remain external dependencies; no production release is declared.

## Next work

Test the new sequences on Android hardware, including already-dispatched native queue commands followed by pause. Continue native audio focus/TTS acknowledgement and background embedded-player coordination. Android MediaStore discovery/progress and Windows native validation/embedding remain open. Keep the earlier handoff's remaining background-job, source-anchoring, collaboration and release gates visible.

## Exported artifacts

- Source export: `build-work/AF-0.2.0-native-playback-races-checkpoint-2026-10-23.zip`; checksum recorded under `build-work/verification/`.
- Development APK: `build-work/artifacts/AF-0.2.0-embedded-music-development-native-playback-races-2026-10-23.apk`.
- APK size: 191777533 bytes; SHA256: `307c5a4cc6337cd7eb34eb0e60d2ebfc77cdc3600764b2667cbcb03c036b2d2f`.
- Same separate development identity: `com.coucou.workspace.dev`, `0.2.0-dev` / 2000 and existing development certificate. Device acceptance and production release remain unverified.
