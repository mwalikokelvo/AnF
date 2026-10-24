# A&F snapshot ownership checkpoint — 24 October 2026

Current editable source: `build-work/af/work/coucou`. This follows the reader transitions checkpoint and improves snapshot recovery across Windows and Android. Balanced reading/writing/AI/Music Hub/Audio Studio scope remains confirmed. Previous exports/packages and synced references are preserved.

## Implemented

Snapshot listing now returns its captured conversation owner alongside the title and versions. Each displayed Restore copy button closes over that owner and supplies it explicitly when restoring. Windows and Android capture owner/title before awaiting the list operation; the shared mutable `snapshotOwner` variables were removed.

A conversation switch while snapshots are displayed cannot retarget their restore buttons. Refresh clears previous buttons before requesting the next list. A failed refresh leaves an error and no stale visible restore buttons. Existing busy and workspace-allowed guards continue to prevent overlapping actions. Restore continues to create a separate copy rather than replacing active work.

Changed shared snapshot component, both platform call sites, added a component suite and registered it in the verification wrapper. No Java, Rust, Flutter, protocol or storage-schema changes.

## Verification

All **21** focused suites pass. The new suite exercises actual bundled snapshot UI with DOM and list/restore doubles: displayed-owner binding after conversation changes, delayed listing, old controls removed before awaiting, failed refresh, failed restore, repeated-click/busy guards, workspace-allowed guard and empty history. Existing reader, sync, Unicode restore, writing and audio checks remain passing.

Windows TypeScript and Vite production frontend PASS. Evidence: `build-work/verification/snapshot-ownership-2026-10-24/`. Android strict TypeScript, interface bundle and debug build PASS (38 tasks, 4 executed / 34 up-to-date). APK signature v2, ZIP CRC, 16 KB ZIP alignment, exact packaged JS/CSS and three Flutter engine/AOT ABI payload checks PASS. Existing 32-bit SQLite ELF alignment caveat persists; ZIP alignment is not universal runtime acceptance. No Android device is connected.

These are component/host and package checks. Actual snapshot storage lookup, native copy creation, SQLCipher recovery and hardware acceptance remain unverified. Native Windows tooling and original production signing access remain unavailable. No production release is declared.

## Next steps

On both platforms, load snapshots for A, switch to B, restore an A version as a new copy, and verify A/B/current writing remain intact. Repeat with a failed list refresh and during unrelated workspace activity. Continue outstanding device reader/sync/backup acceptance, Windows native validation/embedding, Android music discovery/audio coordination, stable source anchoring/background jobs and collaboration baseline.

## Exported artifacts

- Source export: `build-work/AF-0.2.0-snapshot-ownership-checkpoint-2026-10-24.zip`; checksum under `build-work/verification/`.
- Development APK: `build-work/artifacts/AF-0.2.0-embedded-music-development-snapshot-ownership-2026-10-24.apk`.
- APK size: 191778120 bytes; SHA256: `e11b659df8f2b68206d96ef83876c6a32ad4a5522520ee740219a24f71d6ab6f`.
- Same development identity `com.coucou.workspace.dev`, version `0.2.0-dev` / 2000 and existing development certificate. Device/native recovery acceptance and production release remain unverified.
