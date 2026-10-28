# Release builds

The build workflows create review artifacts; they do not publish a GitHub release.
Windows, Linux and Android source currently uses version 0.1.21. The separate native
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

### Signing the Windows installer

The workflow signs the app and installer when two repository secrets exist, and does nothing otherwise.
Add them under Settings, Secrets and variables, Actions (never in Git or chat):

- `WINDOWS_CERTIFICATE`: your code-signing certificate as a `.pfx`, base64-encoded
  (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx"))`).
- `WINDOWS_CERTIFICATE_PASSWORD`: the `.pfx` password.

With both set, a release-tag or manual run from `main` of the Windows workflow imports the certificate into the runner's temporary store, builds with
`certificateThumbprint`, SHA-256 and a DigiCert timestamp, then fails the run unless every installer has a valid,
timestamped signature. It prints the signer's name so you can check it is yours.
Pull-request builds never receive the certificate. For an extra gate, store the two secrets in a GitHub Environment with required reviewers and add `environment:` to the job.
SmartScreen can still warn about new releases until signed downloads build reputation; since 2024 that applies to EV
certificates too. New CA certificates keep their key on a hardware token or cloud service, so they need a different signing
step than this `.pfx` one (for example Microsoft Artifact Signing).

#### A self-made certificate (free, for your own PCs)

A certificate you create yourself works with the same two secrets. The workflow notices it (subject equals issuer), trusts it
on the throwaway runner only so the signature can be verified, and says so in the run. Windows trusts the result only on PCs
where you installed the certificate; everyone else still sees a warning. Every Windows build also self-tests this path with a
throwaway certificate. To create one and trust it on your PC (PowerShell, as yourself):

```powershell
$dir = "$env:USERPROFILE\Documents\AnF-signing"; New-Item -ItemType Directory -Force $dir | Out-Null
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=AnF" -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddYears(5)
$pw = -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_}); Set-Content "$dir\password.txt" $pw -NoNewline
Export-PfxCertificate -Cert $cert -FilePath "$dir\anf-signing.pfx" -Password (ConvertTo-SecureString $pw -AsPlainText -Force) | Out-Null
Export-Certificate -Cert $cert -FilePath "$dir\anf-signing.cer" | Out-Null
Import-Certificate -FilePath "$dir\anf-signing.cer" -CertStoreLocation Cert:\CurrentUser\Root
Import-Certificate -FilePath "$dir\anf-signing.cer" -CertStoreLocation Cert:\CurrentUser\TrustedPublisher
```

Keep `anf-signing.pfx` and `password.txt` private and backed up; `anf-signing.cer` holds no secret and is what another PC
of yours needs (the last two lines) to trust AnF too. A downloaded installer also carries Windows' "from the internet" mark,
which SmartScreen checks separately: after downloading, `Unblock-File` (or Properties → Unblock) removes it for that file.
After the first signed build has been installed and checked, set `PUBLISH` to `'true'` in `windows.yml` to resume publishing.

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

- `AnF-Android-0.1.21-unsigned.apk`: release build, requiring the original
  production certificate before distribution or compatible in-place updates.
- `AnF-Android-0.1.21-debug.apk`: debug-signed test build. It cannot replace
  an installation signed with a different certificate.

The app has no sign-in requirement. APK signing is separate from account access.
No replacement production key is generated.

### Signing the Android release on GitHub

Manual runs of the **Android packages** workflow from `main` also produce
`AnF-Android-<version>.apk`, signed with the owner's key, when two repository
secrets exist (Settings → Secrets and variables → Actions → New repository secret):

- `ANDROID_KEYSTORE_BASE64`: the key file as text. In PowerShell:
  `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\anf-release.jks")) | Set-Clipboard`
- `ANDROID_KEYSTORE_PASSWORD`: the key file's password.

Only if the key file holds several keys, add `ANDROID_KEY_ALIAS`; only if the key
has its own password, add `ANDROID_KEY_PASSWORD`. Pull requests never receive
these secrets. Every build also signs a throwaway copy with a temporary key, so a
broken signing step shows up before a release needs it. The run summary prints the
certificate's SHA-256 fingerprint so it can be compared with the key on file. Native file picking, read-aloud,
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
