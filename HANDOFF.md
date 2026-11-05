# AnF integration handoff

An unfinished merge combines native QA 318faa3 (modern 0.1.41 lineage plus PR47/Atelier work) with main 75ab303 (0.1.48). Do not publish this source or reset/abort its merge. Both installed identity/signing paths must survive; current 0.1.48 metadata is not a verified successor release.

Historical source handoffs remain intact in [native QA history](docs/handoffs/native-qa-318faa3.md) and [main history](docs/handoffs/main-75ab303.md). They are reference snapshots, not claims about the active merge. ThingsBook/_core work remains separate.

Local concrete evidence and next steps are in the existing anf-pr47-evidence/Release-Continuity.md and latest checkpoint. Reader/UI, generated-media audio tests and frontend tests do not prove installed-upgrade or provider acceptance. Full native compile, both installed upgrade paths, original signers and source licensing remain release gates. Windows public publication is on hold; self-signing does not clear Defender or reputation.
