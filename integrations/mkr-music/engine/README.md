# Optional MKR-derived catalog engine prototype

This is a platform-neutral port of the pinned upstream **innertube core**, with
an independently authored bounded AnF adapter. It is not an Android Activity,
Windows audio engine or usable embedded player. No AnF capability is enabled.

Prepare only the reviewed allowlisted files from a checkout containing the pin:

```powershell
node integrations/mkr-music/prepare-catalog.mjs --source C:/path/to/mkr-music
cd integrations/mkr-music/engine
gradle --no-daemon test
```

Use JDK21 and Gradle9.4.1. Exact resolved dependency versions are recorded in the
lockfile and hash metadata, including the primary library's transitive Ktor3.5.2.
No Android SDK, Hilt/Compose, account, key or user data is read. The prototype uses
the InnerTubeX desktop variant, not its Android artifact. Compile/test results
must be recorded before either native host can rely on this component.

The real JVM compilation and 34 offline fixture/policy/transport tests pass (run41981316928, 2026-11-05; zero skipped). Gradle dependency
locks and SHA256 verification metadata record the resolved artifacts; a subsequent
offline build verified them. A single explicit live probe returned20 public search
records but did not obtain compatible M4A audio. Search success is not streaming
success. A subsequent single controlled video-ID diagnostic classified the legacy
helper's result as UNSUPPORTED_AUDIO; no repeated live attempt followed that
failure. No alternate account, guest-session rotation or external player was used.

The opt-in `probeCatalog` Gradle task performs a public test search and resolution;
ordinary builds/tests do not run it. It omits signed CDN URLs from console output.
Both video-resolution probe tasks now require an explicitly selected valid public
music ID via `-PmkrProbeVideoId`. Missing input fails before launching the probe;
there is no automatic default that repeats the known-unavailable test content.
`probeResolution` performs an explicit legacy public-video-ID diagnostic without another
catalog search. Failure reason codes never attach upstream causes or messages,
which may contain signed URLs. See ../PRIMARY-RESOLVER.md before treating this
legacy NewPipe path as MKR's real primary playback implementation.

The default adapter now uses the real pinned InnerTubeX desktop dependency with
remote configuration disabled, no token/account provider, and one conservative
client per extraction. The network policy tests first-party endpoints, credential
rejection, one player attempt, redirect refusal and latched401/403/429 stops using
Ktor MockEngine. Selected streams retain headers/range/chunk requirements; hosts
that cannot implement them reject the stream instead of dropping those fields.
Signed URLs/header values are redacted in stream objects' string representations.

The initial primary probe stopped at its request budget; the cap was not raised.
After offline-tested bounded response diagnostics, one updated probe identified
UNAVAILABLE for that public test fixture, zero formats, one request. It stopped
without a second request. This is content-specific, not proof of a global service
or API-credit problem. Do not keep retrying that unavailable fixture.

Player responses are bounded to2MiB/depth128 and only enum/count diagnostics are
retained. Login/content denials stop before fallback; unknown or oversize bodies
fail closed. An OK response is replayed intact to the actual decoder. No compatible
provider stream or integrated AnF playback is claimed. The legacy helper is used
only by its explicit diagnostic.

The Windows-host-only `src/windowsMain` directory now implements a revocable
loopback media lease. It binds only 127.0.0.1, uses a random 256-bit bearer path,
accepts only GET/HEAD with an exact host/path and no query, and serves single byte
ranges with no-store/nosniff headers and no CORS. It requires finite validated
content length and expiry preserved from the primary extractor. Two workers and
a bounded queue stream <=1MiB chunks without buffering an entire song. Invalid
or multipart ranges fail before a provider request; expiry/close revoke access.
The lease URL is private owned-host IPC data, never a saved track or log value.

The CDN input uses a separate JDK HttpClient with no cookie handler/authenticator
or redirects. Exact 206/Content-Range/length/identity encoding checks and a bounded
body subscriber reject ignored ranges, truncated/oversized responses and metadata
mismatches. Each chunk has an absolute 12-second deadline and cancellation. Any
denial/limit/transport failure latches the lease; it never changes provider/client
identity, re-resolves or retries the failed lease. A downstream decoder disconnect
does not itself latch a provider failure. No production AnF IPC or UI is wired yet.
Android must exclude this JDK directory and implement its own Media3 host.

`probeWindowsNativeBridge` is opt-in engineering QA. Set `ANF_MKR_TEST_AUDIO` to
the generated AAC fixture and `ANF_MKR_NATIVE_TEST_EXE` to the compiled cargo test
harness, then run that Gradle task. It passes the ephemeral lease only through an
owned child environment and invokes the actual muted WinRT regression. Provider
bytes are replaced by explicitly injected generated-fixture chunks for this test;
it cannot demonstrate live service streaming or AnF UI/audio handoff. Ordinary
builds/tests never launch this executable or call a service.

`WindowsCatalogSidecarKt` now supplies a private, nonce-handshaken JSON-line
catalog session with bounded UTF-8 framing, strict request sequence/schema,
sanitized errors, one active lease and EOF/broken-pipe cleanup. It never reports
embedded player availability. The new session tests verify search/preparation
validation, explicit release, lease revocation and error privacy with injected
fixtures. `probeWindowsCatalogLifecycle` separately launches the actual child for
hello/shutdown only, captures private frames and makes no provider request. The
standalone Rust supervisor and native receipt now pass generated-fixture QA,
including revocation and child loss. The actual AnF control/UI binding and bundled
inventory remain absent;
see [protocol and remaining acceptance](../SIDECAR-PROTOCOL.md).

