# Managed OmniRoute recovery: implementation specification

Status: pinned Windows repair delivered and verified in 0.1.36; explicit stale-state reset in 0.1.37 and truthful repair-progress phases in 0.1.38, and measured lightweight progress polling in 0.1.39. Runtime version upgrades and additional platform/fault validation remain pending.

The original defect was an instruction to reimport after early process exit while import refused an existing destination and Settings hid source selection. Version 0.1.36 supplies the stopped-only pinned repair route. Version 0.1.37 also keeps Stop available when an owned gateway has exited, allowing explicit reset before repair or restart. Home status validates the pinned manifest, not every payload file; startup still verifies every file before executing anything.

## First milestone: repair the current pinned version

1. Add an explicit workspace-only Repair component action. Require the managed gateway to be stopped and hold the existing operation exclusion lock. Never stop another application's process or alter external gateway credentials.
2. Pick and fully verify an extracted source against the existing reviewed manifest pin. Reuse bounded copy/hash workers and cancellation. Reject symlinks/reparse points, network/device paths, unexpected files, changed input and insufficient space. Do not weaken the trusted manifest to accept arbitrary replacement versions.
3. Stage a complete verified candidate in a fresh private sibling directory before touching the current component. Refuse cancellation before any promotion; keep the old installation intact on copy/hash failure.
4. Write a durable transaction journal with validated relative directory identifiers and explicit phases. Rename the existing component to a private rollback sibling, then promote the verified candidate on the same volume. Recover deterministically after failure/crash between those Windows operations. Never interpret file paths supplied by a journal as arbitrary filesystem deletion targets.
5. Verify the promoted component before marking repair complete. Retain the rollback until acceptance; recover the previous usable installation on failure. Preserve gateway session/configuration data separately, without publishing credentials or logging secrets. Cleanup only validated app-owned sibling directories after proving containment and rejecting links.
6. Report honest Ready/Repair needed/Recovery pending states. Keep failures visible, explain that startup verification protects execution, and offer a focused repair action. No automatic provider switching or cloud fallback.

## Required acceptance

- Existing current component, corrupt file, missing payload and invalid manifest.
- Cancellation during staging, changed input, disk full, locked destination, rename failure and concurrent start/repair attempts.
- Simulated interruption at every journal phase; restart reaches either the old verified component or the new verified component without losing the only usable copy.
- Malicious journal identifiers, reparse-point substitution and unrelated sibling data remain untouched.
- Native isolated-profile repair of the genuine 3.8.51 component, followed by actual generation, cancel/restart and forced-owner-exit checks.
- Browser keyboard/error flows and current Windows/Android packaging gates. New app behavior requires a new verified release.

## Later milestone: version upgrades

Only add another version after reviewing and pinning its full manifest, runtime distribution, dependencies, licenses and corresponding sources. Define supported prior pins and explicit rollback compatibility. The repair path above must not become a generic unverified installer or execute npm at runtime. Android parity remains a separately benchmarked implementation.

## Candidate implementation notes

managed_repair.rs uses a fixed private component-repair directory as a topology journal, rather than parsing arbitrary paths from a journal file. The previous copy is retained until the promoted copy passes the pinned verification. An empty acceptance directory survives rollback cleanup; it is removed last so interrupted cleanup cannot restore a partially deleted old tree. Before acceptance, interrupted swaps restore the prior copy. Startup/import/repair run recovery under the existing exclusive operation lock. No external credentials or sessions are relocated.

Unexpected entries, links, ambiguous copies or failure to verify an accepted candidate preserve data and return an error for inspection. The implementation does not guess which unverified copy to execute or discard. Power-loss durability, live disk exhaustion, runtime version upgrades and each platform require additional validation; process-interruption topology fixtures alone do not prove those cases. The original steps above remain the acceptance roadmap.

## Next milestone: measured repair performance and truthful progress

