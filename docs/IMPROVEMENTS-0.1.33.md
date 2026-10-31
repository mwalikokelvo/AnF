# AnF 0.1.33

Published preview: https://github.com/mwalikokelvo/AnF/releases/tag/v0.1.33
Application source/tag: 7d1672b7d269e877f749c275e08281e32feeeb7f.

## Managed local OmniRoute on Windows

Download and extract the optional OmniRoute component. In Settings → Connected
services → AI gateway · OmniRoute → Managed OmniRoute, choose its
component/component.json, install, start, then choose Use managed local AI in Chat.
This route reuses AnF's bundled Fast model. No provider account, global Node
installation or user-entered API key is required. External settings are preserved.
The managed component is Windows x64 only; Android 0.1.33 remains a separate APK.

Every imported file is pinned and verified. Startup verifies the installed runtime
again. Owned services use authenticated loopback and are terminated when AnF exits.
Optional background services are disabled in this managed local profile.

## Verification

- 91 native tests passed; 15 existing manual/helper tests ignored.
- Existing-component and empty-profile native acceptance passed: real local-model
  answer, authentication, workspace authorization, stop without fallback,
  cancellation without stale publication, restart and owned gateway exit cleanup.
- Empty-profile import: 184.706 seconds; startup: 129.526 seconds. Installed-component
  startup: 140.702 seconds. These are measurements on the build PC, not guarantees.
- The native QA transport reconnected once in the existing-component test; the
  native app remained alive. This is recorded in the retained QA report.
- Current Android source/assets, APK manifest, signature and 16 KB alignment passed.
- All 593 portable files matched, ZIP CRCs and installer/portable SHA-256 passed.
- All ten uploaded release assets matched their remote SHA-256 digests.

The optional component includes retained notices and corresponding source archives.
Private recordings and voice models were excluded. Windows is unsigned and Android
uses development signing. Hosted CI remains unavailable because of account billing;
these were local builds and tests. No successful Strix scan is claimed.

## Next work

See REMAINING-IMPLEMENTATION-PLAN.md. Priorities include managed-component upgrades
and Home discoverability, local-model process ownership under forced termination,
Spotube provider playback and Android parity, reader structure and accessibility,
local synthesis/mobile parity, and the remaining service workflows. This release
completes the Windows managed local gateway milestone, not the whole backlog.
