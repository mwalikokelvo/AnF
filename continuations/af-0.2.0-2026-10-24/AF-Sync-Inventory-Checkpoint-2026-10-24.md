# A&F sync inventory checkpoint — 24 October 2026

Current editable source: `build-work/af/work/coucou`. This completes another bounded validation slice following `AF-Sync-Validation-Checkpoint-2026-10-23.md`. Confirmed balanced product scope is unchanged. Earlier source exports, packages and synced references are preserved.

## Implemented

Android now validates the PC conversation inventory before using it. The list must contain at most 200 entries with unique 64-character lowercase hexadecimal IDs. Missing/malformed lists, invalid IDs and duplicates are rejected. Only independently copied IDs are retained from inventory entries.

The same validator covers the initial sync capability/list request, the later list before pulling remote-only conversations, and Check connection. Initial validation finishes before persistent sync identity assignment or conversation exchange. A malformed list cannot initiate exchange/pull requests. A later rejected list does not roll back exchanges already completed; sync remains incremental.

Document-sharing capabilities must be advertised as an array containing `reading-v1`. A string containing that text is no longer accepted as a feature list. Chat-only behavior remains available when the capability is absent. Windows already enforces the 200-conversation session limit; this adds phone-side validation without changing the protocol.

Only Android sync conversion, workspace orchestration and their two tests changed. No native Java, Flutter or Windows source changes.

## Verification

All 19 focused suites pass. Inventory unit tests cover missing/malformed lists, null entries, invalid IDs, duplicates, empty lists, exact 200-entry acceptance, 201-entry rejection and independent minimal copies. Workspace integration checks exercise actual Sync now and Check connection controls with native storage/link doubles. Duplicate initial inventories and malformed capability lists stop before further network dispatch, and saved conversations stay unchanged. Invalid connection inventories cannot produce a successful connection message. Earlier conflict, mismatched pull, Unicode restore and draft-safety checks remain passing.

Evidence: `build-work/verification/sync-inventory-2026-10-24/`. These checks establish JavaScript host behavior with doubles, not native network authentication, SQLCipher, Windows merge execution or device acceptance. Windows frontend remains at its previous passing checkpoint and was not rebuilt because its source is unchanged. Native Windows tooling and original production signing access remain unavailable. Android strict TypeScript, interface bundle and debug build PASS (38 tasks, 4 executed / 34 up-to-date). Signature v2, ZIP CRC, 16 KB ZIP alignment, exact packaged JS/CSS and three Flutter engine/AOT ABI payload checks PASS. Existing 32-bit SQLite ELF alignment caveat persists; ZIP alignment does not establish universal runtime compatibility. No Android device is connected.

## Next steps

Verify PC/Android sync on hardware with an empty PC library, 200 entries, concurrent edits/conflict copies, document opt-out and interrupted sessions. Continue native Windows validation/embedding and Android local music discovery/audio ownership work. Revision-safe background jobs, stable source anchoring and collaboration baseline remain open. No production release or completed cross-device acceptance is declared.

## Exported artifacts

- Source export: `build-work/AF-0.2.0-sync-inventory-checkpoint-2026-10-24.zip`; checksum recorded under `build-work/verification/`.
- Development APK: `build-work/artifacts/AF-0.2.0-embedded-music-development-sync-inventory-2026-10-24.apk`.
- APK size: 191778080 bytes; SHA256: `0761049cf607a3333de10b2cb7ffb7743589aee9f627008b9c02567456f8f640`.
- Same development identity `com.coucou.workspace.dev`, version `0.2.0-dev` / 2000 and existing development certificate. Native cross-device/hardware acceptance and production release remain unverified.
