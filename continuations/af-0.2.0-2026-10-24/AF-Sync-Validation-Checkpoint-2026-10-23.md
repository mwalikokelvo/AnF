# A&F incoming sync validation checkpoint — 23 October 2026

Current editable source: `build-work/af/work/coucou`. This continues the Unicode restore checkpoint and improves the PC-to-Android continuation path. Balanced reading, writing, AI help, Music Hub and Audio Studio scope remains confirmed. Prior exports/packages and synced reference files are preserved.

## Implemented source

Incoming Windows sync conversations now validate field types, UTF-8 limits, allowed roles/models, single-text history entries, history/source counts, source pages, reading notes and answer evidence before producing saved Android state. Validation reuses the restore source/evidence checks. Malformed input cannot allocate a new local conversation identity or mutate the previous object. Local pending replies and preferences remain intact.

Normal exchange replies must match the requested sync identity. Newly pulled conversations must match the requested remote ID, including when no local version exists. A real Windows conflict intentionally changes the phone version's identity and returns the requested identity as `other`; the host now checks this pair and preserves both copies. This follows the existing Windows `merge_sync` behavior rather than refusing legitimate conflicts. Conflict flags/pairs with missing, unrelated or unchanged identities are rejected.

Document opt-out remains in effect: remote source content/evidence is ignored, and local source/evidence preservation follows the prior matching-answer behavior. Remote source paths are not copied into Android sources. The host validates received conversation data; it does not independently recompute Windows revision hashes or prove the native authenticated transport.

Only Android sync conversion, workspace integration and their two test files changed. No native Java, Flutter, Windows source or wire format changes.

## Verification and scope

All **19** focused suites pass. Extended conversion tests cover invalid field types/roles/models, malformed history, source and history bounds, Unicode byte boundaries, evidence/page validation, immutable failures, new-ID allocation only after validation, requested identities, opt-out, and legitimate versus malformed conflict pairs.

The actual Android workspace bundle is exercised with DOM, storage and PC-link doubles. A malformed exchange cannot change saved conversation content or revision. A mismatched newly pulled conversation cannot create or overwrite local work. A legitimate conflict preserves both copies. Existing Unicode restore, writing-while-waiting and answer-safety checks continue to pass.

Evidence: `build-work/verification/sync-validation-2026-10-23/`. These tests verify host validation and storage dispatch, not native Windows storage/merge execution, authenticated networking, SQLCipher engine behavior, live editor/IME or hardware. Sync still saves completed exchanges incrementally; earlier successful exchanges are retained if a later exchange fails. Local identity assignment before sending also remains intentional. No whole-library rollback or remote cancellation claim.

Android strict TypeScript, interface bundle and debug build PASS (38 tasks, 4 executed / 34 up-to-date). Signature v2, ZIP CRC, 16 KB ZIP alignment, exact packaged JS/CSS and three Flutter engine/AOT ABI payload checks PASS. Existing 32-bit SQLite ELF alignment caveat persists; ZIP alignment does not establish universal runtime compatibility. No Android device is connected. Windows frontend remains at its preceding passing checkpoint and was not rebuilt because its source is unchanged. Native Windows tooling and original Android production signing access remain unavailable. No production release is declared.

## Next work

On Android and Windows hardware, verify normal sync, concurrent-edit conflict copies, document opt-out, saved excerpts, Unicode writing and interruption/retry behavior. Provision Windows native tooling and run the recorded native storage/merge tests. Continue Android local music discovery/native audio coordination and remaining stable source anchoring/background-job/collaboration work. This is a bounded data-validation improvement, not completed cross-device acceptance.

## Exported artifacts

- Source export: `build-work/AF-0.2.0-sync-validation-checkpoint-2026-10-23.zip`; checksum recorded under `build-work/verification/`.
- Development APK: `build-work/artifacts/AF-0.2.0-embedded-music-development-sync-validation-2026-10-23.apk`.
- APK size: 191777969 bytes; SHA256: `ade24a9854fd12243cabc1adbebb94bd6aee9c371de6a3b71c6d2edc5611ddab`.
- Same development identity `com.coucou.workspace.dev`, version `0.2.0-dev` / 2000 and existing development certificate. Native cross-device/hardware acceptance and production release remain unverified.
