# Release builds

The build workflows create review artifacts; they do not publish a GitHub release.
The current desktop/Android integration source targets **0.1.42**, combining main/PR47 with the divergent public 0.1.41 lineage. It is not yet a verified release. The separate macOS source retains its own version. Both Android application identities and their original signers must be preserved; Windows upgrades retain the selected existing installation and data records.

The verified 0.1.21-to-0.1.22 Windows/Android upgrade runs are review references, not the newest feature-complete release. Do not rebuild those packages, downgrade 0.1.41 users, overwrite assets/tags or promote this unfinished merge.

See [RECOVERY.md](RECOVERY.md) for the recovered build state, verified download
identities, and the pending native Spotube integration. A source version is not
evidence that a matching native installer has been built.

## Windows

Use the **Windows** Actions workflow on the release branch, or from a Windows
x64 machine with Node 24, Rust 1.99.0 and the MSVC build tools:

```powershell
cd windows
npm ci
./scripts/prepare-offline.ps1
./scripts/prepare-media.ps1
npm run pack
```

Preparation downloads the pinned llama.cpp runtime, Qwen weights and OCR models,
checks their hashes, and quantizes Balanced weights with the pinned tool. A
checksum mismatch stops packaging. FFmpeg 8.1.2 has a pinned archive checksum.
No empty model files or runtime placeholders are used. The installer and complete
portable folder appear under `windows/release/`. Packaging also creates
`AnF-Windows-<version>-portable.zip` and `SHA256SUMS-Windows-portable`. The ZIP
uses ZIP64 so it can include the large offline models. Extract the entire folder
before launching `AnF.exe`; it still uses the existing per-user saved-data paths.
The portable folder contains
both models, runtime DLLs, OCR, audio conversion, hooks and third-party notices.
Preparation verifies Microsoft's x64 redistributable DLL signatures and places
those files beside the AI runtime. The hook statically links its Visual C++
runtime because it is also copied into a separate per-user relay directory.
Ordinary review builds are unsigned. Public Windows publication remains held for unresolved Defender detection. The owner certificate is self-signed and not publicly trusted; signing does not clear detection or reputation.

