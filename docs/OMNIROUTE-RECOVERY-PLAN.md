# Managed OmniRoute recovery: implementation specification

Status: pinned Windows repair delivered and verified in 0.1.36. Runtime version upgrades and additional platform/fault validation remain pending.

The startup error in managed_omniroute.rs tells the user to reimport after early process exit. managed_component.rs refuses import whenever the component destination exists. The settings UI also hides manifest selection for installed components. This leaves a corrupt installation without a supported repair route. Home status currently validates the pinned manifest, not every payload file; startup still verifies every file before executing anything.

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
