# Android device and embedded music verification

## Local inventory, 2026-10-19

`adb devices -l` returned no devices in both the sandbox and normal Windows token.
The workspace SDK has platform tools, build tools and Android 37, but no emulator,
system images or NDK 27.0.12077973. No user AVD or alternate LocalAppData SDK
emulator/image installation was found. Windows WMI reports the CPU firmware
virtualization and VM-monitor extensions as false. This is evidence of the current
host configuration, not a claim that the underlying physical CPU lacks support.

No emulator image was downloaded and no phone apps were installed or removed.
Actual device startup, lifecycle, Android voice boundary events and migration
remain unverified. Compiled APK verification and data conversion tests are separate
evidence; neither substitutes for this missing device run.

Use an isolated emulator on a host with supported virtualization, or an explicitly
designated test device. Retain the legacy app. Export a backup from it, install
the development-signed AnF package alongside it, import into AnF, and verify saved
documents, notes, anchors and drafts. Restart the new app and repeat the checks.
Exercise offline reading, native read-aloud start/stop/navigation and background /
foreground transitions. Test both append and replace using disposable fixture
data, preserving the original backup and legacy installation. Do not apply the
existing same-package `UpgradeUiTest` seeding fixture to a personal installation;
it does not establish cross-identity migration.

## Embedded music prerequisites

The local cached Flutter SDK is 3.35.2, framework revision
`05db9689081f091050f01aed79f04dce0c750154`, engine revision
`a8bfdfc394deaed5c57bd45a64ac4294dc976a72`. A real Windows batch-tool version
probe passed. The cached upstream source is clean at the pinned revision
`69a310c78f5ceaf4eab7dfee98f187d38211c9ba`, and Android Flutter engine caches
are present. These caches are not generated Android runtime AARs.

The Android module `.metadata`, `.dart_tool/package_config.json` and Maven output
repository are absent. NDK 27.0.12077973 is also absent. Consequently no current
Android embedded Spotube AAR or combined music APK has been built locally.
Default core APKs must continue to report local media capability rather than
embedded native catalog/provider readiness.

The module generator now declares `com.anf.spotube`, matching the host's Maven
dependencies. The Windows Flutter version probe and Gradle wrapper invocation
use the same explicit batch launcher as preparation, with literal arguments and
delayed shell expansion disabled. Module creation skips automatic Pub fetching;
the later pinned lockfile resolution controls online versus `--offline` mode.

Recovery: provision the pinned NDK in a suitable build environment; configure
Flutter 3.35.2, Java 21 and the Android SDK; run
`node scripts/check-spotube-build-tools.mjs`, then
`node integrations/spotube/prepare.mjs --offline` when the dependency caches are
complete. Run `node integrations/spotube/build-android.mjs --release-only`, then
`node scripts/build-android.mjs --with-spotube --review`.
Inspect the combined APK with `scripts/check-music-apk.py`, verify its signature
and alignment, and run device playback/lifecycle checks. A full release/debug
pair additionally needs debug AAR generation (omit `--release-only`). Missing Pub,
Gradle or Rust target dependencies must be provisioned explicitly; do not label
an incomplete cache or successful source check as native playback parity.