`catalog-source.json` pins every selected Git blob's size and SHA256. Preparation
reads exactly that commit, checks all inputs before writing, and rejects modified,
unlisted, linked, restricted or credential-bearing inputs without exposing values
or overwriting them. It excludes the app, lyrics/Musixmatch and unrelated service
modules. Generated upstream sources and dependency caches stay out of Git.

The AnF-authored adapter/build scripts retain the repository MIT license. Prepared
upstream source retains the original GPL-3.0 license and special restriction text,
verbatim; this does not license the excluded Musixmatch code. Any combined catalog
engine artifact is a GPL-covered distribution and needs its complete corresponding
source, modifications and dependency notices. No source-complete distribution or
combined AnF edition is released here. AnF's repository-wide license is unchanged;
the final native linking/distribution boundary still requires explicit review.

No fallback service credentials, browser player, Spotify launch or emulator is used.
Anonymous service requests can fail or be limited. Do not promise unlimited access.

## Probe capability parity

The primary metadata diagnostic now declares the same M4A/header/bounded-range
capabilities as the owned Windows lease host. Previously it used the bare-URI
convenience overload, which could reject otherwise host-supported metadata.
The explicit legacy diagnostic still declares no header/range support. Both
paths retain the same endpoint, credential, MIME, request-budget and denial
checks. Fixture tests cover this distinction and prohibited credentials.
Metadata success does not verify lease admission, CDN bytes or native playback.
Earlier live UNAVAILABLE observations remain valid; this change did not retry
those fixtures or establish provider availability. Production discovery and
packaging remain disabled pending their existing acceptance/source gates.

Earlier verification: [offline contract run41981316928](https://github.com/mwalikokelvo/AnF/actions/runs/41981316928)
compiled the isolated catalog and passed all34 tests, including the3 metadata
probe parity regressions. No live provider request, decoder playback, AnF
capability enablement or distributable runtime was part of that run.


## Current isolated candidate inventory

The v0.7.2 candidate passed35 JVM contract tests in
[run41996468050](https://github.com/mwalikokelvo/AnF/actions/runs/41996468050).
[Inventory run42010862475](https://github.com/mwalikokelvo/AnF/actions/runs/42010862475)
then audited38 exact runtime dependencies and fetched38 bounded source archives.
`../inventory-provenance.json` links the exact report hashes and source commit.
All37 shared dependency binary/source hashes match the previous inventory;
only the reviewed InnerTubeX patch coordinate changed. The previous source
inventory remains in `../source-artifact-evidence-v0.7.0.json`.

These are inventory reports, not a source-complete runtime distribution. QuickJS
native binary correspondence, exact bundled JDK correspondence and complete
notices/distribution review still require acceptance. No executable, music
provider query or production app package was uploaded by the inventory workflow.

Candidate preparation now refuses JDK metadata and API-source hashes that differ
from the exact JDK source record in `../native-source-evidence.json`. This check
runs before candidate files are created or jlink executes. It records the pinned
complete-source archive separately from tool hashes. Matching metadata and Java
API sources do not prove JVM binary correspondence, publisher trust, complete
notices, reproducibility or publication readiness; those flags remain false.

`../collect-reviewed-source-inputs.py --output <new-folder> --fetch` restores only
source archives whose coordinate, binary hash, source URL, size and SHA256 match
both pinned runtime/source ledgers. `--reuse-directory <folder>` reuses verified
bytes; missing inputs require explicit `--fetch`. Cache corruption, graph drift,
redirects and overwriting stop collection. It does not need runtime binaries,
execute sources, or infer complete notices or distribution clearance from a JAR.

The exact Microsoft Windows x64 JDK 21.0.12.1 archive is now pinned in
`../windows-jdk-input.json`. `../audit-windows-jdk.py` inspects it as data only:
publisher archive SHA256, reviewed release/API-source hashes, required jmod
presence, all file hashes and original legal notice bytes. Run43435499817 at
`bb17507` passes and retains reports/legal texts only, without extracting or
executing the JDK or uploading its binaries. The report inventories 486 files,
14 required candidate modules and 243 legal texts. This is not a JDK execution,
jlink image, detached-signature, reproducible-build or publication approval.

Fresh Windows candidate run43445587593 at `2e61eb4` passes all 35 JVM tests,
source-bound JDK preflight, creation of a 212-file runtime image, and the actual
Rust supervisor's canonical-path JVM handshake/private release RPC. Its bundled
Microsoft JRE reports 17 resolved modules, and 74 linked-image legal texts are
retained. Reports only are uploaded; no runtime or installer is distributed.
This verifies a private engineering startup path, not provider playback, the
full AnF desktop UI, signing, installed upgrades or publication. A diagnostic
comparison finds that image executable/DLL hashes differ from the vendor SDK's
bin files; jmod payload/transform provenance still needs explicit examination.
No vendor-signature or binary/source reproducibility claim follows from startup.
