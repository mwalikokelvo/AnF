# AnF 0.1.37 preview

Windows managed-gateway status now distinguishes held AnF-owned state from a ready/listening service. After an unexpected gateway exit, Settings keeps Stop available so that stale state can be released before repair or restart. Home explains the reset requirement. Source selection, repair and start remain unavailable while owned state needs stopping. No automatic termination or provider switch was added.

A genuine native QA run started the reviewed gateway and generated a fresh local answer, terminated only the exact isolated gateway PID while the native controller retained its original process handle, verified owned=true/ready=false, clicked the visible Stop action, verified ownership reset and restarted successfully. External connection settings were unchanged. Authentication, workspace permission, cancellation/restart and forced-owner-exit cleanup also passed, with zero application-side proxy traffic.

The first native attempt asserted visibility before the asynchronous refresh completed. The harness now waits for the actual visible control before clicking it; the application code did not change for this test correction. Earlier failed evidence remains preserved.

Validation: 101 native tests passed, 15 helper/manual tests ignored; TypeScript and browser reset/Home flows passed; current Android package/source/assets/alignment/development-signature gate passed; all 593 Windows portable files plus archive CRC/SHA matched. All ten published asset hashes were verified. The pinned repair implementation is unchanged from 0.1.36; its real damaged-runtime test is not presented as a fresh 0.1.37 repair test.

## Build reliability

Use scripts/bump-version.mjs for application versions. A regression check now verifies that Cargo/JS dependencies sharing AnF's version number retain their exact pins/checksums/URLs. It runs in the source/release gate. The incorrect global replacement caught during development was restored before final validation; no third-party dependency upgrade is part of this release. See RELEASE-VERSIONING.md.

## Remaining limits

Windows remains unsigned and Android development-signed. Android was rebuilt at 0.1.37; gateway reset controls apply to Windows. Private recordings and private voice models are excluded. Hosted CI account billing, managed-runtime upgrades/performance, production signing, device parity and the wider reader/TTS/music/service backlog remain open.
