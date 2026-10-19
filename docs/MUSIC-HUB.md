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

The existing `anf-audio` IndexedDB stores are preserved and shared with Audio
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
Retaining the native engine/process provides the background-playback foundation.
A separate native Spotube dock follows playback across AnF sections, showing
track/artist, position and duration with play, pause, previous and next controls.
Its title returns to the embedded screen. Status polling stops while the page is
hidden or the dock is suspended. Late replies cannot restore a suspended dock.
These controls are verified with native-bridge browser fixtures; installed
Spotube behavior remains pending the native device/Windows checks below.
Android background queue controls also await the Spotube pause acknowledgement
before starting playback. A failed handoff does not start another player.

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
Spotube with local music and Audio Studio. Both native AAR variants and the
combined AnF release/debug APKs compile locally, including release lint. The
review release APK is signed with the preserved original release certificate.
Native startup, streaming, Back, background controls and saved-data upgrades
still require installed tests. The isolated software-only API 35 emulator
developed Settings and System UI hangs, so it provided no reliable installed
verification. It was stopped after this attempt.

### Isolated Android previews

When the original signing key is unavailable, build an installable preview beside
the production app:

```bash
node integrations/spotube/prepare.mjs
node integrations/spotube/build-android.mjs --release-only
node scripts/build-android.mjs --with-spotube --review
python scripts/check-music-apk.py --abi arm64-v8a releases/AnF-Android-0.1.21-music-preview-arm64-v8a.apk
```

The default preview targets ARM64 phones. `ANF_REVIEW_ABI=x86_64` selects the other
supported architecture. Each preview contains one architecture; the inspector
rejects unexpected ABIs, missing Flutter/host code and native ELF load alignment
below 16 KB. The host pins NDK 27 for stripping, and the AAR builder passes encoded
Rust linker flags through Cargokit for the required alignment.

The launcher label is **AnF Music Preview**, application ID is
`com.anf.workspace.musicdev`, and version name ends with `-music-preview`.
It uses a local development certificate and separate application storage. It
cannot update the original app or automatically access that app's data. Keep the
production app installed. This preview does not establish installed-device
startup, streaming, background-controls or upgrade verification.

Embedded sleep timers pause playback; task removal pauses without exiting AnF.
The close shortcut asks the native host to return to AnF. Android preparation
vendors the locked NewPipe revision and removes its absent desktop asset entry,
while retaining its source/license and leaving the shared Pub cache unchanged.

### Windows

Windows 0.1.22 fixes the floating panel's rounded animation and control layering,
adds visible collapse/recovery actions, and consolidates repeated workspace
controls. The embedded player has its own bounded viewport below the source
switch. It hides for other sections and dialogs; local-library controls return
when switching back. A failed pause leaves native playback controls available
and prevents a second player from starting.

Windows 0.1.23 additionally accounts for WebView2's Windows accessibility text
scale when sizing the floating window and mapping mouse coordinates. It excludes
Spotube's standalone window-manager startup and preference updates from embedded
mode; those routines otherwise resolve AnF as their root window and change its
title, size and Flutter surface. The host waits for the native startup handshake
and returns to the local library on failure. Search excludes provider advertising
redirects and shows compact source addresses while preserving the full link.
The native runner enables sibling clipping on AnF's WebView host so its
accelerated surface cannot paint over the Flutter child. This needs a composed
window capture; a CDP screenshot only captures the browser surface. The Windows
QA helper uses PrintWindow so an overlapping application cannot contaminate
the captured pixels.

Use a Visual Studio Developer PowerShell with C++ Build Tools and
`Microsoft.VisualStudio.Component.VC.ATL`, Flutter **3.35.2**, and the existing
AnF native prerequisites. The helper checks ATL, provides the signed Microsoft
NuGet CLI when absent, and handles the Dart/Git Windows-path compatibility issue.
It bundles the verified Microsoft runtime beside Spotube as well as local AI.
Keep the checkout path short. If using `subst`, invoke the helper through that
short drive path too; invoking it through the original long path can exceed
MSBuild's 260-character limit in the generated WebView plugin project.

```powershell
cd windows
./scripts/build-spotube.ps1 -Flutter C:/path/to/flutter/bin/flutter.bat
npm ci
./scripts/prepare-offline.ps1
./scripts/prepare-media.ps1
cargo build --release --locked -p anf-hook
npm run pack:music
```

The native runner validates the AnF parent process/window, attaches its Flutter
window as a child view and receives bounded commands over private process pipes.
Navigation hides the child view while keeping its process alive. Pause requests
require a Flutter acknowledgement before another player starts. The child stops
when AnF exits; native window controls do not own AnF's outer window. Generated
Windows product metadata isolates its support directory from standalone Spotube.

