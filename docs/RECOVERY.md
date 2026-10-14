# AnF recovery and continuation

The continuation adds the 0.1.21 Music Hub and opt-in native adapters. See
[MUSIC-HUB.md](MUSIC-HUB.md) for the current implementation and verification
boundary. The records below describe the recovered 0.1.20 state.

## Saved state

Continue PR #1 on `codex/release-builds`, not `main`. The recovered workspace
contains the source, dependencies, native tools, previous release packages and
private signing files. The last source commit before recovery was
`e3d762738ad12b0a75e470941767faae1fd57f5b`.

The old **Set up AnF** chat remains readable, but its environment-binding error
prevents new messages there. A working chat with access to this workspace can
continue the repository without changing the old chat's environment binding.

The user prioritizes Android and Windows updates preserving existing data.
Keep application IDs, browser origins, data paths, key aliases, installer records
and backup authentication stable. Signing keys remain outside Git and CI.

## Download identity correction

The `Apk` release contains an asset named `AnF-Windows-0.1.20-setup.exe`.
Its SHA-256 is
`f0eab17e75a78b7c4f826067c9ecac38485804e68b941a4ebee3ddc41d433328`.
This exactly matches the verified **Coucou 0.1.19** installer from Windows run
`38415985060`. Renaming the file did not rebuild it or add the AnF redesign.
Do not describe this executable as a verified 0.1.20 build.

The `Coucou-Windows-setup.zip` release asset matches that run's setup artifact:
`e77df6ebf2cfd02530a8d9101c75d7e3123bf89c263e9a6b9a158071f4b8192b`.

The Android release asset `AnF-Android-0.1.20.apk` matches the saved 0.1.20
checksum:
`e4da3a4a812325750b66d4b1b037c37973e3a31371f9e76b2d54c11be9143a2b`.
It does not contain Spotube. The download branches retain alternate APKs and
verification records. Draft release asset lists were empty at recovery time.

## Build status and commands

The recovered Windows TypeScript/Vite build and nine release regression checks
pass. Run them without requiring the Windows-only hook prebuild:

```bash
cd windows
npm exec tsc -- --noEmit
npm exec vite -- build
cd ..
node scripts/check-release.mjs
```

The latest Windows run `38461964989` has no build steps. Its check annotation
says: "The job was not started because recent account payments have failed or
your spending limit needs to be increased." Account billing must be restored
before relying on GitHub's native Windows runner. No new installed 0.1.20
upgrade-test pass is claimed.

The recovered Android toolchain is JDK 21, Gradle 9.4.1, Android platform 37.0
and build-tools 36.0.0. Its cached dependencies are under
`/workspace/.cache/gradle`, not the new user's default Gradle home. Build using:

```bash
JAVA_HOME=/workspace/.tools/jdk-21.0.12.1+1 \
ANDROID_HOME=/workspace/.tools/android-sdk \
GRADLE_USER_HOME=/workspace/.cache/gradle \
GRADLE_BIN=/workspace/.tools/gradle-9.4.1/bin/gradle \
node scripts/build-android.mjs
```

Recovery validation rebuilt the web assets, then successfully ran
`assembleRelease assembleDebug` and release lint using the recovered cache with
`--offline --no-daemon`. Both APK asset checks passed. This is a build/packaging
check, not a new installed-device test or a new production-signed download.

Gradle's JVM does not automatically consume HTTP proxy environment variables.
If dependencies need downloading, configure Java's HTTP/HTTPS proxy and trust
the environment CA while retaining TLS verification. Do not disable certificate
validation. Fully cached native builds can use Gradle's `--offline` option.

## Spotube implementation boundary

The old chat produced a design concept, not embedded Spotube code. The user
wants Spotube's familiar browsing/library/playlist/player layout improved inside
AnF, without redirecting to its website. Music should continue across screens;
Audio Studio preview playback should pause music. Include system media controls,
Android Back navigation and saved-data retention in installed tests.

Upstream inspected at `KRTirtho/spotube` commit
`69a310c78f5ceaf4eab7dfee98f187d38211c9ba` (package version 5.1.2+45).
It is a Flutter application, not a web bundle. Its entrypoint imports `dart:io`
and initializes native media plugins, encrypted storage, databases, desktop
window management, tray management and audio services. The upstream CI specifies
Flutter 3.35.2. Flutter is not installed in the recovered workspace.

The next implementation milestone is a native host proof on Android and Windows
using pinned upstream source and dependencies. Adapt Spotube's standalone
window/tray/close lifecycle to AnF ownership before integrating playback. On
Android, its audio-service Flutter engine must survive leaving the music screen;
on Windows, a native Flutter view needs a Windows build/test runner. An external
browser link or a separately launched Spotube app does not satisfy embedding.

Use a separate music store, preserve the existing AnF vault, and coordinate the
two players explicitly. Inventory required upstream environment values and
plugin assets before building; do not invent service credentials. Upstream is
BSD-4-Clause and requires retained notices and the acknowledgement:
"This product includes software developed by Kingkor Roy Tirtho."
