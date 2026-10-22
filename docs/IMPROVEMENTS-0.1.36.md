# AnF 0.1.36 preview

The optional Windows OmniRoute runtime can now be repaired from the same reviewed component without deleting its installed directory manually. Stop the gateway, choose the extracted component.json, and select Repair installed component. Only the current pinned 3.8.51 payload is accepted. External connections, credentials and session directories remain separate.

Repair stages and hashes a complete candidate before retaining the installed copy and promoting the candidate. The replacement must pass full verification before acceptance. Before acceptance, interrupted swaps restore the previous copy; after acceptance, cleanup keeps its marker until rollback data is removed. Startup/import/repair recover pending state under the existing exclusive operation lock. Unexpected links, entries, ambiguous copies or failed accepted verification preserve data and report an error for inspection.

## Validation

- 101 native tests passed, 15 helper/manual tests ignored. Eight new fixtures cover corrupt payload, interrupted swap phases, locked destination, cancellation/changed source, wrong pin/self source, ambiguous journal, failed accepted verification and acceptance-marker cleanup ordering.
- Browser repair controls and Home regression flows passed.
- Native QA deliberately damaged only the isolated runtime notice. Startup and untrusted repair were refused; concurrent operations were rejected; pinned repair restored exact original bytes. The repaired component then passed real local generation, authentication, workspace permission, cancellation/restart and forced-owner-exit checks.
- Full repair measured 593.5 seconds and first managed startup 131.5 seconds on this PC while production packaging ran concurrently. Metadata and rollback cleanup performance remain improvement targets; this is an occasional repair operation, not normal Chat startup.
- Windows verification matched 593 portable files plus archive CRC/SHA. Current Android source/assets/alignment/development-signature gates passed. All ten GitHub assets were checked against local SHA-256 before publication.

## Limits

Windows remains unsigned; Android is development-signed. Android is rebuilt at 0.1.36, while managed repair remains Windows-specific. Private recordings and private voice models are excluded. Process-interruption fixtures do not establish sudden power-loss durability, live disk-full behavior or mobile parity. Malformed/ambiguous recovery state is preserved rather than guessed away. Runtime version upgrades still require a separately reviewed pin and package.

Hosted Actions jobs remain refused before runner startup because of account billing/spending restrictions. An account administrator must resolve that restriction; no YAML workaround or untrusted self-hosted runner was added. See CI-STATUS.md and REMAINING-IMPLEMENTATION-PLAN.md.