For the Windows build containing native Spotube, prepare it with
`./scripts/build-spotube.ps1` in a Visual Studio Developer PowerShell, then use
`npm run pack:music`. The helper requires Flutter 3.35.2 and checks the ATL
component. Native startup/transport verification and the exact build commands
are documented in [MUSIC-HUB.md](MUSIC-HUB.md#windows).

### Optional Windows signing

Signing is an explicit manual run from main with sign_windows enabled, using the existing WINDOWS_CERTIFICATE and WINDOWS_CERTIFICATE_PASSWORD repository secrets. PRs and ordinary review/tag runs do not receive the signing identity. No replacement certificate is generated. Missing requested credentials fail closed.

The workflow imports the owner PFX into the disposable runner's current-user personal store, configures SHA-256 signing and a timestamp, then verifies the exact configured signer, Authenticode Valid and timestamp. It never installs a root certificate. The current self-signed identity may fail this strict trust check; do not weaken it or claim public trust. A publicly trusted Windows signing service/certificate needs a separately verified setup with the owner. Do not store private keys/passwords in source, artifacts or instructions.

PUBLISH remains false; the draft-publication job is disabled and cannot clobber existing assets. Defender disposition, feature preservation, signing/provenance and installed upgrade gates must be resolved before publication. Do not remove Windows download marks or disable protection to bypass a warning.

## Android

Requires Node 24, a full JDK 21, Gradle 9.4.1, Android platform 37.0 and build-tools
36.0.0. `ANDROID_HOME` must name the SDK. Set `GRADLE_BIN` if Gradle is not on PATH.
SQLCipher 4.19.1 and SQLite 2.7.0 now resolve from their official Maven repositories,
including native libraries; the historical external `encryption-tools/` directory
is unnecessary. Compile SDK 37 satisfies SQLCipher metadata. Minimum SDK 26 and
target SDK 35 remain unchanged.

Install command-line tools 23 (16111833) under
`$ANDROID_HOME/cmdline-tools/latest`, then run
`node scripts/prepare-android-sdk.mjs`. This uses the current Android CLI's
slash-separated package IDs and verifies the platform, build tools and ADB.
The compatibility `sdkmanager` wrapper can report success after rejecting the
older semicolon-separated IDs, so its exit code alone is insufficient.

```bash
npm ci --prefix windows
npm ci --prefix android
node scripts/build-android.mjs
node scripts/check-release.mjs
```

Build both explicit identities:

```bash
node scripts/build-android.mjs
node scripts/build-android.mjs --legacy
node scripts/verify-android-release.mjs
node scripts/verify-android-release.mjs --legacy
```

Outputs under releases/ use the actual source version. Modern builds use AnF-Android-<version>-unsigned.apk and -debug.apk, application ID com.anf.workspace and origin https://anf.local/. Legacy builds use AnF-Android-Legacy-<version>-unsigned.apk and -debug.apk, application ID com.coucou.workspace and origin https://coucou.local/. Unsigned APKs require the corresponding original key before distribution. New debug keys do not establish compatible updates.

The Android packages workflow and required reusable gate build and verify BOTH identities in separate jobs, with distinct reports, checksums and artifacts. The gate includes source regressions and actual APK inspection; assets-only is not enough. baseline_lineage and optional baseline_filename select the actual installed baseline for emulator upgrade QA. That QA uses a disposable key and is separate from verifying the original production signer.

### Original Android signers

- Legacy com.coucou.workspace production certificate SHA-256: 27789eee03090b2aa4c5fbf37737c8e4dbda61352c2557c076aec233ef4a7a2a.
- Public 0.1.41 modern com.anf.workspace was debug-signed: 51a4f7d3677a4e63335b274ad8ce9b532c8816501057ad9d3cfc328136b32e1e. Custody of that original debug key remains unresolved. Do not generate a substitute and claim update compatibility.

Manual main runs may enable sign_legacy with the existing ANDROID_KEYSTORE_BASE64 and ANDROID_KEYSTORE_PASSWORD secrets (ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD only when required). Signing is restricted to the legacy job, and the signed result AnF-Android-Legacy-<version>-signed.apk must pass verify-android-release.mjs --legacy --signed against its actual original fingerprint. Missing requested secrets fail. PRs never receive keys. A throwaway signing self-test and debug APKs are test-only, not original-signer evidence.

Keep both installed user apps and their data. Android cannot read another app's private storage/Keystore; user-selected exported backups are the separate transfer path. Physical Samsung Android15 / DOOGEE Android14 picker, speech, export, lifecycle and native music QA still require device validation. No on-device AI or unlimited hosted quota is claimed. Sending selected document excerpts to a cloud provider requires explicit confirmation.

## Linux

RPM payloads are uncompressed. The RPM 0.16.0 library embedded in the pinned
Tauri CLI hashes the entire remaining input on each partial compressor write,
which stalls on bundled model files and can record an incorrect payload digest.
The uncompressed writer accepts each buffer in full; all models remain bundled.

The **Linux** workflow uses Ubuntu 22.04 for the existing glibc compatibility
baseline. Install the prerequisites in `windows/README.md`, plus FFmpeg for audio
conversion. Use Node 24 and Rust 1.99.0:

```bash
cd windows
npm ci
node scripts/prepare-linux.mjs
npm run pack
```

The Linux resource overlay bundles the Linux CPU runtime and shared libraries,
not Windows DLLs or executables. Both model hashes and quantization are verified.
`.deb` and `.rpm` packages declare the FFmpeg dependency; AppImage users must
install it separately. AppImage, `.deb`, `.rpm` and checksums appear under
`windows/release/`.

## macOS

The **Build** workflow runs the Swift regression checks and produces
`AnF-macOS-0.1.4-unsigned.zip`. This requires a macOS/Xcode runner; Linux cannot
build the SwiftUI/AppKit application. The ZIP has no Developer ID signature or
notarization. Use the existing `scripts/release.sh` process with the original
Developer ID certificate for a distribution build.

## Validation and publication

`node scripts/check-release.mjs` runs the existing frontend/Android regression
checks and shared workflow/skill/listening/MKR contract checks. Desktop native suites run sequentially because one hook test mutates the
process-wide home directory. Linux and Windows also run the existing ignored
tests for real Fast/Balanced model switching and cancellation. Other ignored live
tests are not represented as passing. The old `dev/workspace-check.cjs` mock DOM
harness is not included: it assumes an obsolete bundle path and lacks APIs needed
by current editor/media dependencies.

Review exact artifact versions, checksum files, signatures and platform smoke
results before publishing. Actions artifacts expire after seven days. Keep the
Android production key and Apple signing credentials outside artifacts and Git.

The user-requested final security gate includes Strix. Follow the scope,
prerequisites and evidence checklist in [Connected features](CONNECTED-FEATURES.md#strix--required-final-release-check).
This gate is pending until an actual scan and findings retest are recorded;
ordinary regression checks do not satisfy it. Run `node scripts/check-workflows.mjs`
when changing the shared reading/writing task picker or prompts.

## Current acceptance boundaries

The integrated native unit suite passed128 tests with17 ignored; the full browser appearance suite passed84 views, and shared-shell synthetic audio/playlist/lyrics/queue tests passed on Windows and Android fixtures. These are source/browser evidence, not installed native streaming or new package acceptance. Ignored native tests require their actual prerequisites.

The merge must finish before a new matching package build. Validate NSIS upgrade selection and actual installed upgrades for both Windows lineages on disposable hosted workers, Android instrumentation/ABIs and each original signer separately. Retain explicit consent before cloud context is sent. Preserve local music, Studio, books/podcasts, documents, sync, draft safety, managed connections and personal-voice privacy. No private recording or voice model belongs in a distributable.

MKR Music has a reviewed source pin/shared IPC contract, a compiled catalog-core prototype and an isolated Windows audio component that passed muted generated AAC transport tests. The live catalog probe returned search results but no compatible M4A stream. No Android host, connected Windows MKR player or available AnF source is packaged. Browser/Spotify redirects or an emulator do not satisfy the requested in-app playback. Its GPL corresponding-source/distribution boundary and restricted-component exclusions remain required before any native integration is distributed; the repository-wide MIT source license is unchanged.
