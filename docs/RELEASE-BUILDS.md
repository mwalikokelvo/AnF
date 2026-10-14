# Release builds

The build workflows create review artifacts; they do not publish a GitHub release.
Windows, Linux and Android source currently uses version 0.1.20. The separate native
macOS app retains version 0.1.4. No application data paths or identifiers change.

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
portable folder appear under `windows/release/`. The portable folder contains
both models, runtime DLLs, OCR, audio conversion, hooks and third-party notices.
The installer is unsigned; the existing Defender/signing publication hold remains.

## Android

Requires Node 24, a full JDK 21, Gradle 9.4.1, Android platform 37.0 and build-tools
36.0.0. `ANDROID_HOME` must name the SDK. Set `GRADLE_BIN` if Gradle is not on PATH.
SQLCipher 4.19.0 and SQLite 2.7.0 now resolve from their official Maven repositories,
including native libraries; the historical external `encryption-tools/` directory
is unnecessary. Compile SDK 37 satisfies SQLCipher metadata. Minimum SDK 26 and
target SDK 35 remain unchanged.

```bash
npm ci --prefix windows
npm ci --prefix android
node scripts/build-android.mjs
node scripts/check-release.mjs
```

Outputs under `releases/`:

- `AnF-Android-0.1.20-unsigned.apk`: release build, requiring the original
  production certificate before distribution or compatible in-place updates.
- `AnF-Android-0.1.20-debug.apk`: debug-signed test build. It cannot replace
  an installation signed with a different certificate.

The app has no sign-in requirement. APK signing is separate from account access.
No replacement production key is generated. Native file picking, read-aloud,
exports and phone/tablet UI still require device validation before shipping.

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
`Coucou-macOS-0.1.4-unsigned.zip`. This requires a macOS/Xcode runner; Linux cannot
build the SwiftUI/AppKit application. The ZIP has no Developer ID signature or
notarization. Use the existing `scripts/release.sh` process with the original
Developer ID certificate for a distribution build.

## Validation and publication

`node scripts/check-release.mjs` runs nine existing frontend/Android regression
checks. Desktop native suites run sequentially because one hook test mutates the
process-wide home directory. Linux and Windows also run the existing ignored
tests for real Fast/Balanced model switching and cancellation. Other ignored live
tests are not represented as passing. The old `dev/workspace-check.cjs` mock DOM
harness is not included: it assumes an obsolete bundle path and lacks APIs needed
by current editor/media dependencies.

Review exact artifact versions, checksum files, signatures and platform smoke
results before publishing. Actions artifacts expire after seven days. Keep the
Android production key and Apple signing credentials outside artifacts and Git.
