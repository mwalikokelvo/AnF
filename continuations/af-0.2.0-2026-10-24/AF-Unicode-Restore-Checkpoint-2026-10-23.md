# A&F Unicode restore checkpoint — 23 October 2026

Current editable source: `build-work/af/work/coucou`. This is a bounded backup reliability improvement following the native playback race checkpoint. Balanced reading, writing, AI, Music Hub and Audio Studio scope remains confirmed. Earlier archives/packages and synced sources are preserved.

## Implemented

Android backup restore now measures writing, prompts, unfinished replies, answer text, source names and extracted document text in UTF-8 bytes. The previous UTF-16 length check could accept oversized Unicode content; notably, a draft could pass restore validation and then fail the native repository's 200,000-byte writing limit. Restore now refuses such content before saving or dispatching the imported batch.

Limits remain 200,000 bytes for writing, unfinished replies and answer text; 100,000 bytes for prompts; 2,000 bytes for source names; and 2,000,000 bytes for each source's text. Page/evidence byte validation remains intact. Conversation names and note roles retain their previous character limits, preserving valid non-Latin conversation names. Legacy backup format and optional fields remain supported. The fix does not truncate text or overwrite active writing.

The validator explicitly copies restored fields; source documents are validated once through the existing source restoration function. Plain JSON, encrypted backup and historical-version restoration share this validator. Only Android project-data JavaScript and its tests changed; no native Java, Flutter or Windows source changes.

## Verification

All **19** focused suites pass. Added tests cover exact byte boundaries and one-byte overflow for emoji/non-Latin writing, prompts, unfinished replies, answer text, source text and source names. Existing page/evidence and reading-note restore checks still pass. Conversation-name character compatibility is covered.

The Android workspace integration invokes the real plain-backup restore control with a native storage double. An invalid second conversation rejects the whole backup before its valid first conversation is written. A valid 200,000-byte emoji draft restores as a separate copy with no truncation or active-draft replacement. This verifies the host validation/write-dispatch boundary, not the actual SQLCipher engine or hardware.

Evidence: `build-work/verification/unicode-restore-2026-10-23/`. Android strict TypeScript, interface bundle and debug build PASS (38 tasks, 4 executed / 34 up-to-date). Signature v2, ZIP CRC, 16 KB ZIP alignment, exact packaged JS/CSS and three Flutter engine/AOT ABI payload checks PASS. Existing 32-bit SQLite ELF alignment caveat persists; ZIP alignment is not a universal runtime compatibility claim. Windows frontend remains at its preceding passing checkpoint and was not rebuilt because its source is unchanged. Native Windows tooling and original production signing access remain unavailable. Android hardware acceptance remains pending; no production release is declared.

## Next steps

Run backup export/restore journeys on Android hardware with Unicode writing, source pages and saved evidence, covering plain and encrypted backups and historical versions. Continue Android music discovery/native audio coordination, Windows native validation/embedding and the remaining source anchoring/background-job/collaboration work recorded in the main handoff. AF-13's broader protection manifest and recovery acceptance are not complete.

## Exported artifacts

- Source export: `build-work/AF-0.2.0-unicode-restore-checkpoint-2026-10-23.zip`; checksum recorded under `build-work/verification/`.
- Development APK: `build-work/artifacts/AF-0.2.0-embedded-music-development-unicode-restore-2026-10-23.apk`.
- APK size: 191777507 bytes; SHA256: `4953cdbfccf9e0a3a8f887314a67010241b6e0a61b1d9429479eda730ff9a396`.
- Same development identity `com.coucou.workspace.dev`, version `0.2.0-dev` / 2000 and existing development certificate. No Android device connected; native restore/device acceptance and production release remain unverified.
