# Windows runtime inventory gate

The native host now accepts `VerifiedRuntime`, not a renderer-selected executable
or arbitrary classpath. Verification consumes a manifest compiled into reviewed
AnF source (`include_str!`), independently of the runtime directory it describes.
No production inventory or bundled runtime has been supplied yet. This is not an
installed/available AnF music source.

Engineering preparation is now executable: run the isolated Gradle
`auditWindowsRuntime` task, then `node integrations/mkr-music/prepare-runtime-candidate.mjs
--check-inputs` from the repository root. Without `--check-inputs`, the preparer
creates a fresh, never-overwritten candidate under `engine/build/runtime-candidates`.
It builds a small local Windows JDK21 image with jlink, copies only audited engine
and resolved dependency JARs with hash checks, and emits an exact inventory outside
the bundle. It copies no installed app, private voice or user library. All input
hashes are checked before creating the candidate or invoking jlink.

`audit-dependency-review.py` checks each exact dependency hash and collects safe
cached POM/source-archive evidence. It rejects XML entities/DOCTYPE and oversized
metadata, follows only literal cached parent coordinates, and records inheritance
or properties that remain unresolved. POM declarations, inspected upstream file
headers and source-archive presence are evidence for review, never automatic
clearance. `dependency-evidence.json` retains immutable upstream observations
where cached metadata omits a declaration. No remote URL is fetched by this
collector. Its report also flags mixed Ktor module versions without attributing
an earlier test failure to them.

Candidate status and dependency audit explicitly retain
`readyForPublication:false` and `sourceCompleteDistributionPrepared:false`.
Embedded notice-name discovery is an audit aid, not license clearance. The actual
resolved graph and full corresponding-source/notices must be reviewed before a
production source pin or installer can be promoted. Generated candidate bytes are
ignored build outputs; no public download or app capability is created.

An opt-in native test, `resources::tests::real_candidate_inventory_and_child_handshake`,
accepts `ANF_MKR_CANDIDATE_BUNDLE`, checks engineering-only status, hashes and locks
the complete image, and launches the actual fixed production entry point using
that image. It checks a private-pipe RPC and teardown without a provider request.
Its generated test manifest is deliberately not a reviewed production source pin.

The manifest schema is:

```text
schema: 1
java: runtime/bin/java.exe
classpath: [lib/catalog.jar, ...all required dependency JARs...]
files: { each relative file path: its reviewed lowercase SHA256 }
```

The dedicated directory contains only inventoried runtime files. Keep the source
manifest outside it; do not create a self-hashing manifest file or generate trust
from whatever files happen to be installed. Inventory must include Java's native
libraries/modules/configuration, all classpath JARs and redistributed notices.
Prepare it only after dependency/corresponding-source review and the actual
runtime build. Do not include API keys, user libraries, recordings or voice models.

Verification rejects unknown schema fields, absolute/traversing/ambiguous paths,
unlisted or missing files, symlinks/reparse points, changed SHA256, excessive
depth/count/size and missing classpath members. Hashing streams fixed-size blocks;
files stay open with read sharing only to deny writes/deletion for the session.
The complete runtime is bounded to 1 GiB and 4096 files, each at most 512 MiB.
Prefer a small reviewed runtime appropriate for the user's 8 GB Windows machine.

The fixed child command uses a 256 MiB Java heap and two active processors,
private pipes and a hidden window. The verified production path clears inherited
credentials/Java options and passes only required Windows/temp environment values
plus a fresh session nonce. It cannot select another main class or a shell. A
Windows kill-on-job-close job owns the child. Missing job assignment or handshake
fails closed. Normal teardown kills/reaps it and releases resource locks.

The native decoder accepts a loopback source only as an opaque receipt minted by
that owned session. Receipt fields are private and its Debug output is redacted;
it cannot be deserialized from a frontend URL. Public URL loading still rejects
files and localhost. Revocation, expiry and catalog process loss stop buffered
audio via an owning-thread watchdog; no frontend polling is required. With no
owned source, that worker blocks instead of waking periodically.

Explicit generated-fixture QA also has a private test launch path against the
engineering JDK and test classpath. It bypasses the package inventory deliberately
and must never be described as a verified production bundle. No app UI capability
is enabled by those tests. Remaining release work includes a real inventory and
corresponding source/notices, permitted provider playback and active Studio/
Spotube handoff acceptance, Android hosting/signers and installed upgrades. The
disposable app-owned Tauri runner now verifies actual generated-AAC native
playback and local WAV handoff; it does not approve a production runtime graph
or enable the shipped source selector.
