# Primary playback resolver audit

Pinned MKR source: `78ac80c5101c293a5591a4cd5a1ebc90ccbc3138`.
Its actual Android playback path is:

`app/.../utils/YTPlayerUtils.kt` → `InnerTubeXPlayer.kt` →
`com.metrolist.innertubex.extraction.InnerTubeExtractor`.

The common `YouTube.getNewPipeStreamUrls` helper used by our initial prototype
is a legacy helper, not the full application's primary player. It catches
extractor errors and returns an empty list, which previously made network,
verification or parser failures look like a missing audio format. The new
diagnostic adapter preserves a safe reason code without exposing upstream
exception messages/causes, signed URLs or credentials. It performs no own retry
or account/client rotation. This does not make the legacy helper a complete
MKR playback implementation.

## Verified dependency targets

MKR references `com.github.MetrolistGroup.innertubex:innertubex-android:v0.7.0`.
The official dependency repository is
[MetrolistGroup/innertubex](https://github.com/MetrolistGroup/innertubex).
Its annotated `v0.7.0` tag resolves to commit
`cc74e737b6ae2875343fb2e31c7283e39e1cf72e` (tag object
`4a2d2926145ebadc9ac0a317f54e3f5efc370378`, unsigned).
The source declares an Android target and `jvm("desktop")` targeting JVM17,
with a JDK21 toolchain. The published JitPack root module metadata was also
read: its desktop API/runtime/source variants refer to
`innertubex-desktop:v0.7.0`. A JVM port therefore has a real upstream dependency
path; the upstream Android application itself still is not a Windows runtime.

The dependency is GPL-3.0. Before integrating or distributing it, pin resolved
artifacts and hashes, audit transitive/native QuickJS dependencies, retain notices
and complete corresponding source, and review the final native linking boundary.
The desktop dependency is now linked into the isolated prototype and its adapter
compiles. Original GPL text, source-revision metadata and the AnF MIT notice are
included in that component's JAR, with resolved dependency locks and SHA256
verification metadata. Complete corresponding-source/native-dependency review is
still unfinished, and no combined AnF edition is distributed. The repository-wide
MIT source license remains unchanged.

The new adapter preserves MIME/headers/range/transport requirements, limits each
extraction to one conservative client identity, and uses a tested sending policy:
first-party HTTPS only, no imported authentication, no redirects, no second player
request, and immediate latched stops on401/403/429. Remote cipher configurations,
token minting and Premium claims are disabled. A single controlled primary probe
was stopped by REQUEST_BUDGET before returning a compatible stream. The cap was
not raised and no retry followed that run. Bounded response diagnostics were then
added and verified offline. One updated probe observed a content-specific
UNAVAILABLE disposition, zero formats and exactly one request; it stopped
immediately without a second player request. Do not repeat this unavailable fixture
or infer that every music track/service is blocked, or that API credits are needed.

The diagnostics read at most2MiB and reject excessive JSON nesting. Only a known
disposition enum and format counts are retained; raw reason strings, video IDs,
signed URLs and account/session fields are omitted. Successful bounded bodies are
replayed to the actual deserializer. Duplicate-player and total-request-budget
failures now have separate reason codes and safe counters. Eighteen component
tests pass; there is still no actual provider playback/native host acceptance.

## Required host policy

- Do not copy MKR's app-level bot-mitigation/guest-session-rotation retries,
  embedded fallback service credentials or restricted Musixmatch components.
- Do not claim Premium, acquire tokens/accounts silently, read browser profiles,
  change identity after a denial or bypass CAPTCHA/authentication/rate limits.
  Preserve an immediate, sanitized failure path for provider restrictions.
- Keep third-party remote cipher/config services disabled unless explicitly
  configured and reviewed. Upstream supports `PlayerConfigRepository.disabled()`
  and an unavailable token provider; do not describe that as universal access.
- Preserve the returned audio MIME, headers and transport requirements.
  `ExtractedStream` can require bounded range/chunk requests, HLS or SABR.
  Passing only its URL to the current Windows URI player is not a valid general
  adapter. Explicitly reject unsupported transports until implemented.
- The Windows audio component currently proves local AAC decoding and transport
  only. An appropriate bounded HTTP/range input path, current-source failure
  isolation, cancellation, parent lifecycle and native/UI handoff are still
  required before it is an embedded MKR host. Android needs Media3 data-source,
  lifecycle/service and actual ABI/device verification.
- Capabilities must remain unavailable until the assembled host is present and
  actual in-app search/playback/controls have passed. Keep local Music Hub,
  Studio and Spotube working, with acknowledged mutual pause before play.

This audit is not a claim that the current environment can play a provider stream.
It prevents treating the initial legacy helper or separate AAC fixture as the
requested completed MKR integration.

## Isolated JVM and Android patch compatibility candidate

The offline real-request fixture confirmed that the old v0.7.0 dependency
initially selected `VISIONOS` version `0.1`. Upstream v0.7.2 marks this legacy
client probe-only after rejecting responses. The isolated JVM catalog now
validates that narrow patch at commit `195bac930073233fd2450edc5589033528cccd43`,
with exact artifact hashes and all84 source-JAR Kotlin files matching Git blobs.
The earlier pin remains in engine/PRIMARY-SOURCE-v0.7.0.json. No unrelated
transitive version or existing checksum was changed. The isolated Android catalog now uses the matching Android v0.7.2 variant.
Its exact AAR/source hashes and reviewed commit are in
android-catalog/PRIMARY-SOURCE.json. Run42002445872 passed43 host tests and
3 generated-media Android15 instrumentation tests. The request fixture selects
visionOS1.02 through mock transport on both platforms. No matching production
distribution or automatic new provider retry is implied.

The cause of the earlier HTTP200 unavailable response is still not proven:
upstream describes HTTP400 for the deprecated client. This candidate is a
compatibility correction before a request, not permission to rotate clients
after denial. One-client/denial budgets, disabled remote configuration and null
token provider stay enforced. Do not take latest v0.11.2 wholesale: it changes
cipher/runtime and authentication/fallback behavior that needs separate review.
No live fixture was retried, production discovery stays unavailable, and full
binary/source/distribution plus provider/native acceptance remains outstanding.
