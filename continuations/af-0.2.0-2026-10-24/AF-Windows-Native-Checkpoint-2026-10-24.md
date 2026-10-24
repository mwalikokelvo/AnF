# A&F native Windows and shared-core checkpoint

24 October 2026. Current source: `build-work/af/work/coucou`. Read `AF-Architecture-Unification-Audit-2026-10-24.md` for the new architectural mandate, preserved domains and ordered remaining migration. Both development artifacts are now available; parity and production release are not established.

## Completed changes

- Added `build-work/Build-Windows-Development.ps1`: isolated Rust/Perl environment, short Cargo target directory, reuse of the compiled static OpenSSL installation, real hook relay build/staging, direct TypeScript/Vite invocation, explicit base development resource overlay, sandboxed native test mode. Release optimization is reduced for this development build.
- Retained the resolved `windows/Cargo.lock` for reproducibility.
- Extracted `shared/audio/denoise.ts` and `shared/audio/queue.ts` byte for byte from their previous Windows paths. Kept old paths as compatibility re-exports and changed `audio-studio.ts` to consume the neutral shared DSP path. Added `shared/README.md`. No alternate DSP/queue implementation remains in the old files.
- Updated the source export helper to include the Windows build helper. Recorded delivery requirements, architectural audit, checkpoint and continuity. No synced reference or prior release was altered.

## Verification

Windows native Cargo check PASS. Native library tests PASS: **55 passed, 0 failed, 12 explicitly ignored**, with APPDATA/LOCALAPPDATA/USERPROFILE redirected to a unique synthetic test profile. Passing tests include real SQLCipher encrypted round trip, wrong-key refusal, FTS and transaction rollback, snapshot retention, backup validation and other native logic. Ignored tests include model inference, OCR, full vault migration/recovery, live network and Java/native transport interoperability. These remain pending.

After shared-source extraction, all **25 focused suites** PASS, including spectral noise attenuation/signal preservation, queue invariants, invalid profile/cancellation checks, and both workspace hosts. Windows strict TypeScript, Vite, release native compilation and NSIS packaging PASS. App payload is x64 PE, product A&F, version 0.2.0. Installer and payload are unsigned. No install/upgrade, launch, WebView interaction or GUI acceptance test was run.

Android strict TypeScript, interface bundling and debug build PASS: 38 tasks, 4 executed / 34 up-to-date. APK signature v2, CRC and ZIP alignment checks PASS; packaged JS/CSS exactly match the built files. Flutter engine and AOT payloads exist for armeabi-v7a, arm64-v8a and x86_64. Existing 32-bit SQLite ELF alignment caveat remains; ZIP alignment does not establish every device/runtime combination. No Android hardware acceptance was run.

Evidence: `build-work/verification/windows-native-2026-10-24/` and `build-work/verification/shared-core-2026-10-24/`. Native tool provisioning and previous unsuccessful attempts are retained separately from passing final logs. No Git repository metadata exists in the working tree, no commits/pushes occurred, and no cloud CI result or tag exists.

## Deliverables

| Artifact | Bytes | SHA256 |
| --- | ---: | --- |
| `build-work/artifacts/AF-0.2.0-Windows-base-development-shared-core-2026-10-24-setup.exe` | 51447102 | `10dd99837888d1687d528a7222b356caa3ccfa1e82c247428beebe525efc23d9` |
| `build-work/artifacts/AF-0.2.0-embedded-music-development-shared-core-2026-10-24.apk` | 191778600 | `6145a10bca8b06494fd11614107f0ead6f9ac354b076ed33fd7e3af1eb06454a` |

Android identity remains `com.coucou.workspace.dev`, version `0.2.0-dev` / 2000, development signer SHA256 `1eba0eecb2e5056058d8a244d228e3636acac8e8ac514a6dccc26940b53de95f`. This development package cannot replace an original production package signed with another key. Windows retains the existing Coucou identity/data paths; installer upgrade and recovery must be tested before using it with valuable data. Neither package is production certified.

Windows is explicitly a **base development** installer: the checkout has no `windows/local-ai` runtime/models; the overlay removes those mappings instead of bundling placeholders. Offline model inference/OCR requiring those assets is unavailable. FFmpeg and notices are packaged. Windows embedded Spotube is not implemented; Android retains the embedded music module. The unchanged default full Windows resource configuration still requires the real offline-AI pack and is not the base build command.

## Transfer and immediate milestones

Latest source export: `build-work/AF-0.2.0-native-shared-core-checkpoint-2026-10-24.zip`. It includes sources, helper scripts and evidence, not installed Rust/Perl/JDK/SDK caches or signing keys. A second computer must provision those tools, restore development signing separately if an upgrade is needed, and obtain the required music build dependencies. Read the architecture audit and continuity before continuing. Older source-only build-status statements are historical.

Next: native installation/startup and target-device acceptance; encrypted migration/recovery and actual PC/Android sync; shared capability/storage/audio-job contracts and responsive shell migration; reproducible CI in the real repository; offline neural speech assets and Windows music embedding. Continue independent migration work while signing, devices and model assets are pending. Deliver both platform artifacts at each update, with explicit limitations.