The actual Windows executable compiles locally with MSVC. Its disposable-host
smoke test verifies Flutter startup, parent attachment, exact child bounds,
status/pause acknowledgements and retained hide/reopen behavior. The welcome UI
also renders. Both Flutter lifecycle tests pass, as do the Windows native suite
(54 passed, 12 ignored) and browser bridge/viewport/handoff checks. Provider
setup, live streaming and installed upgrades still need interactive verification.
The explicit `pack:music` build includes Spotube; `pack` retains the local-only
variant.

Native smoke check (Windows Python; Pillow is optional for screenshots):

```powershell
python ../scripts/app-qa/windows-spotube-smoke.py spotube-native/build/windows/x64/runner/Release
```

The native smoke also asserts that Spotube leaves its parent's title and bounds
unchanged and keeps the Flutter surface inside its wrapper. For an isolated
Tauri QA build with WebView2 debugging enabled, run
`node scripts/app-qa/windows-embedded-ui.mjs` from the repository root. It tests
actual Windows text scaling, floating Settings/collapse and the native music
handshake. Browser DPI emulation alone does not cover accessibility text scaling.
Set `ANF_QA_PID` to the isolated app's process ID and `PYTHON_BIN` to a Python
with Pillow to also run `windows-composed-view.py`, which rejects a blank native
surface and saves the composed window screenshot. Never use a live personal
profile for these QA actions.

## Verification and next checks

Commands:

```bash
cd windows
npm exec tsc -- --noEmit
npm exec vite -- build
cd ..
node scripts/build-android.mjs --assets-only
node scripts/app-qa/music-hub.mjs
node scripts/app-qa/native-music-player.mjs
node scripts/app-qa/appearance.mjs
node scripts/check-release.mjs
```

Browser QA covers real synthetic-WAV playback, cross-section player persistence,
search, playlist creation/membership/reload, mutually exclusive studio/music
playback, artwork loading and six viewport layouts. Desktop IPC is a fixture;
these checks do not simulate a native Flutter runtime. The broader appearance
suite covers 84 views, both themes, retained drafts/preferences and seven-section
navigation. A native Rust test rejects invalid/overflowing view bounds.
Native-control browser fixtures exercise both bridges, cross-section controls,
responsive layouts, failed pause, malformed status, studio handoff and late
responses. They do not replace installed native streaming/system-controls tests.

The earlier worker reported a production-signed local review package named
`releases/AnF-Android-0.1.21-embedded-review.apk`. That APK and its signing key are
not present in this continuation workspace. The isolated preview described above
uses a different application ID and development certificate. The normal debug
and unsigned output filenames also contain Spotube when built with
`--with-spotube`; filenames alone do not establish the packaged runtime.

`.github/workflows/spotube-native.yml` creates unsigned/private review artifacts
and performs no public publication. Restore Actions billing, then use the
**Embedded Spotube review builds** workflow on `codex/release-builds`. Installed
native QA must cover startup, music search/stream playback, returning to AnF,
system controls, audio handoff, closing/reopening and upgrading saved data.
Run `38615163842` for the native-controls commit was refused before any build steps: GitHub reports failed
account payments or the Actions spending limit. No Windows native build is
claimed from that run.

Draft review release `anf-v0.1.21-embedded-review` was created, but its assets
remain empty: `uploads.github.com` returned HTTP 401 (Bad credentials).
The signed APK and SHA-256 file remain saved under `releases/` in this workspace.
Upload authorization must be restored before describing that draft as a download.

This product includes software developed by Kingkor Roy Tirtho.
The BSD-4-Clause notices are retained in `integrations/spotube/LICENSE` and in the
native distribution. This acknowledgement does not imply upstream endorsement.

### Playback regression checks

The embedded module uses `integrations/spotube/build.yaml` to generate deep JSON.
Audio-source plugin scripts and media extras consume maps directly; nested Dart
artist/album instances otherwise crash matching and playlist reconstruction.
Embedded playlist changes also skip Discord presence updates, since the host
does not initialize a standalone Discord client. Buffering reports the native
engine's real events. A provider 401 offers account settings without clearing
saved credentials or changing authentication automatically.

Run `flutter test --no-pub test/embedding_test.dart test/playback_test.dart` in
the prepared module. Set `ANF_TEST_LIBMPV` to the built Windows `libmpv-2.dll`
to enable the native audio test. It streams a generated WAV through the
production loopback media/player path, verifies duration and advancing position,
then pause/resume. Output is muted. This checks decoding and transport; it does
not establish that an external provider accepted the user's current session.
