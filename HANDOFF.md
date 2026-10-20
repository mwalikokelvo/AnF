# Agent Session Handoff

**Worktree / Branch:** active release checkout; specialists use wt/*
**Assigned Role:** Head Orchestrator
**Last Updated:** 2026-10-18

## 1. Completed Tasks

- Read the implementation directive, starter kit and current release state.
- Governance committed as 82c2c52. Current source preserved in isolated snapshot
  7c98419; four requested worktrees provisioned without changing application files.
- Worktree safety tests pass, including dirty-tree retention and native Windows
  long/short path equivalence. No force-delete fallback.
- Frontend commit 50db9de passes source and focused inline reader browser gates.
- Mobile specialist built/verified baseline 0.1.30 APKs; those diagnostic artifacts
  are not the final renamed/integrated 0.1.31 release.
- Audit census and capability inventory: docs/IMPLEMENTATION-AUDIT.md.
- Pinned local voice model and CPU dependencies downloaded; real synthesis and
  packaged runtime integration are still under verification.
- User approved local-only synthesis using both supplied recordings, openly
  licensed bundled fonts with licensed imports, and a new Android identity with
  explicit export/import data migration.

## 2. Active In-Flight Work

| Mission | Owner | Branch | State | Acceptance |
| --- | --- | --- | --- | --- |
| Rebrand and migration | Core specialist | wt/core-refactor | Running | Source/path/ID rename; data compatibility documented and tested |
| In-document reading | Frontend specialist | wt/frontend-reader | Review (50db9de) | Inline canvas, controls and synchronized speech anchors on both surfaces |
| Android release | Mobile specialist | wt/mobile-android | Review / final identity pending | Actual new APK and blocking release workflow/gate |
| Fonts and voices | Asset specialist | wt/assets-engine | Running | Licensed font ingestion; real local voice pipeline and honest readiness/fallback |
| Exhaustive audit/integration | Head | release checkout | Running | Evidence-backed unfinished-feature inventory and ordered next sprint |

Mission briefs are in docs/SPRINT-MISSIONS.md. Detailed evidence is recorded per
specialist and consolidated here after integration.

## 3. Known Blockers and Cross-Team Needs

- Prior release source is dirty: snapshot it without changing existing files or
  the user's index. Specialist worktrees must receive that current source.
- Hosted CI was previously unavailable due to account billing. Local SDK/toolchain
  availability and real Android build failures need fresh verification.
- Voice recordings are reference material, not ready-made synthesis models. Need
  a local engine, reference preparation, model provisioning and offline tests.
- Strict identity migration changes Android installation identity; retain the old
  installed app until export/import is tested. Do not uninstall user applications.
- Existing limitations: provider authentication failure, optional OCR spelling
  failure, unavailable Strix runtime, and unimplemented service/media capabilities.

## 4. Next Step for Successor / Restart

1. Inspect this handoff and DECISIONS.md; verify worktree/branch before editing.
2. Resume specialist branches from saved files/commits, not from stale main.
   Agent credit failure interrupted the prior run; the user resumed on 2026-10-18.
3. Integrate core branding/migration then frontend/mobile/assets diffs relative to
   snapshot 7c98419. Primary checkout contains older source work; do not reset it.
   Reconcile shared files explicitly and preserve all original source additions.
4. Run ./scripts/verify_agent_gate.sh and the blocking --release variant before
   calling a release complete. Document unavailable checks and actual artifacts.

## 2026-10-18 continuation and additional requests

- Hourly thread heartbeat `resume-anf-implementation` is ACTIVE. Resume when capacity is available; remain quiet on unchanged blockers. Both core_resume and assets_resume reported workspace credits exhausted during integration; inspect their persisted changes before retrying.
- User explicitly confirmed permission for ALL THREE additional MP3 voice previews for new-speech synthesis, including Burt Reynolds-labelled preview. Keep all synthesis local. Pending ingestion into actual synthesis registry/proofs, not sample-only playback:
  - C:/Users/jhadfield/Downloads/voice_preview_burt reynolds™ - deep, smooth and clear.mp3
  - C:/Users/jhadfield/Downloads/voice_preview_serafina - sensual temptress.mp3
  - C:/Users/jhadfield/Downloads/voice_preview_kelvin mwamburi mwaliko.mp3
- Requested Ruflo, rea, NVIDIA nim-anywhere, Baseten and OpenRouter plugins. Plugin catalog search returned no matches; NOTHING installed yet. Ruflo upstream documents Codex MCP setup separately from Claude plugin marketplace commands. Baseten/OpenRouter URLs are organization pages, not specific plugin repositories. Continue compatibility review and supported installation, preserving existing config; do not claim success from downloading source.
- Core reported commit 842dcb1 before attempting frontend/mobile integration; inspect cherry-pick state. Asset workspace guard/request bounds/readiness improvements are persisted, but actual offline proof and final commit/build remain pending.

## Integrated continuation evidence (2026-10-18)

- Applied reviewed core/reader/mobile changes baseline7c98419 through84421eb to primary working files without resetting existing changes or index. Version0.1.31 and new Android identity integrated. Root stronger gates retained.
- Actual inline-reader browser regression PASS on primary checkout (PDF pages/annotations/search/speech/responsive layout). Renamed anf-hook release build PASS. Native application tests in progress; final packaged release not yet verified.
- Local CPU synthesis proof exists for both original recordings; three additional voices authorized and under specialist integration/proof. No cloud voice fallback.
- NVIDIA nim-anywhere marketplace add rejected by Codex: repository root has no supported manifest. Ruflo/rea add commands still pending network/Git completion; no installation claim. Organization-only Baseten/OpenRouter URLs need compatible concrete packages.

## Verification recovery (2026-10-18 evening)

- Ordinary usage available at heartbeat. Source freeze includes five-voice asset commit61ef526 + license checkout rules8231308; three new voices genuinely synthesized new text at24kHz offline. Optional CLI extractor followup56039c6 remains to apply if absent.
- Private ZIP64 voice pack completed: releases/AnF-Local-Voice-Pack-0.1.31-private.zip,2293003751bytes, SHA2568c8bc4624eb4762964c1a0ef44b73d8b956d1ed94534b2a1f7f6a4243cde9070. FullCRC/nativevoiceUI checks delegated to assets specialist.
- Primary sourcegate PASS (branding419textfiles, independent encryptedbackup/migration, regression checks). Focused font/provider tests PASS. Native suite after required temp access:72passed0failed12ignored. Original sandbox failure resolved; see .tools/logs/implementation/native-tests-31.txt.
- Native QA31 build running .tools/logs/implementation/qa-build-31.txt. Final actualAndroid31 gate running .tools/logs/integrated-android-release-31.txt via mobile specialist. Windows productionpackage not yet rebuilt.
- Core accidentally committed only initial check-branding.mjs as7b39f71 in primary; corrected scanner remains workingtree delta. All pre-existing changes preserved; no reset/amend.

## Android31 final gate PASS

Actual --release --offline gate completed0; Gradle BUILD SUCCESSFUL58s. Binary manifest com.anf.workspace, version0.1.31/code1031. DebugAPK15,431,185bytes SHA25690d9f5828007426018343fddea5c5cb0e40945b6bae55388b05f472bae15392b. UnsignedAPK14,104,079bytes SHA256fb5521587867b6cb1b2d4d721286e869b79a82672d1fef86907074406588d948. Both match current source/assets; ZIP/native16KB alignment pass; debug signature verified; negative provenance fixtures pass. No installation/publication. Reports releases/android-release-verification.json andSHA256SUMS-Android.

Windows QA build ongoing; Windows production package build started with log .tools/logs/implementation/windows-package-31.txt. Preserve0.1.30 artifacts. Neither ongoing build is a completed release claim. Finish nativevoiceUI and connections QA then validate installer/portable ZIP/sums before delivery. PrivatevoicepackCRC delegated assets_resume.

## User delivery requirement: releases after every update

User explicitly requires releases after every application update. Produce verified
Windows installer/portable and Android APK with version/checksums/download links
before declaring that update delivered. Current Android31 is verified; Windows31
production compilation and final five-voice native QA remain running. Do not substitute
Windows30 for31. This requirement is recorded in PROTOCOL.md for future sessions.

## Version0.1.31 delivery complete

Windows productionpack exit0. Verified593portablefiles byte-for-byte, ZIPCRC/SHA, current frontendembedding, noQAidentity, fullnative musicruntime. Installer1,816,509,775bytes; portableZIP1,820,422,330bytes. Artifacts windows/release/AnF-Windows-0.1.31-{setup.exe,portable.zip}; checksums SHA256SUMS-Windows andSHA256SUMS-Windows-portable. Android31 releasegate previouslyPASS. All5actualnativevoiceIPC, readerAudio1.5x, exactsentencehighlight, cancellation/windowdenial/fontloadingPASS; privatepackCRC26,536entriesPASS. NativeUI connections/PDF/exportPASS. No publicpublication or installation. Outstanding unrelated plugin compatibility/Strix/platform/service limitations remain as audit documents; this package does not claim those solved.

## Consolidated remaining implementation plan

User requested Android installation details plus every remaining capability and
implementation plan. See docs/REMAINING-IMPLEMENTATION-PLAN.md (2026-10-18), which
supersedes pre-integration status labels in the original audit. It records completed31
baseline separately and gives every known gap an integration step, acceptance proof
and dependency order. No new application code or release rebuild in this docs update.

## OmniRoute-first continuation (2026-10-19)

Ordinary usage available again. User's recurring instruction prioritizes OmniRoute.
Specialist core_resume owns isolated wt/omniroute fromcca9fa3: guided local setup,
bounded model discovery, explicit model/route selection and real local gateway →
bundled model generation proof. Existing adapter alone is not completion. npm
metadata reports3.8.51; pin package/runtime/integrity and isolated DATA_DIR/port.
No paid API keys or provider account required for bundled local inference. Cloud
providers retain their own account/entitlement requirements. No usage-limit bypass.

REL1 installer compatibility issue and READ3 OCR baseline remain open; prior
worktrees preserved. Root reproduced real OCR failure (seven etters) in
.tools/logs/implementation/ocr-baseline-31.txt. Android device QA blocked:no device,
emulator/systemimage/AVD; virtualization firmware unavailable. Mobile found actual
legacy namespace generator defect in Spotube preparation; scoped repair pending.

Ruflo Core0.2.11 installed fromruflo marketplace via supported plugin manager.
rea and NVIDIA rejected due unsupported root marketplace manifests. No claim they
are installed. Windows/Android31 remain latest delivered release until32passes.

### Next release integration in progress

Integrated mobile REL3/MUSIC2 patch3fbc5fa (excluding peer governance) into primary:
correct native module namespace, explicit Windows batch launch, pinnedFlutterprobe,
upstream-drift rejection, nativeworkflowpreflight. Focused check PASS in primary.
No claim native AAR/device playback exists yet. This is unreleased source pending
OmniRoute-first implementation and complete32 Windows/Android gates/artifacts.
Core runtime npm install and native gateway/catalog/probe UI work ongoing isolated.

## 0.1.32 final integration and gates (2026-10-19)

Recovered and applied reviewed OmniRoute specialist diff from wt/omniroute
(connections.rs/connections.ts/nativeQAfixture +OMNIROUTE.md/liveUIscript), preserving
all primary changes/index. Real pinned3.8.51 gateway→bundledllama localgeneration
and realworkspaceUI discovery/select/save/Chat flow passed before credit interruption;
UI IPC persistence fixture and separately compiled nativeadapter test are distinct.
SourcegatePASS. Integrated installer80c092d, OCRcd6470f, nativebuild3fbc5fa.
Metadata32prepared (only anf/anf-hook lockversions changed; dependencies retained).
Primary fullfreeze32. Currentnative tests .tools/logs/implementation/native-tests-32.txt,
QA build qa-build-32.txt, actualAndroidgate integrated-android-release-32.txt running.
No completed32artifact claim yet. Previous31downloads preserved.

OmniRoute managedoneclickruntime remains absent; localmanualservice setup is guided.
Known OCR El→Fl corpus diagnostic remainsstrict/ignored, notweakened. Strixscan,
AndroiddeviceQA/nativeSpotubeAAR/provider401 remainpending. No usage-limit bypass.

### 0.1.32 verification progress

Primary native suite: 79 passed, 0 failed, 14 ignored. Live OmniRoute test was
executed separately; the new OCR corpus diagnostic remains a documented failure.
Actual Android --release --offline gate passed; application com.anf.workspace,
version0.1.32/code1032. Development APK15,431,189 bytes, SHA256
2094e26c8e6f3bc8d5e3fead385c29877b70b7be31ae199da1682413566b9fee.
Unsigned APK14,104,079 bytes, SHA256
ab85cf98d8c0555584d972aec9f844b93fe44d9aab5f692a6e2e2bd762f57db0.
Current source/assets, ZIP integrity, native alignment, debug signature and negative
provenance tests passed. No phone installation or public publication performed.
Windows production packaging is active in .tools/logs/implementation/windows-package-32.txt;
QA build qa-build-32.txt. Await exit0, then native UI and portable checksum/CRC verification.

## 0.1.32 delivered and verified (2026-10-19)

Windows packaging exited0. Final portable verification passed:593files match the
complete folder byte-for-byte; archive CRCs/SHA256, frontend freshness, production
identity and native music runtime match. Installer1,816,543,693bytes SHA256
1f514399bfd396fd4c74f75377c9377b5829f5e377cdb3a70172c3eb7b5a5f5e.
PortableZIP1,820,434,778bytes SHA256
9f7c36e099fadbef39949f33d39cdbe77a56a654f7780c3549ae86159401fd4f.
Artifacts windows/release/AnF-Windows-0.1.32-setup.exe and-portable.zip; checksum
manifests in same folder. Android32 and native79/0/14/UIchecks passed as above.
Private five-voice pack31 is unchanged and compatible; no repeated CPU proofs needed.
Only matched isolated OmniRoute-test/model processes were stopped after successful
proofs; installed app/production connections untouched. Public hosting not performed.

Next: managed OmniRoute installation/lifecycle remains open; current integration is
guided existing-service setup +discovery/explicitroute/probe. Continue installer
realdevice/signing, currentSpotube401/deviceAAR, OCRmodelcorpus and Strix prerequisites
from REMAINING-IMPLEMENTATION-PLAN.md. Preserve all31and32releases. Worktrees retain
specialist work; OmniRoute credit interruption occurred before its final commit,
but reviewed dirtydiff/untrackeddocs/testscript were recovered into primary.

## Managed OmniRoute next increment (2026-10-19)

Current32 baseline preserved in temporary-index snapshot158501eb5a467a7e0563a090e30aec21ba32de64,
ref snapshot/managed-032; new isolated wt/omniroute-managed, no primary index changes.
Approved architecture: optional verified prebuilt component (no runtime npm/global
Node), picker for pinned manifest, bounded no-reparse hash-verified copy to private
staging+atomic promotion. Explicit workspace-only install/start/stop/status/use-route.
Own private DATA_DIR and credentials, scrub inherited Node/proxy/config overrides,
bind HTTP and separate WS listeners to numeric loopback only. Owned Windows job
cleans process tree, never attaches to existing services. Authenticated bounded
Rust loopback adapter shares bundled AI Engine/lock so provider restart/profile
changes cannot invalidate gateway keys or leave another resident model. Keep
external saved gateway settings until explicit switch. Agents own implementation,
component inventory/licenses and independent security/lifecycle review. No new
app release or managed-service completion claim until real install/lifecycle tests
and verified Windows/Android33 artifacts. Do not bypass usage limits.

## GitHub publication in progress — 2026-10-19

User authorized ongoing GitHub source/release publication. Verified32 snapshot
158501eb5a467a7e0563a090e30aec21ba32de64 fast-forward pushed to origin branch
codex/downloadable-releases; version tagv0.1.32 points to the same exact snapshot.
No main writes, no real-index/working-file reset. GitHub repository remains private;
release links require repository access. Source preflight525files excluded private
voice/runtime directories and passed credential-pattern/path screen. Primary source
matches snapshot; only later HANDOFF notes differed when checked through tempindex.

Draft release/assets upload is active via .tools/publish-032.py, log
.tools/logs/publish-032.txt (process48267). Helper gets saved GitHub credential only
in memory, never prints/persists it; official portablegh version/hash in
.tools/github-cli/provenance.json. One duplicate empty draft created during
recovery was removed after exact body/target/title/empty-assets matching. Current
upload is one remaining draft. Resume helper safely; no clobber of differing assets.
Verify server digests/sizes before draft=false. Privatevoicepack is NOT an asset.
ManagedOmniRoute remains isolated WIP; not part of32 release publication.

### Hosted CI publication limitation

GitHub check annotation118372250958 confirms jobs did not start because account
payments failed or a spending limit must be increased. Do not retry jobs or bypass
billing limits. Preview release notes explicitly distinguish locally verified
artifacts from unavailable hosted CI. GitHub upload remains authorized and uses
normal Releases API; repository stays private. Release currently has verified
source tag and installer uploaded; portable upload is active. No voice assets.

## GitHub 0.1.32 preview published — 2026-10-19

Published https://github.com/mwalikokelvo/AnF/releases/tag/v0.1.32 after all seven
release assets uploaded and server-reported sizes/digests matched local verification.
Source tag is158501eb5a467a7e0563a090e30aec21ba32de64; release branch pushed normally,
main unchanged. Public build files are installer, portable ZIP and development APK,
plus checksum/manifests. Repository remains private; access is required to download.
Voice packs/recordings and unfinished managed runtime were not uploaded. Evidence:
.tools/published-032.json and .tools/logs/publish-032.txt. Hosted CI is blocked by
GitHub billing/spending settings; release notes say local validation only.

## Managed gateway continuation — 2026-10-20

Capacity resumed; specialist agents made progress then failed with workspace credit
errors even while usage API reports ordinaryUsageAllowed=true (weekly16%). Do not
repeat agent retries or bypass limits. Root continued in the existing isolated
worktrees/omniroute-managed only; primary released app source remains 0.1.32.

Saved specialist modules now include managed install/start/stop/status/use, separate
managedGateway Chat selection, per-private-home OS keyring credentials, owned Windows
job, bounded component paths/inventory, shared local engine and cancellation guards.
Reviewer found a check/connect port race. Root added managed_http.rs with direct
numeric loopback sockets, duplicated original process handle, established server-side
5-tuple/PID attestation BEFORE any bytes, same held stream/no reconnect, bounded
HTTP framing/chunked parsing, fixed deadlines and proxy bypass. Setup and managed
generation use it. New parser/real socket wrong-owner tests are building in
.tools/logs/managed-transport-tests.txt (exec session51187). No passing claim yet.

Root owns primary/scripts/app-qa/omniroute-managed-native.mjs (syntax passes): actual
native import/start/Chat generation, external-config preservation, hostile-proxy
trap, workspace authorization, cancel/start/stop/restart/exit. Not executed yet.
Candidate optional runtime is .tools/components/omniroute3.8.51-win32-x64; startup
health/dashboard smoke passed, but candidate summary hash may predate dynamic
playwright dependency addition. Reverify full component before pinning manifest.
EXPECTED_MANIFEST remains PENDING_REVIEWED_COMPONENT_DIGEST intentionally. Licenses
(especially LGPL libvips source offer/unknown package inclusion) need final review;
no runtime component published or cleared for redistribution yet.

Root also refreshed REMAINING-IMPLEMENTATION-PLAN.md to actual delivered32 status,
and added local .tools/publish-verified-release.py (syntax checked, NOT executed),
which verifies every explicit allowed asset's local+remote digest before publication.
Sprint board: .tools/managed-sprint-board.json. Next: finish transport compile/tests,
component license/runtime verification, native lifecycle/UI, independent review, then
integrate and build verified Windows/Android33 and publish. No new release yet.

### Managed transport/tests and QA timing correction — 2026-10-20

Local WIP checkpoint4266e7f on wt/omniroute-managed now preserves native modules
and frontend controls (14 files; primary app still unchanged). Root added transport
and fixed two compile issues. Eight focused native tests PASS; full suite87pass,
0fail,14ignored; source gate PASS. Logs: managed-transport-tests.txt,
managed-native-full.txt, managed-source-gate.txt. QA build succeeded twice.

Current component manifest for local QA is
965aedb402bcdd521809c1037e0138630e2a5a10a8db9f0f02944b18855bd348,
27379files/872486553bytes. Native Sharp/libvips payload removed from managed text
profile (quarantined outside component),9missing third-party notices restored.
Basic runtime smoke stillPASS. Unknown-license package metadata has no executable
payload (khroma only has its retained MIT license). Additional source-availability
review for conservatively bundled web dependencies remains open before release.
Do not claim component legally cleared or published yet.

Two isolated native E2E imports were intentionally cancelled while investigating
slow setup. FIRST explanation blaming per-file sync was premature: removing sync
had little effect. Profiling shows substantial debug hashing cost. Per-file sync
has been RESTORED and manifest is also synced. Added opt-level3 specifically for
sha2 in Cargo dev/test package profiles (production profile unchanged) so QA does
not spend many minutes in unoptimized software SHA. These last changes are dirty
on top of4266e7f and need final tests/commit. Optimized-hashing QA rebuild currently
runs in managed-qa-build.txt, execsession26790. Last E2E execsession93013 was
cancelled intentionally; no passing native E2E yet. Use primary's updated harness
which measures importMs/startMs. Keep cancelled logs/profiles as evidence, never
misrepresent partial imports as completed. Next: rerun native E2E using rebuilt
worktree binary, fix actual startup/schema issues, finish review/package, integrate,
then33builds+publication. No new Windows/Android release yet.

### Managed OmniRoute production entry corrected - 2026-10-20

Primary application remains released32; no33 publication yet. Worktree omniroute-managed
has33 candidate changes on4266e7f. Latest full native suite:91pass/0fail/15ignored
(log managed-native-full-33-final.txt). Whole-tree rustfmt check detects substantial
pre-existing formatting differences; no bulk reformat was applied. Component integrity
PASS:27379files/872486553bytes/no extras/no reparse points.

Earlier genuine optimized native QA imported the component in492.4seconds, then setup
failed403. Upstream production uses runtime/dist/server-ws.mjs; bare server.js skips
peer-IP security initialization. Native launch and pinned manifest now use server-ws.mjs,
OMNIROUTE_PUBLIC_BASE_URL numeric owned origin, explicit authenticated CSRF flow, and
OMNIROUTE_ENABLE_LIVE_WS=false. Isolated control-plane probe using that entry and native-like
environment PASSed login/CSRF/provider-node/provider/provider-valid/model/key endpoints.
This is control-plane evidence only; full native Chat/lifecycle still needs rerun.

CURRENT manifest SHA256:9db5aec18cfc8f2e8a5ae160056b2b728a444b88eda0ac4c202bdfa12361bafb.
Old bare-entry ZIP retained under .tools/components/superseded-bare-entry, not for release.
Current final packager includes3 verified corresponding-source archives and notices,
Sharp/libvips native payload removed. Packager session30643; optimized QA33 finalbuild
session17473. Logs managed-component-package-final.txt and managed-qa-release-build-33-final.txt.
Final worktree sourcegate session54510 log managed-worktree-source-gate-33-final.txt.
Do not confuse prior primary32 sourcegate with candidate33 verification.

Four bounded import workers now retain every integrity/path/private-ACL/fsync/atomic
promotion check. Cancellation correctly owns local inference turns: queued cancellation
cannot stop another active model turn; active cancellation stops its own child. Test
fixture validates actual owned processes. All five private voices remain unpublished.
After final QA: integrate without discarding primary changes, build actual Windows/APK,
verify artifacts, normal source push and private prerelease publication. No limit bypass.

### Native setup passes; release33 builds in flight - 2026-10-20

Root committed c5913ff then c4e3d9c on isolated managed worktree.91native tests still
PASS after bounded parallel startup verification and corruption/cancel regressions
(log managed-native-parallel-verify-final.txt). Production-entry native start succeeded
in247005ms using reused isolated component; external connection unchanged and no proxy
traffic. Harness then asserted provider before async click completed (local!=managed,
line80), so no generation/lifecycle pass claimed. Added waitForFunction for actual
managed+chat selection and listener/auth checks. Reused test profile safely retains
current9db5 manifest; old backup is outside strict component inventory.

19 application/doc files now integrated to primary after preflight all matched158501
released baseline; no unrelated changes/index reset. Integration evidence:
.tools/managed-integration-033.json; helper .tools/integrate-managed.py.
Primary is now33 CANDIDATE, not yet published. docs/OMNIROUTE.md has candidate setup.
Native harness remains primary/scripts/app-qa/omniroute-managed-native.mjs.

Optimized QA rebuild with four-worker verify session79644 log
managed-qa-parallel-verify-build.txt. Run native harness after it exits0, reuse profile
first to verify startup/realgeneration/lifecycle, then fresh import as finalacceptance.
Optional component finalZIP PASS CRC,345205331bytes,SHA256
72f755f052d6d84b1752decb86fa3e4df929dc6e1e343628996dc583ab8f0e2b,
report .tools/components/component-package-verification.json. Never use supersededZIP.

Windows production pack:music session90065 log managed-windows-033-release-build.txt.
Android actualrelease gate session94074 log managed-android-033-release-gate.txt.
First Androidattempt failedonly because gradle.bat missingPATH; restartedwith
.tools/android/gradle/gradle-9.4.1/bin and correct privateJava/Gradle/SDK dirs.
Wait eachbuild exit0; nativeE2E andfullartifactverification required before source/tag/
releasepublication. Release helper .tools/publish-verified-release.py still allows only
7standardassets; extendexplicitreviewedcomponentvalidation before includingZIP+manifest.
No33 release, no GitHub upload from these checkpoints yet. Do not bypass limits.

### Shared target discovered; capacity checkpoint - 2026-10-20 13:14 UTC

Android actual33 releasegate PASSED (94074 exit0), currentAPK/signature/alignment/source.
QA worktree windows/target is a JUNCTION to primary/windows/target, so production
pack must NOT run while nativeQA executable uses shared target/release. Root stopped
only own queued Cargo PID47432 (exact hook build verified) to avoid overwritingQA;
production session90065 exited1 intentionally. No installer33 produced yet.
QAparallelbuild79644 stillinflight log managed-qa-parallel-verify-build.txt.
Afterit exits0: COPY QA AnF.exe to a NEW .tools/managed-qa-bin-UUID folder and junction
read-only resource folders local-ai/media/spotube to sharedrelease resources (or copy
needed resources). KeepcopiedQAexe isolated, then production pack can rebuildsharedtarget.
Runupdated nativeharness with copiedexe, currentmanifest, sourceRootprimaryorworktree33,
reuseexistingprofile17053 first thenfreshprofile forreal4workerimport. NoE2Epassyet.

Publisherhelper now supports explicit managedComponent version3.8.51/pin9db5 only,
checks exactZIPinventory/sourcearchives/report before allowing10assets. SyntaxPASS.
Report copied AnF/releases/omniroute-component-verification.json. NoGitHub33uploadyet.
Sourceworktreec4e3d9c is latest; primary19files integrated, bothappsource33.
Nativeall91testsPASSED,15ignored; nofullnativegenerationpassclaimed.
Capacityordinarytrue99percentat13:13UTC,0credits. Neverbypass; resumeordinarycapacityonly.

### Resume at normal capacity; managed single-listener profile - 2026-10-20

Capacity reset normally (0percent at17:16UTC); no limit bypass. Copied QA executable
AND physical local-ai/media/spotube resources to .tools/managed-qa-bin-a8c359a3-9271-422a-9b7f-6f91892f8214,
currentpointer .tools/managed-qa-bin-current.json. Avoid shared-target exe forQA.
First parallel-verify QA start116562ms passed but testfound2loopbacklisteners. Identified
20131 as optional EmbedWsProxy, not APIrelay. ExplicitequalAPI/DASHBOARD/OMNIROUTE ports
plus API_HOST127 retained fordeterminism, but actual fix is
OMNIROUTE_DISABLE_BACKGROUND_SERVICES=true (also retainsENABLE_LIVE_WS=false).
Isolated probe with this flag PASS:one127.0.0.1listener, allauthenticatedsetupendpoints.
Log managed-background-disabled-probe.txt. Component payload/pin/archive unchanged9db5.
Worktreelatest474bbeb; primarysourcefilecopiedmatches. Finaldeliverytests91pass/0fail/15ignored
log managed-native-033-delivery-tests.txt. Android33 finalverification PASS after latest
Windows-only changes (managed-android-033-final-verification.txt).

QA single-listener rebuilt successfully4m31s; pipeline28826 copiedonlyQAexe into isolatedbin.
That first E2E closedunexpectedly duringstartup and cleanupmaskedoriginalerror; no pass.
Harness nowrecords originalfailure and childexit; cleanupcannotreplaceprimaryerror.
Retry CURRENT session72671, log managed-single-listener-native-e2e-retry.txt;
startupwas verifying612048262/872486553bytes at lastread, noerror yet. Oldfailedreports
preserved by reuseharness. Keepreports honest; actualgeneration/lifecycle stillpending.
Avoid extraCDPclients duringtest ifpossible. Productionfinalpacksession90961 nowrunning
independently; log managed-windows-033-release-build-final.txt. It startswithactual91tests,
thenpack:music. Await0, verifyfullZIP+installer beforepublication. Androidready local33.
No33GitHubupload/tag/releaseyet. NextfullreuseE2Epass, fresh4workerimportE2E, artifactgates,
source snapshot preservingprimaryindex, privateGitHub33release10explicitartifacts.

### Managed native acceptance passed;33 draft uploading - 2026-10-20

Root now has a complete PASS using existing isolated installed component:
managed-native-reconnect-033.txt and profile17053/report.json passed=true,8checks,
start140702ms,1recordedCDPtransportreconnect,0proxyrequests. GeneratedrealFastanswer,
one127.0.0.1listener,unauthchatdenied,workspace-onlyIPC,stop/no-fallback,
cancel/no-stalepublish,restartandexitcleanupALLPASS. Prior apparentappcrasheswere
CDPtargetclosures: capturedchildAliveBeforeCleanup=true,noRustpanic,actualworkspace
recoverable. Harnessreconnectsobservesoriginaloperationwithoutresubmittingstart;
realanswerverifiedthroughactualChatUI. Capturelogapp-native.log isempty. No product
crashclaim; reconnectrecordremainsinevidence.

Freshprofile fullimport+sameacceptance NOW session99367,helpernodePID34020,
logmanaged-native-fresh-033.txt; unreviewedmanifestrefusalPASS,importinflight.
Waitfullpassbeforepublication. Reusehelper35692 exited; noparallelQAapps.
Primaryandworktreecodeidentical474bbeb; all91native tests0fail15ignoredPASS.
Windowsproductionpack90961 exited0; fullverifier32012PASS593portablefiles+CRCs+SHA,
installer1816636066bytes,portable1820529029bytes. Android33finalverifierPASS.

GitHubsourceSAVED via temporaryindex/commit-tree, normalfastforwardpush preserving
primaryrealindex/HEAD:7d1672b7d269e877f749c275e08281e32feeeb7f oncodex/downloadable-releases,
parent0f7ad2f,22scopedfiles,preflightexcludedprivate/binaryassetsandcredentialpatterns.
.tools/source-033-preflight.json andsource-033-commit.json. PrimaryrealHEADstill7b39.

DraftuploadNOWsession70424 logdraft-release-033-upload-retry.txt. Firstattempt404was
helperapi('') trailing slash; fixedrootURL,authenticationworks. Uploadsetupfirstcurrently.
Plan.tools/release-033-plan.json:10exactassets,source7d1672b,notesrelease-033-notes.md.
PublisherallowshelddraftWITHOUTtag; immutablev0.1.33tagcreatedonlywith--publishafter
acceptance. Privatevisibilityandlocal/remoteSHArequired;noclobber/force/voiceuploads.
Waitdraftuploadall10verifiedANDfreshnativepass,thenrunpublisherplan--publish. Ifsource
changesareactuallyneeded,newsource/planreviewrequired;currentappbinarysourceis7d.
No33publishedreleaseyet. Existing32stilllatestuntilfinalpublish.

### Release0.1.33 published - 2026-10-20

https://github.com/mwalikokelvo/AnF/releases/tag/v0.1.33
Tag/application source7d1672b7d269e877f749c275e08281e32feeeb7f. Tenassets remotely
SHAverified; evidence.tools/published-0.1.33.json andpublished-033-final.txt. RepoPRIVATE.
Windowsinstaller1816636066bytes,portable1820529029bytes; Androidcurrent33debugAPK;
optionalOmniRouteZIP345205331bytes,pin9db5 unchanged. No privatevoiceupload.

Freshprofile4e7d1ddc-80f2-4972-b250-6ae6d7d45b19/report.json passed=true,9checks,
import184706ms,start129526ms,proxy0. Allgeneration/auth/scope/stop/cancel/restart/
ownedNodeexitchecksPASS. Freshharnesssession99367done. Reuse17053passed8checks,
start140702ms,oneCDPtransportreconnectrecorded. BothactualmodelanswersverifiedUI.
91native testsPASS/15ignored; Androidgate+finalverificationPASS; Windows593files/CRC/
SHAverificationPASS. Publishedhelper45996done; draft70424done. Currentappstillinstalled32
was deliberately untouched; user must runnewinstaller to update. No uninstalls.

ForcedQAapptermination left2QAmodelchildren in the isolatedQAresourcefolder; root
cleanedONLYthose exactpathprocesses8740/53040. Installeduserapp/modeluntouched.
GatewayNodekill-on-closewasverified; localmodelownershipunderforcedterminationis a
separateexistinggap,nowexplicitnextwork. Do not claim allpossiblechildprocesskill
casescovered. KeepQAprofiles/evidence; don'tdeleteuserfiles or sharedtargetjunction.
DocsIMPROVEMENTS-0.1.33.md andremainingplanupdated; appcodeunchangedsince7d.
Next: savecompletiondocs normally onreleasebranch preservingindex; continuebacklog
withlocalmodeljobownership/Homegatewaydiscoverability thenreader/mobile/servicework.
Neverbypasslimits. Nextappcodechange needs newbuilds andnewrelease,not33assetclobber.

### 0.1.34 model ownership candidate in flight - 2026-10-20

Resumedordinarycapacity36percent; no agentcredits/no bypass. Worktree omniroute-managed
nowcontainsgeneralOwnedProcess::start_args(executable,OsStringargs,cwd,optionalenv).
Windowsmodel Engine uses existing suspended-create/assign-kill-on-closeJob/resume
primitive; no process can run before containment. Nodewrapper retains all strict
componentno-links checks and explicit allowlisted environment. GenericEngine inherits
sameenvironmentasbefore and preservesUnicodepaths. Commandlinequotes empty/Unicode/
embeddedquotes/trailingbackslashes and rejectsNUL/oversize. Linux Child path retained.
Cancellationfixture nowusesownedWindowschild; queued/activecancellationteststillPASS.

93native testsPASS/0fail/15ignored in model-ownership-034-native-tests.txt.
Alsoearlyrefusecomponentalreadyinstalled beforefullsourceinventoryscan; secondcheck
retainedafterprivatefoldercreation tocoverraces. Versions34preparedall5files.
Eightscopedfilesintegratedtoprimary onlyafterbaseline7dcomparison. Record
.tools/model-ownership-034-integration.json. Primaryindex/oldHEADpreserved.
Worktreecommitrecordsnewcandidate; sourceGitHubbranchstill7445425 completiondocs33.

QAresourcesphysicallymovedWITHIN.tools to path containing spaces+Unicode:
read .tools/managed-qa-bin-current.json. OldQAfoldernolongerexists;noactiveQAprocesses
werepresentatmove. CurrentQA34pipeline session97516 builds optimizedQAidentifier,
thenCOPYexe fromsharedtarget to physicalQAfolder andrunsenhancedharnesslog
model-ownership-034-native-e2e.txt. NewharnessrequiresonerealQAmodelafteranswer and
ZEROQAmodels+gatewayNodesafterforcedapptermination. Actualmodelpathcontainsspaces/é.
Currentbuildlog model-ownership-034-qa-build.txt; awaitexit/QAresult. Rememberworktree
windows/target isjunctiontoprimarytarget. DoNOT productionbuilduntilQAcopycompleted
(native-e2elogexists),thenisolatedexeallowsparallelproductionbuilds.

Androidactual34gate session2242 log model-ownership-034-android-gate.txt.
No34artifacts publishedyet. Latestpublished33 remainsvalid/private/10verifiedassets.
NeedactualQAforcedexit+normalgenerationpass,Windowsinstaller/portablebuildfullverify,
Androidgate,normalcandidate-sourcepushwithtempindexparent7445425,thennewv0.1.34
release tenassets. Optionalcomponentpin9db5/runtimeZIPunchangedcanreuseexactbytes;
never clobber33assets/tag; neveruploadprivatevoices; leaveinstalleduserappuntouched.

### 0.1.34 QA encoding correction - 2026-10-20

Worktreecandidate4b39251; primarycandidateSourcePUSHEDnormalbranch22694b1033361082ed477405c67124d36c95a395
(parent7445425).93native testsPASS/15ignored; Androidactual34gatePASS. QA34optimizedbuild
97516finished/copiedphysicalQAexe; productionWindowsbuild+verify85236inflightlog
model-ownership-034-windows-build.txt and-windows-verification.txt. Currentappsource
unchangedaftercandidatepush; physicalQAresourcepathcontainsspaces+é.

Firstnative34E2Egenerated20wordanswer butfailedownedmodelcount0. Diagnosticconfirmed
WindowsPowerShell5defaultstdoutcorruptsUnicodewhenNodeexpectsUTF8: literaléroundtrip
legacyfalse,explicitConsole.OutputEncoding UTF8true. Thiswasprocess-queryencoding,
notamodelstartfailure. HarnessnowexplicitUTF8forCIMqueries,waitsNewconversationready
andemptyassistantlistbeforequestion,andcapturesactivitystatusonfailure.
Noactualproductchangefromthiscorrection. Noexistinguserprocesswasterminated.
Installed legacy model PID34576wasobservedandLEFTUNTOUCHED; itisnotourQApath.

CurrentnativeUTF8retry session28436/helper43976, log
model-ownership-034-native-e2e-utf8.txt. AwaitallpassesincludingoneactualQAmodelbefore
forcedexitandZEROQAmodel/gatewayafter. Earlierfailedreportpreservedbyreuseharness.
No34release/tagyet; latestpublished33stillavailable. Sourcehelperfix+handoffmustbe
savedasnormalchildof22694b1before34tag; appbinarysourceunchanged. Privatecomponent
3.8.51pin9db5ZIPsameexactpublicbytes,canreuse33componentassetfor34release.

### 0.1.34 final native acceptance PASS - 2026-10-20

ManagednativeE2E model-ownership-034-native-e2e-identity.txt PASSall8checks,
report4e7d1ddc...passedtrue, start127249ms,proxy0. CIMmodelimagehasWindows\\?\prefix;
parentPID+canonicalrealpathfileidentitycorrectlyverifytheactualisolatedmodel rather
thanliteralpathstrings. RootCIMencodingroundtripalsoverifiedexplicitUTF8required.
Noactualproductchangeforharnessfixes. ModelUIgeneratedfreshanswers; nooldhistory
falsepositiveafterawaitingNewconversationready+emptyassistantlist.

Focusedfresh-profileofflineacceptancePASS:
.tools/local-model-qa-16c3ba8e-35fe-410d-ad36-94ff0bef1d16/report.json,
model-ownership-034-forced-exit-default.txt. ModelconfirmedrunningIMMEDIATELYbefore
forcekillapp; afterwardoriginalmodelgone. Actualimagepathcontains spaces+é. Noother
userprocesskilled. FirstfocusedattemptonlyfailedtryingtointeractwithcollapsedLocal
modeladvancedselector; testnowassertsdefaultFastselectionwithoutforcinghiddenUI.

All93native testsPASS/15ignored; Androidactual34gatePASS; Windowsproductionbuild85236
andfullverifierPASS593files/ZIPCRC/SHA. Setup1816638955bytes,portable1820530657bytes.
No34releaseyet. Sourceappcode22694b1unchanged; sourcecurrent3ec9a78testcorrection;
savefinalharnessparent/canonicalidentity+newfocusedtest+handoffchildbefore34tag.
Component3.8.51same9db5pin, publicZIPsame345205331bytes. Nextgenerate10assetplan,
draftupload/verify,thenpublishv0.1.34.33assets/tagremainimmutable/privatevoicesexcluded.

### 0.1.34 delivery complete - 2026-10-20

Published private preview: https://github.com/mwalikokelvo/AnF/releases/tag/v0.1.34
Tag and compiled source: 01d52097ac6d3453c87ee4fa0c0884d8d12d69f9. Ten assets verified by remote SHA-256.
Source checkpoint .tools/source-034-commit.json; exact artifact plan
.tools/release-034-plan.json; publication evidence .tools/published-0.1.34.json.
Windows installer and portable ZIP, Android development APK, checksums/reports
and unchanged optional OmniRoute 3.8.51 component are available.
93 native tests passed, 15 ignored. Full native managed lifecycle passed;
fresh Offline AI forced-owner-death test passed with model confirmed live
immediately before app kill and cleanup in 1854 ms. Windows package verification
matched 593 files and ZIP CRC/SHA. Android current artifact gate passed.
No private recordings or private voice models uploaded. User installed app/model
was left untouched. No Linux, physical Android or Strix verification claimed.

Next: Home gateway setup discoverability, reviewed component upgrade/recovery,
then reader/mobile/service gaps in docs/REMAINING-IMPLEMENTATION-PLAN.md.
Real checkout HEAD/index remain preserved; publication uses temp-index commit-tree.
Do not reset/pull or overwrite immutable release assets/tags. The docs-only child
following this release does not change application source or require a new binary.

### 0.1.35 Home gateway discoverability in progress - 2026-10-20

Windows Home AI chat card now shows managed local gateway status outside the
external connection disclosure. Missing/stopped/running/error states are separate
from external credential-store failure. Setup opens Settings and focuses the
managed gateway heading. Running state offers explicit use after native
omniroute_use readiness validation; failure stays visible without provider fallback.
Home status never starts/stops/installs a service or generates an answer.
Existing Open AI chat selects Offline AI as before.
TypeScript and home-managed-035-browser fixture passed all state/error/busy checks.
Android 0.1.35 actual release artifact gate passed. Windows QA build in progress,
then home-managed-native.mjs against isolated QA identifier; production pack and
full verifier still required before publication. No35releaseyet;34remainsavailable.
Files: four workspace TS modules, five version files, two scoped QA scripts,
HANDOFF. Preserve all unrelated dirty/untracked source. Source parent for next
normal temp-index commit: 5c655bebbc2361de6e5deb7140a81b7c90d7fa98.
The Android initial gate caught an obsolete legacy-name mention in HANDOFF;
wording corrected, scanner unchanged, full gate then passed.

0.1.35 native Home acceptance PASS: missing-state setup opens managed settings
and focuses its heading; existing offline Chat flow remains local and does not
start generation/model. Evidence home-managed-035-native.txt; fresh-profile
report home-managed-qa-41d85fc3-ca7f-417b-8550-6eb44253b417. Browser state checks and
TypeScript passed. Production pack session75868 still in progress; do not publish
until pack and .tools/verify-windows-release.py pass. No native model/gateway
process changes since34; no repeated inference claim for35. Android35gate passed.

### 0.1.35 delivery complete - 2026-10-20

Published private preview: https://github.com/mwalikokelvo/AnF/releases/tag/v0.1.35
Tag and compiled source: 64d6547274e4cc4488ed20827e8eca3bf8934446. Ten assets verified by remote SHA-256.
Source checkpoint .tools/source-035-commit.json; exact artifact plan
.tools/release-035-plan.json; publication evidence .tools/published-0.1.35.json.
Windows installer and portable ZIP, Android development APK, checksums/reports
and unchanged optional OmniRoute 3.8.51 component are available.
Home gateway browser state/error/busy tests and TypeScript passed. Native
Home setup/settings focus and preserved offline Chat navigation passed in isolated
QA profiles; no model launched by Home or provider selection. Windows complete
portable-folder/ZIP/hash verification and current Android artifact gate passed.
Native process behavior is unchanged from34; no repeated inference claim for35.
No private recordings or private voice models uploaded. User installed app/model
was left untouched. No Linux, physical Android or Strix verification claimed.

Next: reviewed component upgrade/recovery,
then reader/mobile/service gaps in docs/REMAINING-IMPLEMENTATION-PLAN.md.
Real checkout HEAD/index remain preserved; publication uses temp-index commit-tree.
Do not reset/pull or overwrite immutable release assets/tags. The docs-only child
following this release does not change application source or require a new binary.

### Next milestone reviewed - 2026-10-20 18:55 UTC heartbeat

0.1.35 remains the latest complete release. Capacity check ordinaryAllowedtrue,
primary99percentused,weekly47percentused,noextra credits; no bypass attempted.
Read-only audit found startup says reimport after early exit, but installed-state
import is refused and UI hides source selection. This repair/reimport mismatch
is NOT fixed yet. Saved docs/OMNIROUTE-RECOVERY-PLAN.md with stopped-only pinned
repair, stage-before-swap, durable journal/rollback, containment and failure gates.
Do not accept arbitrary new manifests or remove installed components to work
around the gap. Next implement/test this specification before version36.
No application code/version/artifact changed in this documentation checkpoint;
no replacement release required. Preserve all primary dirty/untracked state.

### 0.1.36 pinned repair source candidate - 2026-10-20

Latest published35 remains available. New source adds managed_repair.rs with
private topology journal, full staged pin verification, retained previous copy,
rollback on pre-accept interruption and acceptance-marker-last cleanup.
New workspace-only omniroute_repair shares operation exclusion and refuses a
running service. Start/import recover unfinished transactions. Repairable/pending
status drives explicit settings actions, including damaged-manifest cases.
Native suite101PASS/15ignored, eight new repair fixtures cover corrupt payload,
interrupted swap phases, locked destination, changed source/cancel, ambiguous
journal, accepted verification failure and protected cleanup ordering. Browser
repair flow and Home regression passed; Androidactual36gatepassed.
QA buildsession96444/logmanaged-repair-036-qa-build.txt; next copy QA exe to
.tools/managed-qa-bin-current.json physical dir after buildexit0, run real suite
with ANF_QA_REPAIR=1, ANF_QA_PROFILE=.tools/managed-native-qa-4e7d1ddc-80f2-4972-b250-6ae6d7d45b19
and source manifest .tools/components/omniroute3.8.51-win32-x64/component.json.
The suite damages only small RUNTIME-NOTICE.txt in exact isolated QA profile,
checks failed startup/untrusted repair/concurrent exclusion, repairs it, then
runs genuine generation/auth/cancel/restart/forced-exit gates.
Production pack and full verifier still needed; no36release/tagyet.
GitHub8recentjobs queried; same accountbilling/spending failure before steps.
No YAML fix exists for that refusal. Account admin action required; keep CI
remediation instruction open. docs/CI-STATUS.md records evidence.
An accidental cargo fmt --all pass formatted31unrelated Rust files; exact parent
bytes were restored ONLY after proving rustfmt(parent)==current normalized bytes.
.tools/format-only-restoration-036.json recordsproof. lib.rs minimal two-line
registration change likewiseproved. Do NOT run cargo fmt --all again; formatonly
new/managed files with skip_children. Never reset primaryHEAD/index or userchanges.
