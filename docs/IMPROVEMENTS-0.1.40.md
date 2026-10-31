# AnF 0.1.40 preview

Managed OmniRoute component operations now classify Windows drive roots before inspecting source files. A drive letter alone no longer establishes local storage. Normal and verbatim drive-letter aliases use the same explicit terminated root. Mapped network drives, unavailable roots, unknown/unsupported drive types and device/UNC paths are refused; known local fixed, removable, optical and RAM storage remains supported. A read-only optical source can be classified as local, but writable destinations still need to pass existing filesystem and space checks.

Classification runs on each Windows path validation rather than using a cached decision. Existing ancestor/reparse checks, pinned manifest and complete payload verification, operation locks, repair topology and rollback acceptance rules are preserved. This does not establish atomic protection against hostile concurrent drive remapping or filesystem substitution. Broader fault/race validation remains open.

The implementation uses the documented [Microsoft GetDriveTypeW API](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getdrivetypew) with an explicit trailing separator and terminator, never a null/default drive root.

## Evidence

Native suite: 104 passed, 16 ignored. A separately executed ignored test passed against the existing K: mapped drive; an independent read-only Windows logical-disk query confirmed drive type 4. No K: source files were opened, written or removed. Injected classifications cover remote, missing/unknown and unsupported kinds, accepted local kinds and normal/verbatim aliases. UNC/device paths remain rejected.

The isolated native application also rejected mapped repair-source aliases while preserving connection settings, then repaired genuinely damaged local runtime bytes. Observed phases: Inspecting component source, Copying and verifying component files, Promoting verified repair candidate, Inspecting component files, Verifying component files, Inspecting pending repair, Cleaning repair rollback data. Repair elapsed 615.6 seconds in this run; no performance improvement is claimed. Actual local generation, authentication, workspace permission restrictions, stale-owned reset, stop without fallback, cancellation/restart and forced-owner-exit cleanup passed, with zero application-side proxy requests. Browser managed-repair/progress fixtures passed.

Windows installer and portable verification checked all 593 archived files, ZIP CRC and SHA-256. Android 0.1.40 passed current-source/assets/native-library, ZIP/16 KiB alignment and development-signature checks. All ten uploaded assets had their remote SHA digests checked. Private voice recordings and derived models remain local and excluded.

Windows remains unsigned and Android development-signed; no physical Android device or managed mobile gateway parity is claimed. Hosted CI remains refused before runner execution by account payment/spending settings. Runtime upgrades, measured repair traversal work and broader local TTS/reader/music/mobile/service features remain on the implementation roadmap.
