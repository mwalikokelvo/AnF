# A&F reader transitions checkpoint — 24 October 2026

Current editable source: `build-work/af/work/coucou`. This follows the sync inventory checkpoint and improves the shared reading workspace on Windows and Android. Balanced reading, writing, AI, Music Hub and Audio Studio scope remains confirmed. Earlier exports/packages and synced reference files remain preserved.

## Implemented

Opening another valid document in the shared reader now saves the previous document's latest scroll position and stops its speech, including pending asynchronous voice preparation. Late speech completion cannot continue the old document after a switch. Reopening a document can restore the scroll position saved during the switch.

The reader retains its original external focus target while switching documents inside an already-open overlay. Closing returns focus to that original control instead of a hidden reader button. Validation runs before the switch, so an invalid new document leaves the existing reader intact.

Reading offsets and bookmarks at the exact end of a document now select its last section rather than returning to section one. End-position bookmarks also use the last section's label. Empty-document behavior remains bounded to section zero.

Changed shared reader source and section-selection helper, added a focused reader component suite and registered it in the frontend verification wrapper. No native Java, Rust or Flutter source changed; no document storage schema change.

## Verification

All **20** focused suites pass, including the new reader UI suite. It exercises actual bundled reader and speech components with a DOM, local-storage and native-voice double: switching documents stops speech, stale voice callbacks do not advance, pending voice preparation is cancelled, scroll is saved/restored, focus returns externally, end offsets/bookmarks select the last section, and invalid new sources leave the current reader intact. Existing restore/sync/answer/audio checks remain passing.

Windows TypeScript and Vite production frontend build PASS. Android strict TypeScript, interface bundle and debug build PASS (38 tasks, 4 executed / 34 up-to-date). Evidence: `build-work/verification/reader-transitions-2026-10-24/`. APK signature v2, ZIP CRC, 16 KB ZIP alignment, exact packaged JS/CSS and three Flutter engine/AOT ABI payload checks PASS. Existing 32-bit SQLite ELF alignment caveat persists; ZIP alignment is not universal runtime acceptance. No Android device is connected.

DOM/storage/voice doubles do not establish browser layout, screen-reader, keyboard/touch selection, live editor/IME, audible voice, native persistence or hardware acceptance. Windows native toolchain and original Android production signing access remain unavailable. No production release is declared.

## Next steps

On Windows and Android, test switching documents during read-aloud/preparation, scroll restoration, keyboard focus on close and end-of-document bookmarks. Continue native Windows validation/embedding and Android music discovery/audio coordination, alongside source anchoring, background jobs and collaboration baseline. Device sync/backup acceptance remains pending as recorded in the preceding reports.

## Exported artifacts

- Source export: `build-work/AF-0.2.0-reader-transitions-checkpoint-2026-10-24.zip`; checksum under `build-work/verification/`.
- Development APK: `build-work/artifacts/AF-0.2.0-embedded-music-development-reader-transitions-2026-10-24.apk`.
- APK size: 191778056 bytes; SHA256: `5d5f8c326c9eb9fe2cf94d87170c89f29c1618587a78de2a98f02ab007336a90`.
- Same development identity `com.coucou.workspace.dev`, version `0.2.0-dev` / 2000 and existing development certificate. Device/native acceptance and production release remain unverified.