Source review on 2026-10-20 found the following candidates. The progress row was implemented and verified in 0.1.38; traversal/verification optimizations and drive classification remain proposed work. The genuine 0.1.36 repair baseline took 593,455 ms for the reviewed 27,379-file, 872,486,553-byte payload. That single run is a baseline, not a reproducible performance guarantee.

| Observed work | Proposed change | Required evidence before release |
| --- | --- | --- |
| `plain_tree` calls `no_links` at every entry; `no_links` walks all ancestors, followed by another metadata lookup. `inspect` and `remove_owned` repeat tree walks. | First instrument phase duration and metadata visits. Assess a traversal that validates ancestors at the boundary and each descendant as visited. Any reduction must address concurrent reparse substitution; a cached successful ancestor check is not sufficient authority for deletion. | Reparse/link substitution and unrelated-sibling fixtures, bounded depth/count, locked paths, and exact cleanup containment. Retain current checks until a replacement proves these properties. |
| Successful repair verifies the promoted payload, writes acceptance, then `recover` verifies the accepted destination again. | Measure verification separately from metadata and deletion. Keep restart recovery verification mandatory. Consider a distinct same-operation cleanup path only after reviewing mutation between verification and cleanup; the operation lock does not exclude another filesystem writer. | Changed candidate before acceptance, changed accepted payload, interrupted cleanup, ambiguous topology and rollback tests. Never remove startup verification or blindly reuse a prior result. |
| Copy counters reach their total while verification and rollback cleanup remain active. | Expose named inspection, copying, verifying, accepting and cleanup phases. Reset counters for each measured phase; use indeterminate progress where no honest denominator exists. Keep the operation busy until recovery/cleanup returns. | Browser/native assertions that copying at 100% is not Ready, completion appears only after cleanup, errors remain actionable, and cancellation during rollback cannot interrupt recovery. |
| Windows path syntax checks permit drive-letter paths, which can refer to mapped network drives. | Add and test drive-type validation before treating a drive-letter source or managed destination as local. Preserve supported local long paths, spaces and Unicode. | Injectable drive classification tests plus local/UNC/device-path regressions; do not claim a live mapped-drive rejection test until actually run. |

Run these as separate, reviewable changes rather than combining a filesystem safety rewrite with a progress-label change. Benchmark the genuine optional component again in an isolated QA profile, report per-phase durations and the full elapsed time, then run the existing generation/cancel/restart/forced-exit suite. Include Windows and Android release gates for each application update. Do not promise a speedup before measuring it.

C: free space increased to about 11.4 GiB before 0.1.38, allowing its paired release locally without moving or deleting files in this task. Recheck free space before the next full build. K: remains a network drive without authorization for release outputs. Keep private voice recordings/models local, preserve existing artifacts and do not retry the rejected cleanup through another mechanism.

Completed profiling target from the 0.1.38 review: full managed status rereads and validates the manifest. Version 0.1.39 measures that cost and moves busy polling to a workspace-only in-memory snapshot. Full startup verification, owned-listener attestation and explicit final status refresh remain intact. See IMPROVEMENTS-0.1.39.md for measured logical reads and latency; repair traversal optimization is still proposed work.

Storage update, 2026-10-21: the user selected cleanup of old AnF files. Sixteen unpacked portable builds (0.1.21-0.1.36), verified file-by-file against retained ZIPs, were removed; current/fallback builds, all archives/installers and private assets remain. C: gained about 30.0 GiB and had 35.4 GiB free afterward. The immediate build-storage blocker is cleared; continue locally on C: while checking capacity before each build. K: was not selected or used. No app code changed for this cleanup.

0.1.39 delivers the proposed lightweight progress snapshot, verified with native logical-I/O measurements and genuine repair/lifecycle tests. Full status and execution-time checks remain intact. See IMPROVEMENTS-0.1.39.md; traversal speed, mapped-network-drive classification, runtime upgrades and platform parity remain open.
