# Android music preview downloads

[Download the ARM64 APK](https://github.com/mwalikokelvo/AnF/raw/refs/heads/codex/android-music-preview-0.1.21/AnF-Android-0.1.21-music-preview-arm64-v8a.apk).
[Checksums, source archive and verification records](https://github.com/mwalikokelvo/AnF/tree/codex/android-music-preview-0.1.21)
are on the private download branch; sign into GitHub with repository access.

This is an installable **0.1.21 music preview** for ARM64 Android devices, labelled
**AnF Music Preview**. It contains embedded Spotube and uses a separate app ID
(`com.coucou.workspace.musicdev`) and local development certificate. Keep your
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

Windows is not built: GitHub refused run `38615415567` before any build steps due
to failed account payments or the Actions spending limit. Restore Actions billing
or supply an existing Windows runner, then run **Embedded Spotube review builds**
on `codex/downloadable-releases`. GitHub release-asset uploads also return HTTP
401; the private download branch provides the APK independently of that endpoint.

The source continuation is [PR #2](https://github.com/mwalikokelvo/AnF/pull/2).
Build commands and native QA boundaries are in [MUSIC-HUB.md](MUSIC-HUB.md).

This product includes software developed by Kingkor Roy Tirtho.
