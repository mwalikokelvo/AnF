# AnF feature-preserving reconciliation audit — 14 November 2026

This is a source audit and implementation plan, not an installer or a claim of release readiness.

## Pinned evidence

- Integration: `d37d1f660c3a7636870e2c7feb1b505a23dcc092` (source version 0.1.48).
- Main snapshot: `3d5d512fe074ebda1333e5c479422adfde4268fc` (source version 0.1.51).
- Confirmed common ancestor: `75ab303fb3ff99e009d5aefefa0ff5114c7db5ee`.
- Commit divergence after fetching enough history: **257 integration-only / 297 main-only**. Initial shallow-history counts were incomplete and must not be used.
- Paths changed from the ancestor: 563 integration, 7439 main; 62 touched on both sides. Renames are counted as delete/add in this inventory.
- Exact path lists and SHA256 comparisons: `main-reconciliation-audit-20261114.json` in the evidence directory.

## Confirmed source differences that block a blind merge

| Area | Main snapshot | Integration | Required treatment |
| --- | --- | --- | --- |
| Windows identity | `fr.louisraille.coucou` | `fr.louisraille.anf` | Preserve both installed lineages and audit migration/update behavior before selecting a release identity. |
| Source version | 0.1.51 | 0.1.48 | Keep newer main features; never market the older integration version as the newest all-feature update. Recheck versions/tags before choosing a successor. |
| Audio Studio pending starts | Current `resume()` awaits `beforePlay` then plays; no startEpoch/pendingStart guard | Confirmed cancelled-start fix with native before/after evidence | Port the narrow cancellation guard into current main, preserving its added callbacks and notes features. Main runtime regression still required. |
| Embedded Spotube | Both flat and `audio/` source copies exist; active main entry imports the flat module. Its adapter lacks the integration source-switch/ready/bounds handling. | Real native ready handshake, source switching, bounds/visibility checks and bounded output-device errors | Map active imports; port the component deliberately rather than replacing main's Music Hub or copying old duplicate domains. |
| New main features | Source includes JARVIS/KEVO, Subsonic and newer library sorting/player-time changes | Not the same source tree | Preserve them as requirements in the reconciliation matrix; source presence is not runtime acceptance. |
| Integration additions | Not guaranteed at the same paths in main | Local voices, managed connections/gateway, reviewed native MKR source/protocol work and test evidence | Trace moved/replaced modules before deciding whether anything is missing. An absent path does not prove a missing feature. |

## Implementation sequence

1. Start a managed isolated candidate from the pinned main snapshot (or a newer reviewed main). Preserve the existing integration checkout, original checkout, verified packages and libraries.
2. Port the small Studio cancellation/supersession fix first. Reproduce a delayed pause acknowledgement, cancel, verify no late audio start, then verify a fresh retry. Do not copy the complete old Studio file.
3. Port the reviewed Spotube build-tool/storage/error helpers and source-switch/ready/visibility adapter against the active main module paths. Preserve Archive, Subsonic, local library, podcasts, audiobooks, playlists and main's current UI. Keep old acceptance evidence tied to its original commit; do not relabel it as main acceptance.
4. Audit storage schemas, long-draft limits, Android app IDs/origins and actual signing fingerprints before merging identity or migration code. The Gradle default app ID is only one input; variant build scripts and actual APK signers still require inspection.
5. Reconcile remaining source modules individually, including local voice resources, connection consent, document cloud confirmation and MKR distribution obligations. No private recordings, models, passwords or signing keys in exports. The combined MKR edition licensing decision remains pending.
6. Run applicable current-main frontend gates and native/upgrade checks on the candidate. Actual generated-media playback remains blocked in the hosted environment by audio-output initialization; do not substitute a null sink and declare success.
7. Choose a successor only after checking current main/release versions, then build matching Windows/Android packages. Preserve the Windows public-publication hold and original Android signer requirements. Publish source/notices and accurate checksums only for verified permitted artifacts.

## Current execution boundary

Managed `create_worktree` was requested for main but did not return a workspace or operation ID after approximately ten minutes. Waiting was stopped; **no creation retry or manual fallback was attempted**. A subsequent read-only `git worktree list --porcelain` showed only the original integration checkout and no active Git process. An eventual app-side completion is still possible: inspect attached artifacts and Git worktrees before any future creation request. No main files were edited and no merge/cherry-pick started.

Graphify's current-checkout graph is absent. REA 6.8.0 is available; its current skill distinguishes ordinary source-repository analysis from shipped/runtime analysis. This report uses pinned Git/source evidence and makes no REA-derived binary/runtime claims. Main's AGENTS, HANDOFF, build status and builder runbook were inspected; their older status prose is not treated as proof of the current release state.

Existing blockers remain: original Android signer custody and upgrade paths, Windows Defender/public signing hold, the pending MKR licensing decision, complete corresponding source/notices, and real audio-output acceptance. No new installer/APK, full code export or general update is delivered by this audit.
