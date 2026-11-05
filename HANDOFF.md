# AnF integration handoff

## Completed Tasks

The feature-preserving merge of modern 0.1.41/PR47/Atelier and main 0.1.48 is committed (16a76fe), followed by Android entry-point compatibility fixes (438d80a) and upgrade QA isolation (5b80619). Both installed Android identities passed native PackageManager/ShortcutManager component acceptance on fresh Android 15 emulators in run41957708764. Full frontend tests, browser Music Hub/reader checks and targeted native tests have passed; scopes are recorded in the continuity evidence. These are not final release claims.

## Active In-Flight Work

Validate the complete release gate and installed baseline upgrades, preserving both Android app IDs/origins, saved data and original signers. Metadata 0.1.48 describes reconciliation source, not a verified successor public release. Preserve all merged modules and keep ThingsBook/_core separate.

## Known Blockers

Modern original Android signer custody remains unresolved; throwaway QA keys do not establish update compatibility. Windows signing is self-signed and public publication remains on hold for unresolved Defender detection. Production embedded MKR playback/provider lifecycle/licensing acceptance is incomplete and availability remains false. No private voices, recordings or signing material may be packaged. Explicit confirmation before cloud document transfer remains required.

## Next Step

Finish release-source gates, inspect baseline APKs and run isolated installed-upgrade/native UI QA before selecting a successor version and producing matching permitted Windows/Android packages. Never reset user work, overwrite releases or downgrade users. Local detailed evidence: anf-pr47-evidence/Release-Continuity.md and latest checkpoint. Historical source handoffs remain intact in docs/handoffs/native-qa-318faa3.md and docs/handoffs/main-75ab303.md; these are historical snapshots, not active build instructions.
