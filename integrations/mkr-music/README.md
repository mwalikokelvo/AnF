# MKR Music inside AnF

Requested behavior: choose MKR Music in Music Hub, search and play within AnF;
retain a shared now-playing dock and playback controls across sections. Do not
launch Spotify, a browser, another installed app, or an emulator as the player.

Status: **Windows controller and gated AnF command/UI wiring; no available packaged player**.
The pinned GPL innertube source can be prepared reproducibly for a platform-neutral
JVM catalog adapter and primary resolver compile; thirty-one bounded/error/policy/transport/session tests pass. The
separate AnF-owned Windows audio crate compiled and passed an actual muted,
generated AAC fixture's duration/play/pause/seek/resume test. A Windows-only JVM
bounded media lease now also feeds that generated AAC into the real muted native
decoder, including failure recovery, seek, deadline handling and reopen. This
engineering integration test uses injected fixture bytes; it verifies neither
live MKR service playback nor an available AnF source.
The separate [Android catalog library](android-catalog/README.md) now compiles
the pinned common sources against actual Android dependency variants. Its range
input, controller and ExoPlayer wrapper compile and pass 41 host-side tests.
Android foreground/UI integration and real decoder playback remain unverified.
No usable integrated MKR host, streaming player, or installer is supplied yet.
The AnF-owned `mkr-browser.ts` renderer now supplies an in-app search/results
panel and persistent dock adapter with responsive controls. Its browser fixture
uses an explicit mocked native transport: it tests UI handoff, safe metadata,
search/status races, pause failure and late-play-safe disposal. Windows now wires
it to `mkr_request`/`mkr_ack` and the actual `PlaybackHost` through optional
`embedded-mkr`. A compiled reviewed runtime inventory is deliberately absent,
so discovery returns unavailable and the source button remains hidden. No
production availability or provider playback is implied. The parent requires a
bounded, one-use workspace acknowledgement that local Music/Studio/Spotube have
paused before native Play; a pause while this acknowledgement is pending
invalidates that play. Native status/pause stay independent of slow catalog work.
The separate disposable **app-owned Tauri** runner now passes actual native
generated-AAC playback, responsive pause, seek/queue, failed/late acknowledgements
and reciprocal handoff with real local WAV playback. This is stronger than the
renderer mock fixture, but still uses a test catalog/media and does not establish
upstream streaming, active Studio/Spotube playback, Android or release readiness.
An owned-pipe catalog session now supports handshake, bounded search, private
lease preparation, explicit release and shutdown. Its discovery response keeps
`embedded:false`; the parent supervisor/native receipt/UI own playback separately
and still require the reviewed production-runtime and release gates.
See [sidecar protocol](SIDECAR-PROTOCOL.md).
Do not advertise an available MKR source until actual capabilities succeed.
See [primary resolver audit](PRIMARY-RESOLVER.md): the real app delegates playback
to InnerTubeX, whose JVM desktop target is now linked in the isolated prototype.
The instrumented primary probe now records a content-specific UNAVAILABLE response
and stops after one request. No compatible stream or integrated host is claimed.
The NewPipe helper remains an explicit legacy diagnostic.

The reviewed upstream revision is recorded in upstream.json. It is a native
Android Kotlin/Compose application using Hilt Application/Activity/Service,
Media3 playback and Room. It has no shipped Windows player. An APK cannot be
loaded into a Windows WebView. A Windows implementation needs a supported native
host/engine port; an external website or emulator is not acceptance.

## Licensing and source handling

Upstream LICENSE begins with a special exception restricting copying/adapting/
redistributing the Musixmatch module. Exclude that component and references to it
from any redistribution unless independently licensed. Do not copy upstream
fallback credentials into AnF. Verify every included dependency and preserve
copyright/license notices and corresponding-source obligations before packaging
GPL-covered code. Do not silently change AnF's repository-wide license. The AnF
IPC contract and adapters are independently written. Optional generated upstream
catalog inputs remain ignored and are verified against catalog-source.json;
they include104 Kotlin files and the original LICENSE, excluding app/lyrics and
unrelated modules. See engine/README.md for the GPL distribution/source boundary.
The repository-wide source license is unchanged, and no combined edition is released.

## Host contract, protocol 1

`windows/src/workspace/mkr-player.ts` is shared by desktop and Android hosts.
Capabilities must report protocol=1, embedded=true and platform=android-native
or windows-native. The host implements open/hide/status/search/play/pause/
previous/next/seek using structured IPC. Positions and durations are integer
milliseconds. Search returns at most 100 id/title/artist records, not executable
HTML. Playback handoff pauses other AnF engines before play/previous/next and
fails closed when that pause fails. Missing host never opens a website fallback.

## Implementation and acceptance still required

1. Preserve the reconciled AnF merge and its passing source
   gate, local music/Spotube, podcast/audiobook, Studio and document functions.
2. Produce a reproducible Android library/host from the pinned upstream source
   with compatible Hilt initialization, Compose navigation, service and database
   ownership. Isolate its data and remove independent app-update/launcher flows.
   Respect AnF's two application IDs and existing release signers.
3. Complete the Windows catalog/audio bridge, native controls, asynchronous media
   failure/recovery and lifecycle handling around the isolated audio prototype.
   Do not claim separate component tests establish in-app streaming. Validate
   dependencies on the 8 GB PC.
4. Wire the common source selector and dock only after truthful native discovery.
   Pause local music, Studio and Spotube on MKR play, and vice versa. Keep a path
   back to AnF documents/chat without stopping requested background playback.
5. Verify actual in-app search, playback, queue, seek, lyrics, local imports,
   offline/error states, restart, lock screen and lifecycle on both platforms.
   No unlimited availability, service access or bypass of provider limits is
   promised. Package matching builds with notices/source and accurate capabilities.

## Dependency source evidence

The catalog uses the Ktor 3.5.2 BOM to keep compile, runtime and test artifacts
on one version. `verifyKtorAlignment` rejects a mixed graph. The locked runtime
contains 38 dependency JARs; source collection does not enable the player or
authorize distribution.

Run `collect-source-artifacts.py` after `auditWindowsRuntime`. The optional
`--reuse-source-report` accepts a prior local report and reuses source archives
only when the coordinate, audited binary hash, repository URL and source bytes
still match. Changed coordinates are fetched from their fixed repository.
Integrity errors and access/rate refusals stop collection; sources are inspected
without extraction or execution. Run `review-source-artifacts.py --sources PATH`
to regenerate `source-artifact-evidence.json` for that exact runtime audit.

The evidence index records observed headers, notice filenames and native entries;
it is not a license conclusion. In particular, the QuickJS runtime contains
native libraries whose complete sources/build recipes require separate review.
JDK sources/notices and the combined distribution boundary remain outstanding.
Production discovery remains disabled pending this review and real provider
acceptance. Generated Java/AAC tests verify the host, not upstream streaming.

`native-source-evidence.json` separately records the QuickJS wrapper and both
pinned native submodules, with source archive hashes and build-recipe paths.
The collected archives were checked against every listed Git blob without
extraction or execution. This locates native sources; it does not establish a
reproducible binary match. The same index identifies the exact Microsoft JDK
source commit matching the runtime's release file. A separate full source
archive has now been collected and its reconstructed Git tree matches the
pinned commit, including native JVM code and build recipes. Its archive hash
and inventory are recorded in the index. Bundled `lib/src.zip` alone would
not provide those sources. Binary/build correspondence and distribution
review remain separate requirements.
