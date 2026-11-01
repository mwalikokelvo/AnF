# Feature-preserving release reconciliation

Status: integration investigation, **not a release**. Updated 2026-10-28.

The tested legacy upgrade is c8337c3534efb8aa1f745bb20daa1aae14fff953
(0.1.22). The higher public prerelease v0.1.41 points at
05027566d7afb12751821edb64a7566dc6de1b34. Neither tree contains all the
other's application work. Picking a whole tree would discard functionality.
Keep both parent revisions and existing release assets intact.

## Evidence and isolation

Work continues on `integration/preserve-v0141-pr47`, separate from main and
Claude's checkout. A read-only three-way preview finds **77 conflicts**, including
Android package renames, native command registration, music, workflow inputs,
versions, and installers. The common ancestor is
f9bbc4d0ad322099abf6af6768df68f9d3aefc7c (188 current-only / 63 reference-only
commits). The v0.1.41 side has no `_core` changes since that ancestor; retain
current `_core` unchanged and do not use it for AnF storage.

Reproduce tracked-source evidence without accessing user data:

```sh
node scripts/audit-release-lineage.mjs c8337c3 v0.1.41 /absolute/path/audit.json
```

This records identifiers, registered command/implementation signals, and merge
conflicts. Signals are discovery aids, not feature acceptance tests. In particular,
v0.1.41 already has timed lyrics through `listening-data.ts`; the absence of the
newer `lyrics.ts` does **not** mean it has no lyrics.

## Capabilities to combine

| Area | Preserve from tested main | Preserve from v0.1.41 | Acceptance |
| --- | --- | --- | --- |
| Navigation | Glass rail, keyboard focus handoff, pin clearance, narrow layout | Floating placement and restored identity | Normal clicks work with pinned/unpinned rail; phone/tablet layout; native focus |
| Music | Folder-aware LRC matching, clickable highlighted lyrics, metadata imports, recent/year/decade controls | Listening time excluding seeks, audiobook resume/rate/sleep, mixes and playlist interchange | Imported mixed folder; duplicate song names; seek/rate/restart; playlist ambiguity |
| Spotube | Current adapters and protocol tests | Acknowledged playback handoffs, retained native engine and optional host packaging | Real embedded playback, return to workspace, controls and lifecycle; no website substitute |
| Read-aloud | Reader/speech/cancellation improvements | Actual local synthesis, isolated output jobs and contained process trees | Real permitted voice synthesis/cancel/restart without cloud fallback; no private packs in public assets |
| Local AI | Existing request progress/cancel and status visibility | Owned process tree containment and independent real-inference checks | Inference, cancel, app exit and forced owner death terminate owned children |
| Connections | Existing provider/document confirmation controls | Saved connections, managed gateway progress, explicit Chat action, repair/rollback | Loopback auth, explicit start/use, cancellation, interrupted repair, mapped-drive rejection |
| Documents | Main reader/vault/knowledge fixes | Native PDF rendering, fonts and local tools | Existing documents/anchors/drafts survive; text/PDF import and export |
| Extensions | Apps catalog, plugin marketplace, companion/screen consent, update checker | Skill export, tool hub and about information | Both entry points reachable; private material sent only after confirmation |
| Delivery | Real installed seed/verify/reopen QA and rail regression | Identity/branding checks, process/voice/native music gates, reproducible optional packaging | Union of relevant checks; matched installer, portable and APK from same final source |

## Identity and signer constraints

Windows legacy ID is `fr.louisraille.coucou`; newer lineage is
`fr.louisraille.anf`. The reference `identity::data_dir` adopts existing legacy
directories in place, preserving the WebView profile, SQLCipher path, credential
service and path-derived vault account. Preserve byte-equivalent constants even
where the source uses escape sequences. Test existing-only, fresh-only, and both
directories; never silently merge or move live profiles.

Android is **two applications**, not a rename that can access the old sandbox:

| Baseline | App ID | Version code | Verified certificate SHA256 |
| --- | --- | --- | --- |
| Production 0.1.21 / tested 0.1.22 | `com.coucou.workspace` | 1021 / 1022 | `27789eee03090b2aa4c5fbf37737c8e4dbda61352c2557c076aec233ef4a7a2a` |
| Public 0.1.41 debug | `com.anf.workspace` | 1041 | `51a4f7d3677a4e63335b274ad8ce9b532c8816501057ad9d3cfc328136b32e1e` |

The v0.1.41 APK's published SHA256
`0724a3fa0fb5f1953681bf3563793a84c3b264a205b77b86ad89c75efd57886f`
was independently matched and its signature verified with official apksigner.
Its signer is **Android Debug**, different from the original production signer.
Signing a `com.anf.workspace` update with the legacy production key cannot update
that debug installation. Locate and fingerprint the actual original debug key
before promising an in-place .41 update. If unavailable, preserve the installed
app and provide explicit export/restore migration to a separately signed app;
never recommend uninstalling first. Do not generate a replacement key and call
it compatible. Emulator disposable-key upgrade tests do not verify signer custody.

For legacy users, preserve a build variant with `com.coucou.workspace` and its
original production signer. For newer users, either retain the matching signer
or clearly distinguish a backup-based migration. Confirm both full paths with
installed-data fixtures. Shared source can support variants; it cannot bypass
Android sandbox or signature rules.

## Integration order and completion gates

1. Reconcile identity/native module registrations and dependencies, preserving
   source containment and storage invariants. Review the actual three-way diff;
   never resolve all conflicts with one side.
2. Reconcile desktop feature entry points and music implementations. Retain the
   newer lyrics matching/click controls plus older listening/playlist features.
   The first isolated regression fix rejects invalid LRC seconds and nonfinite
   offsets; its expanded test fails against c8337c3 and passes on this branch.
3. Reconcile Android bridge/package moves, addons and media host lifetime. Preserve
   confirmation before cloud document excerpts; do not conflate the two app IDs.
4. Union build/QA gates and optional Spotube packaging, with accurate capability
   labels when its runtime is absent. Audit downloaded native components and
   license requirements; keep private voices out of distributable artifacts.
5. Set one successor above the highest existing release only after checking the
   remote inventory again. Do not mutate v0.1.41, .22 review assets, or newer main.
6. Run targeted tests, then full native/UI/installed upgrade checks for both data
   lineages and independent production signer comparisons. Build matching assets
   once source and packaging gates pass, rather than rebuilding the verified .22.

Windows remains self-signed, not publicly trusted. A clean local Defender scan is
not Microsoft clearance. Keep the unresolved public Windows publication hold;
do not install trust roots or weaken protections. Review drafts are not public
general releases. No integration completion or new installer is claimed here.
