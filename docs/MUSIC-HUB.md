# Music Hub and native Spotube

## Shared 0.1.21 interface

Android and Windows now have separate **Music Hub** and **Audio Studio** sections.
Music Hub follows the approved dark charcoal/mint reference: search, three tabs,
artwork cards, listening history and a persistent responsive player. Empty
libraries start empty; the fictional albums in the browser QA screenshots are
test fixtures, not a streaming catalogue bundled into the product.

Local music imports retain title/artist/album metadata and supported embedded
artwork. Imports are limited to 100 MB per file. Search matches song, artist and
album text; the Playlists tab searches saved playlist names. Playlists, likes,
queue, volume, shuffle, repeat mode and listening position are retained locally.
Reload restores a paused player, without autoplay. Music continues when moving
between AnF sections. Starting an Audio Studio preview suspends Music Hub; starting
Music Hub pauses the studio. Unsupported files show an error.

The existing `coucou-audio` IndexedDB stores are preserved and shared with Audio
Studio. The new player preferences use `anf-music-player`; existing studio queue
state is kept separate. Music files remain outside conversation encryption,
backups and device sync. Browser media-session controls are registered for the
active local player. Mobile background/lock-screen behavior needs native device
verification; browser tests do not establish it.

## Native integration

The native adapters are opt-in review builds until native verification completes.
Normal builds retain the working local Music Hub and do not claim to contain
Spotube. The Open Spotube control appears only when the packaged runtime is
available. It opens a native screen inside AnF, never the Spotube website.

Source: `KRTirtho/spotube`, commit
`69a310c78f5ceaf4eab7dfee98f187d38211c9ba`, package 5.1.2+45.
Flutter: **3.35.2**. `integrations/spotube/pubspec.lock` pins the app's resolved
Dart dependencies. Generated projects and binaries are ignored by Git.
Upstream native plugin build tools also resolve their own dependencies; a full
byte-reproducibility claim is not made.

The adapter disables standalone window/tray ownership, floating mini-player
window resizing, automatic app updates and the upstream global certificate
allowlist override. TLS validation remains enabled. The native music database
is named `anf-spotube.sqlite`; it does not replace AnF's vault or browser stores.
Optional Last.fm credentials are empty in review builds. No user signing keys
or service secrets are written into source or sent to CI.

### Android

```bash
node integrations/spotube/prepare.mjs
node integrations/spotube/build-android.mjs
node scripts/build-android.mjs --with-spotube
```

Set `FLUTTER_BIN`, `JAVA_HOME`, `ANDROID_HOME`, `GRADLE_USER_HOME` and `GRADLE_BIN`
when the tools/cache are not on the default paths. Rust and Dart must be on PATH
for the native plugins. In managed environments, Java needs the configured proxy
and trusted environment CA; do not disable certificate verification.

The AAR builder publishes runtime AARs and source jars with two Gradle workers
and a 2 GB heap. It omits API documentation jars: older plugin Dokka compilers
cannot read modern Kotlin metadata and caused an observed out-of-memory kill.
Flutter's engine artifacts resolve exclusively from its engine repository rather
than nonexistent Google Maven paths.

The current review targets are ARM64 and x86-64. Unsupported 32-bit devices retain
local Music Hub without offering the native control. `.MusicActivity` shares
`audio_service`'s retained Flutter engine; Back returns to AnF without deliberately
stopping its playback. A method-channel pause acknowledgement coordinates native
Spotube with local music and Audio Studio. Native startup, streaming, Back,
background controls and saved-data upgrades still require installed tests.

### Windows

On a Windows machine with Flutter, MSVC and the existing AnF native prerequisites:

```powershell
node integrations/spotube/prepare.mjs --windows
cd windows/spotube-native
flutter build windows --release
cd ..
npm ci
./scripts/prepare-offline.ps1
./scripts/prepare-media.ps1
cargo build --release --locked -p coucou-hook
npm exec tauri -- build --features embedded-music --config src-tauri/tauri.spotube.conf.json
node scripts/pack.mjs --with-spotube
```

The native runner validates the AnF parent process/window, attaches its Flutter
window as a child view and receives bounded commands over private process pipes.
Navigation hides the child view while keeping its process alive. Pause requests
require a Flutter acknowledgement before another player starts. The child stops
when AnF exits; native window controls do not own AnF's outer window. Generated
Windows product metadata isolates its support directory from standalone Spotube.

This Windows path requires an actual Windows compile and installed tests. Linux
backend compilation and bounds tests do not verify Win32/Flutter code. The
`embedded-music` feature remains opt-in so an unverified native adapter is not
silently enabled in standard Windows builds.

## Verification and next checks

Commands:

```bash
cd windows
npm exec tsc -- --noEmit
npm exec vite -- build
cd ..
node scripts/build-android.mjs --assets-only
node scripts/app-qa/music-hub.mjs
node scripts/app-qa/appearance.mjs
node scripts/check-release.mjs
```

Browser QA covers real synthetic-WAV playback, cross-section player persistence,
search, playlist creation/membership/reload, mutually exclusive studio/music
playback, artwork loading and six viewport layouts. Desktop IPC is a fixture;
these checks do not simulate a native Flutter runtime. The broader appearance
suite covers 84 views, both themes, retained drafts/preferences and seven-section
navigation. A native Rust test rejects invalid/overflowing view bounds.

`.github/workflows/spotube-native.yml` creates unsigned/private review artifacts
and performs no public publication. Restore Actions billing, then use the
**Embedded Spotube review builds** workflow on `codex/release-builds`. Installed
native QA must cover startup, music search/stream playback, returning to AnF,
system controls, audio handoff, closing/reopening and upgrading saved data.

This product includes software developed by Kingkor Roy Tirtho.
The BSD-4-Clause notices are retained in `integrations/spotube/LICENSE` and in the
native distribution. This acknowledgement does not imply upstream endorsement.
