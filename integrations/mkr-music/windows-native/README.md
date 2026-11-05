# Windows native audio prototype

This AnF-owned MIT crate uses Windows MediaPlayer/Media Foundation, not a browser,
Spotify, emulator or external player. AnF has a feature-gated IPC adapter, but
no reviewed production runtime inventory is bundled: this is **not an available
MKR source**. The separately prepared MKR catalog core is not linked
into this crate; its final native transport/distribution boundary still needs
license/source review and actual provider playback acceptance.

One owned MTA worker holds all audio objects, with a bounded command queue and
reply timeout. Initial sources are paused; the AnF bridge must pause other engines
before play. Public load accepts only bounded HTTPS googlevideo CDN URIs without
userinfo/fragments/nonstandard ports. Local fixture loading exists only inside the
test module. Shutdown releases the player/source on their owner thread. Seek is
bounded to native duration, and state reports native positions in milliseconds.
No capability discovery, user-media scan or service-account access is enabled.

The standalone catalog supervisor owns a hidden JVM child using private pipes,
a random Windows CNG session nonce, strict reply schemas/IDs/byte limits, bounded
worker queues and request deadlines. A kill-on-job-close Windows job owns the
child. Malformed output, EOF and timeouts invalidate receipts and stop/reap the
session; raw provider text and stderr are not forwarded. Production launch
requires [verified resources](../RUNTIME-INVENTORY.md); a reviewed bundled inventory and
production provider/source acceptance are still missing.

`load_owned` accepts only an opaque receipt created by that supervisor. It does
not weaken the public URL loader. Revocation/expiry/child loss pause buffered
native audio without frontend polling. The watchdog runs only while an owned
source exists; an idle engine blocks without a timer. Explicit generated-fixture
QA exercises real Rust parent -> JVM session -> HTTP lease -> WinRT decode,
including release and an unexpectedly killed child. Broken-ID, oversized-output
and stalled-child fixtures exercise cleanup. No provider request or AnF playback
UI is enabled by those tests.

Queued operations now carry a deadline and cancellation marker. A caller timeout
discards a queued Play; an expired/lost in-flight Play is paused rather than
starting unacknowledged audio. The muted native fixture deliberately blocks the
worker, times out a queued Play, and verifies playback does not start later.

Native MediaFailed events now latch a sanitized failure for that source. Status,
Play and Seek report the failure; Pause and an explicit replacement load remain
usable. Every replacement owns a new player and failure latch, so late callbacks
from a retired decoder cannot poison the next source. Handlers retain only an
atomic flag, never provider error text or player objects; shutdown unsubscribes
and closes the player on its owning thread. No automatic provider retry occurs.
The explicit muted test opens generated invalid media, observes a real decoder
failure, then loads generated AAC and completes the playback/seek/reopen checks.

```powershell
cargo test --offline --locked -- --test-threads=1
# Explicit native decoder/transport QA with a generated fixture, never a private voice:
$env:ANF_MKR_TEST_AUDIO='C:/test/generated-fixture.m4a'
cargo test --offline --locked real_muted_playback_seek_pause_and_resume -- --ignored --test-threads=1
```

The explicit test is muted. It must actually observe decoded duration, advancing
position, a held pause, seek and resume before passing; compilation alone does not
satisfy it. The default suite leaves this hardware/native test ignored. This does
not verify external provider streaming, AnF UI/audio handoff, background/lock-screen
controls, application restart or installed upgrades. Those
remain required before any app source selector reports availability.

For the separate JVM bridge's explicit engineering probe, the same test also
accepts `ANF_MKR_TEST_HTTP`, strictly a 127.0.0.1 ephemeral `/audio/<64 hex>` lease
without query/userinfo/fragment. This is cfg(test)-only; the production loader
still rejects loopback and files. The JVM probe owns the lease lifetime and feeds
generated AAC chunks while the real native decoder exercises failure recovery,
play/pause/seek/deadlines/reopen. No browser or external playback app is launched.

`host::PlaybackHost` now coordinates the actual catalog child and native decoder
behind one controller API: search results, a retained playback queue, current
metadata, play/resume, previous/next, seek, pause and shutdown. Search/prepare hold
only the catalog lock; pause and status remain independent. A play generation
invalidated by pause/shutdown cannot start later from the decoder queue. Track
changes fail fast while another track change/catalog request is working. Shutdown
pauses immediately and terminates a busy child when its operation returns.

The explicit `probeWindowsPlaybackHost` Gradle engineering task exercises real
muted generated AAC, including slow catalog work, superseded preparation, queue
changes and shutdown during preparation. Its test JVM never contacts a provider.
AnF's optional `embedded-mkr` Tauri adapter now calls this controller and awaits
an explicit one-use workspace pause acknowledgement. Handoff tickets captured
before that wait are atomically invalidated by pause/shutdown, so late replies
cannot restart audio. The controller itself does not stop other AnF engines.
The production reviewed-runtime inventory remains absent: UI discovery is false
and no usable source button or installable player is supplied yet. Real packaged
workspace/provider playback acceptance remains necessary.

The disposable app-owned Tauri acceptance runner now passes real generated-AAC
playback, responsive pause during slow catalog work, seek/queue, failed/late
acknowledgements and reciprocal handoff with a real local WAV. See
`scripts/app-qa/fixtures/MKR-NATIVE-QA.md`. Its Java catalog/media are fixtures,
not upstream service streaming or a production capability. Native Pause now
waits for an actual Paused/None state (bounded to 500 ms) before acknowledging;
an unconfirmed pause fails the handoff instead of starting another engine.

Java launch paths need special treatment: Tauri's canonical `\\?\C:\...`
spelling is valid for Windows file verification but is not a valid Java
classpath and can break the launcher's jimage lookup. Program, classpath and
working directory use equivalent local DOS paths after rejecting UNC/device,
traversal, alternate-stream, separator, reserved-device and trailing-dot/space
aliases. Original inventory hashes and read locks stay intact. The canonical
runtime handshake test exercises this actual Tauri path form.


The real AnF adapter now retains startup ownership through blocking-worker
completion and host publication. Cancelled startup receivers discard the prepared
host through its existing shutdown path; another startup cannot overlap cleanup.
Pause acknowledgements also release their exact reservation on cancellation.
[Run42066326402](https://github.com/mwalikokelvo/AnF/actions/runs/42066326402)
compiled the actual Windows Tauri library with `embedded-mkr` and passed8 focused
startup/handoff/argument tests;207 unrelated tests were filtered out.
This verifies adapter lifetime behavior, not an installed runtime or provider
playback. Production discovery remains unavailable without the reviewed manifest.
