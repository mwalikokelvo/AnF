# Android music preview downloads

[Download the ARM64 APK](https://github.com/mwalikokelvo/AnF/raw/refs/heads/codex/android-music-preview-0.1.21/AnF-Android-0.1.21-music-preview-arm64-v8a.apk).
[Checksums, source archive and verification records](https://github.com/mwalikokelvo/AnF/tree/codex/android-music-preview-0.1.21)
are on the private download branch; sign into GitHub with repository access.

This is an installable **0.1.21 music preview** for ARM64 Android devices, labelled
**AnF Music Preview**. It contains embedded Spotube and uses a separate app ID
(`com.anf.workspace.musicdev`) and local development certificate. Keep your
existing AnF app installed. This preview does not update or automatically import
that app's data. The original production signing key is unavailable here.

SHA-256:

```text
9d0bd2edbb08ba27cf6c97239b9c3aeae73e33eb68a5ffcc2c0d00b5270946bc
```

The APK is 43,115,200 bytes. Compilation, release lint, signature verification,
CRC, packaged web/PDF assets, native host/Flutter presence, ARM64-only packaging,
ZIP alignment and at least 16 KB ELF load alignment pass. TypeScript/Vite builds,
nine release regression checks, real browser audio/persistence checks, both native
bridge fixtures and two Flutter lifecycle tests pass. Installed-device startup,
streaming, background controls and production upgrades remain unverified.

Windows 0.1.22 now builds locally with embedded Spotube. The real Windows runtime
passes startup, parent-window attachment, sizing, status/pause and retained
hide/reopen checks. It also includes floating-panel and workspace UI fixes.
See [the Windows build instructions](MUSIC-HUB.md#windows); installers and portable
ZIPs are generated under `windows/release/`. This change does not publish a new
GitHub Windows download. Provider login, live streaming and installed upgrades
remain interactive checks.

The earlier GitHub run `38615415567` was refused before its build steps because
of account billing/spending limits. The Android link above remains the separate
0.1.21 preview.

The source continuation is [PR #2](https://github.com/mwalikokelvo/AnF/pull/2).
Build commands and native QA boundaries are in [MUSIC-HUB.md](MUSIC-HUB.md).

This product includes software developed by Kingkor Roy Tirtho.
