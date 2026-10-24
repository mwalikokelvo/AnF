# A&F project handoff — formerly Coucou

Prepared: 23 October 2026; continued: 24 October 2026 (America/Chicago). Latest local checkpoint: native Windows installer and first shared-core extraction.

**Latest continuation entry:** Read `AF-Windows-Native-Checkpoint-2026-10-24.md` and `AF-Architecture-Unification-Audit-2026-10-24.md`. Both Windows base development EXE and embedded-music Android APK are built. Native Rust tests: 55 pass / 12 ignored; 25 focused suites pass. Source export: `build-work/AF-0.2.0-native-shared-core-checkpoint-2026-10-24.zip`. Device/installation acceptance, full parity, offline neural speech assets and production signing remain pending. Follow `AF-Delivery-Requirements.md` for both-artifact delivery.

**Current continuation entry:** Read `AF-Writing-Controls-Checkpoint-2026-10-24.md` for a toolbar lock bypass reproduced/fixed in a real browser, source-mode protection, 25 passing suites and current builds. Use `build-work/AF-0.2.0-writing-controls-checkpoint-2026-10-24.zip` as the current export, including browser evidence. IME/native/device acceptance remains pending.

**Previous continuation entry:** Read `AF-Writing-Lock-Checkpoint-2026-10-24.md` for state-level live-editor locks and transaction protections, 25 passing suites, Windows frontend build and current Android development package. Use `build-work/AF-0.2.0-writing-lock-checkpoint-2026-10-24.zip` as the current source export. Live EditorView/native/device acceptance remains pending.

**Previous continuation entry:** Read `AF-Fenced-Examples-Checkpoint-2026-10-24.md` for consistent fenced-code exclusion from tasks, habits and knowledge links/tags, 24 passing suites and current builds. Use `build-work/AF-0.2.0-fenced-examples-checkpoint-2026-10-24.zip` as the current source export. Native/device acceptance remains pending.

**Previous continuation entry:** Read `AF-Home-Refresh-Checkpoint-2026-10-24.md` for stale task-refresh isolation and capture/habit failure recovery, 24 passing focused suites, Windows frontend build and the new Android development package. Use `build-work/AF-0.2.0-home-refresh-checkpoint-2026-10-24.zip` as the current source export. Native/device acceptance remains pending.

**Previous continuation entry:** Read `AF-Search-Sessions-Checkpoint-2026-10-24.md` for stale search-load/navigation guards, 23 passing focused suites, Windows frontend build and the new Android development package. Use `build-work/AF-0.2.0-search-sessions-checkpoint-2026-10-24.zip` as the current source export. Native/device acceptance remains pending.

**Previous continuation entry:** Read `AF-Capture-Safety-Checkpoint-2026-10-24.md` for pending-save protection, consistent capture limits, 22 passing focused suites, Windows frontend build and the new Android development package. Use `build-work/AF-0.2.0-capture-safety-checkpoint-2026-10-24.zip` as the current source export. Native/device acceptance remains pending.

**Previous continuation entry:** Read `AF-Snapshot-Ownership-Checkpoint-2026-10-24.md` for conversation-bound snapshot restore controls, stale-refresh cleanup, 21 passing focused suites, Windows frontend build and the new Android development package. Use `build-work/AF-0.2.0-snapshot-ownership-checkpoint-2026-10-24.zip` as the current source export. Native recovery/device acceptance remains pending.

**Previous continuation entry:** Read `AF-Reader-Transitions-Checkpoint-2026-10-24.md` for document-switch speech/scroll/focus fixes, end-position navigation, 20 passing focused suites, Windows frontend build and the new Android development package. Use `build-work/AF-0.2.0-reader-transitions-checkpoint-2026-10-24.zip` as the current source export. Hardware/native acceptance remains pending.

**Previous continuation entry:** Read `AF-Sync-Inventory-Checkpoint-2026-10-24.md` for bounded, unique PC inventory validation, capability checks, 19 passing focused suites and the new development APK. Use `build-work/AF-0.2.0-sync-inventory-checkpoint-2026-10-24.zip` as the current source export. Native cross-device/device acceptance remains pending.

**Previous continuation entry:** Read `AF-Sync-Validation-Checkpoint-2026-10-23.md` for incoming conversation validation, requested-identity and legitimate conflict-pair checks, 19 passing focused suites and the new development APK. Use `build-work/AF-0.2.0-sync-validation-checkpoint-2026-10-23.zip` as the current source export. Native cross-device/device acceptance remains pending.

**Previous continuation entry:** Read `AF-Unicode-Restore-Checkpoint-2026-10-23.md` for UTF-8 restore limits, all-or-nothing host validation checks, 19 passing suites and the new development APK. Use `build-work/AF-0.2.0-unicode-restore-checkpoint-2026-10-23.zip` as the current source export. Device/native acceptance limits remain explicit.

**Previous continuation entry:** Read `AF-Native-Playback-Races-Checkpoint-2026-10-23.md` for pending native Play/queue cancellation guards, 19 passing focused suites, a rebuilt development APK and remaining device/native limits. Use `build-work/AF-0.2.0-native-playback-races-checkpoint-2026-10-23.zip` as the current source export.

**Previous continuation entry:** Read `AF-Audio-Ownership-Checkpoint-2026-10-23.md` for guarded music/read-aloud preparation, cancellation and stale-callback fixes, 19 passing focused suites, the new Android development package and remaining native/device limits. Use `build-work/AF-0.2.0-audio-ownership-checkpoint-2026-10-23.zip` as the current source export. Entries below describe earlier checkpoints.

**Newest source and Android build:** `AF-Android-Responsive-Checkpoint-2026-10-23.md` records the subsequent Android paired-PC writing/answer-safety work, 17 passing focused suites, the new development APK and verification limits. Use `build-work/AF-0.2.0-android-responsive-checkpoint-2026-10-23.zip` as the latest source export. The older continuation entries below remain historical.

**Latest continuation:** See `AF-Responsive-Writing-Checkpoint-2026-10-23.md` for the subsequent Windows responsive-writing work, shared editor fixes, passing checks and dated development APK. The latest source-only export is `build-work/AF-0.2.0-responsive-writing-checkpoint-2026-10-23.zip`. Earlier checkpoints remain preserved below.

**Implementation update, 23 October:** A newer source checkpoint and Android development APK now exist. Read `AF-Implementation-Checkpoint-2026-10-23.md` for draft protection, restored page metadata, saved evidence, 16 passing regression suites, the successful Android build, and the remaining native Windows/device verification. Use `build-work/AF-0.2.0-reliability-checkpoint-2026-10-23.zip` for further development. The October 13 records below remain historical evidence, not the latest source checkpoint.

## Read this first

A&F is at a **0.2.0 development checkpoint**. A combined Android development APK containing the embedded Spotube music module exists. Its file hash was checked again for this handoff. This does not establish successful installation, playback, background operation, or upgrade compatibility on a real device. Windows frontend builds are recorded as passing; a completed A&F Windows native installer is not established.

The immediate handoff is to validate the Android build on devices, finish Windows native hosting and packaging, and establish a shared development baseline with the coworker. Do not restart from an older Coucou archive or treat a frontend build as a complete application release.

### Evidence labels

- **Confirmed history:** a decision, historical capability, or checkpoint explicitly documented in available records. It does not imply that the current implementation has passed acceptance testing.
- **Checked for this handoff:** files/source inspected or hashes recomputed on 23 October. No application rebuild or device test was performed for this export.
- **Recorded verification:** a previous result supported by local status files or logs; not rerun for this handoff.
- **Open/unverified:** missing work, an acceptance gap, or a claim for which adequate evidence is unavailable.
- **Proposed next step:** a recommended action, not an already agreed assignment or completed feature.

## 1. Scope and confirmed direction

The current request confirms the name **A&F (formerly Coucou)**, Windows and Android targets, collaboration with a coworker, and the need to carry forward Spotube integration, Audio Studio separation, local music scanning, and collaboration/GitHub dashboard work.

Available source and continuity records establish these working decisions:

| Area | Confirmed direction / history | Implementation boundary |
| --- | --- | --- |
| Product | Continue the existing writing, reading, conversation, AI connection, and audio workspace under A&F 0.2.0. | Historical feature descriptions are not a fresh audit of every feature. |
| Windows | Existing Rust/Tauri host with a TypeScript interface. | Native toolchain/resources, Flutter child hosting, and installer acceptance remain unfinished. |
| Android | Java/WebView host with shared TypeScript workspace and an internal Flutter music activity. | Combined packaging succeeded in the records; real-device acceptance is open. |
| Upgrade identity | Retain Android release ID `com.coucou.workspace`; retain Windows identifier `fr.louisraille.coucou` and legacy installer keys/default paths. | Identity preservation alone does not prove a safe upgrade. |
| Music | Embed the modified Spotube player inside A&F rather than launch an external music application. | Android host exists; Windows embedded host remains open. |
| Audio Studio | Keep music listening and audio processing as separate destinations. | Both platform entry points contain separate Music Hub and Audio Studio sections. |
| Playback ownership | Pause the other player and require acknowledgement before transferring playback. | Regression checks are recorded; actual device behavior remains unverified. |
| Data | Preserve existing vault/backup compatibility and original user data. | Audio and original attachments are not covered by conversation-vault encryption or conversation backup/sync. |

The full historical conversation is not available as readable text here. The referenced chat, “Branch · Plan Coucou Collaboration” (`6acd92af-2700-83e8-8554-86d8f4fa5a74`), returns the user's continuation/export requests, assistant content-reference placeholders, and a notice that its original attachment contents are unavailable. Therefore this document does not invent missing approvals, detailed UI decisions, or coworker assignments.

## 2. Working baseline and current artifacts

Paths below are relative to the workspace root, so this document remains useful when exported with the project. A standalone copy of this Markdown file does **not** include these artifacts.

Workspace at preparation:

`C:\Users\jhadfield\.codex\.chatgpt-projects\g-p-6acd87885670819194650fb31b8c786a`

| Artifact / location | Role and status |
| --- | --- |
| `Project-Continuity.txt` | Main development continuity record, including dated corrections and final combined-build update. |
| `build-work/verification/RELEASE-STATUS.txt` | Latest consolidated build/remaining-work record. Prefer its final results over earlier blocker statements. |
| `build-work/af/work/coucou/` | Authoritative working A&F application source named by continuity. |
| `build-work/spotube/spotube-master/` | Modified Spotube source used for the music work. |
| `build-work/af/work/af_music/` | Generated Flutter module; full Maven output repository is under `build/host/outputs/repo`. |
| `build-work/artifacts/AF-0.2.0-embedded-music-development.apk` | Combined Android development package, 191,775,895 bytes. Present and hash checked. |
| `build-work/artifacts/AF-0.2.0-embedded-music-library.aar` | Music library, 25,609,709 bytes. Present and hash checked. The AAR alone is not the full Maven dependency repository. |
| `build-work/artifacts/AF-0.2.0-base-host-development.apk` | Earlier host-only development package, 15,211,245 bytes; excludes Flutter/Spotube. |
| `build-work/AF-0.2.0-native-host-checkpoint-2026-10-13.zip` | Latest named source checkpoint in the local records, 85,657,919 bytes. Present and hash checked. |
| `build-work/AF-0.2.0-development-checkpoint-2026-10-13.zip` | Earlier development checkpoint; do not assume it contains the final state. |
| `build-work/AF-0.2.0-audited-source.zip` | Earlier audited source checkpoint, explicitly superseded by later work. |
| `build-work/coucou/` | Extracted historical 0.1.19 source, release notes, source manifest and old build scripts. Reference baseline. |
| `build-work/Build-Android-Development.ps1`, `Build-Android-Music.ps1` | Current continuation's Android build wrappers. |
| `build-work/prepare-android-music-module.py`, `prepare-music.py` | Module preparation and music-source preparation helpers. |
| `build-work/verification/` | Build logs, focused regression results, package inspection records and inventories. |

### Integrity values checked on 23 October

| File | SHA-256 |
| --- | --- |
| Combined development APK | `f44c92dcdc48ee70ac620aa1c6c2ff1c7d19e946943343209ce9a5800ded6292` |
| Embedded music AAR | `ec6517efdb5d413454af53cc3d5483cc332b643e14f32c3240edc01aa59a94dc` |
| Native-host checkpoint ZIP | `493935cf2a2c49943e760de8c18a35d1cd36f8b526ad8d340eba7df45145c303` |

Hash agreement confirms file identity with the recorded checkpoint, not runtime correctness. Archive completeness and a clean-machine rebuild were not revalidated for this export. The packaging helper excludes tool caches, generated build folders, dependencies, `.env`, generated environment code and signing keys; the source checkpoint is not a fully offline build kit.

## 3. Windows and Android development state

### Android

**Recorded verification:** Base-host and combined-host Gradle builds passed. The embedded Flutter AAR build passed with `AF_EMBEDDED=true`. The combined APK contains `AFMusicActivity`, `AFMusicHost`, `AudioServiceActivity`, Flutter AOT assets and engines for `arm64-v8a`, `armeabi-v7a`, and `x86_64`. It excludes 32-bit x86, which the earlier base host supports.

The development APK is `com.coucou.workspace.dev`, version `0.2.0-dev`, version code `2000`, minimum SDK 26, target SDK 35. Signature, ZIP CRC, ZIP alignment, class/dependency and manifest checks are recorded as passing. The development certificate SHA-256 is:

`1eba0eecb2e5056058d8a244d228e3636acac8e8ac514a6dccc26940b53de95f`

An unsigned combined release is recorded at `build-work/af/work/coucou/android/gradle-build/outputs/apk/release/CoucouAndroid-release-unsigned.apk`, using `com.coucou.workspace`, version `0.2.0` / `2000`. It is not an installable signed production release. Its recorded SHA-256 is `78fe0134c1da91ff2713c411cbf0ee54eb3b1b77addbff9d6d0c0c3976ec8d6a` (not recomputed for this export).

**Open:** The original production signing key is unavailable. The required original certificate SHA-256 is:

`27789eee03090b2aa4c5fbf37737c8e4dbda61352c2557c076aec233ef4a7a2a`

The separate development key cannot produce an in-place upgrade of an existing production installation. No device was connected at the last recorded build. Installation, launch, vault migration, services, audio focus and lifecycle remain untested on hardware. The alignment inventory flags ARM32 `libsqlite3.so` at 4 KB; checked bundled 64-bit libraries meet the recorded 16 KB ELF alignment check. Device compatibility still needs acceptance testing.

### Windows

**Recorded verification:** TypeScript checks and Vite production build passed. Twenty-eight original sounds and their notices were restored. A pinned Tauri 2.12.0 NSIS template preserves legacy Coucou registry keys and directory defaults. Selected vault/encrypted-backup source files matched the supplied 0.1.19 baseline byte for byte.

**Open:** Provision/validate Rust, MSVC and Windows SDK; restore native local-AI runtime/models; implement the actual native Flutter child host and its plugin/lifecycle handling; build the native application and installer; test fresh install and upgrade over a backed-up previous installation. No completed A&F 0.2.0 Windows installer is established by these records. Historical Coucou 0.1.19 installer success must not be presented as current A&F packaging success.

## 4. Spotube integration

The module inventory identifies Spotube upstream version `5.1.2+45` and A&F module version `0.2.0`. Continuity records Flutter 3.35.2 at commit `05db9689081f091050f01aed79f04dce0c750154` with Dart 3.9.0. Seven media-kit dependencies were pinned to revision `d310049f24196250d876efb02b9ff56fa9ef5068`; NewPipe is pinned to `41cbd821ce49b9343136f67d83d3117e582dad75`.

**Recorded implementation and verification:**

- Embedded mode disables independent window controls, dragging/maximizing, close shortcuts/notifications, tray startup, forced refresh rate, and titlebar preference changes.
- Sleep timer pauses playback rather than terminating the host; Android task removal does not exit the host.
- Activation of the upstream invalid-certificate override was removed.
- Android-only module preparation excludes desktop assets and uses a module-local NewPipe vendor copy.
- Android host links the generated Maven coordinate `com.coucou.workspace.af_music:flutter_release:0.2.0` through `-PafMusicRepository=<actual repository path>`.
- Music bridge checks cover availability, acknowledged pause, refusal after failed pause, validated open, missing module and stale replies. Focused Dart analysis reports no issues; two embedded-mode widget tests are recorded as passing.

**Open:** Verify actual local/online playback, account/provider behavior, Android service/media-session configuration, background operation and player switching on hardware. Optional Last.fm credentials are unavailable; blank source values do not prove provider functionality. Windows mini-player and mini-lyrics window ownership guards still need work before embedding. Review redistribution notices and native dependency provenance when preparing a release.

## 5. Music Hub, Audio Studio and local scanning

**Checked for this handoff:** Windows and Android entry points define distinct `music` (Music Hub) and `audio` (Audio Studio) sections. Android provides an internal “Open Music Hub” action and checks embedded-player availability. Its wiring stops browser playback and suspends native playback before opening the embedded player. Audio Studio/native playback invokes embedded-player suspension before taking control.

Music Hub is the listening/library destination. Audio Studio remains the processing/editing destination. The separation does not establish independent encrypted storage, separate application processes, or automatic sharing of every track between the two systems.

Historical 0.1.19 notes describe queue/playlists, metadata/artwork, waveform processing and speech cleanup; Windows FFmpeg conversion; and Android Media3 background playback. Those notes also document important limits: conversation encryption/backup/sync does not cover audio, large-file processing remains bounded, and Android native conversion/decoder fallback and several advanced editing features remain unfinished. Do not promise all historical audio goals as delivered.

### Local music scanning

**Checked source / recorded tests:** `build-work/spotube/spotube-master/lib/services/local_music_scan.dart` implements read-only folder traversal without symlink following, duplicate/nested root handling, cancellation hooks and limits of 10,000 tracks / 100,000 entries. Continuity records integration with `localTracksProvider` and a maximum of four metadata jobs. Recognized extensions include MP3, MP4/M4A/AAC, FLAC, WAV, Ogg/Opus, WebM and AIFF/AIF; extension recognition does not guarantee codec support for every file/device.

Pure Dart checks are recorded for supported formats, limits, duplicate/nested roots, cancellation and metadata concurrency.

**Open:** Android-wide MediaStore discovery, permissions handling, visible scan progress/cancel controls, incremental metadata caching, and real-library performance/behavior. Folder scanning alone does not prove that all Android music is discoverable or accessible.

## 6. Coworker collaboration and GitHub/dashboard

**Confirmed history:** The user intends to collaborate with a coworker. The available recovery note mentions `mwalikokelvo/AnF` and an older “Set up AnF” environment whose Windows manifest was 0.1.18. It is not established as the authoritative 0.2.0 environment. A historical unauthenticated repository lookup returned 404; this does not determine whether the repository is private, removed or inaccessible. Current remote access, branch state, membership and CI were not verified for this handoff.

**Checked source:** `windows/src/workspace/dashboard.ts` implements the application's personal Home dashboard: resume reading/writing, daily quick capture, seven-day habits, and tasks extracted from saved drafts. Its recorded regression log covers fenced/quoted examples, source locations, local dates, append-only capture and size limits. This is evidence of a personal workspace dashboard, not evidence of a completed GitHub project collaboration dashboard.

**Open/unverified:** No complete GitHub collaboration dashboard, live issue/PR synchronization, coworker access, shared task board, CI release pipeline, or agreed ownership split is established by the reviewed material. The detailed historical dashboard specification is unavailable.

**Proposed collaboration setup:**

1. Confirm the canonical private repository, both collaborators' access, and which branch/commit contains the latest local source. Compare it with the working tree before replacing anything.
2. Import the reviewed current source and preserve the checkpoint identity; record an initial shared commit and build instructions. Keep keys, credentials, personal data, dependencies, caches and model weights out of source control.
3. Create a shared issue/project dashboard with Windows, Android, embedded music, scanning, data compatibility, and release acceptance workstreams. Track owner, acceptance criteria, evidence, blocker and status for each item.
4. Use reviewable branches/PRs and attach build/test evidence. Assign owners together; no assignments are assumed here.
5. Clarify whether “GitHub dashboard” means a GitHub Projects board or a new in-app collaboration feature. The latter requires a concrete specification and authentication/data-flow decisions before implementation.

These are proposed steps, not claims that a repository, board or integration has been created.

## 7. Verification gaps and next steps

| Priority | Work | Evidence required to close |
| --- | --- | --- |
| 1 | Establish shared source baseline and reproducible build instructions. | Reviewed commit, dependency/tool versions, artifact hashes and coworker reproduction record. |
| 1 | Install combined development APK on actual Android devices, including the historically named Samsung/DOOGEE targets where available. | Device/OS details, install/startup results and captured failures. |
| 1 | Exercise player ownership and lifecycle. | Music Hub ↔ Audio Studio/native queue switching; failed/delayed pause; screen lock; background/foreground; task removal; headphone removal; interruptions/audio focus; notifications and battery restrictions. No overlapping playback or unintended host exit. |
| 1 | Verify data safety and upgrade compatibility. | Backed-up test data; vault unlock, migration, recovery and restore; production upgrade only after secure access to the original signing identity. |
| 2 | Finish Android discovery UX. | MediaStore and permission behavior, scan progress/cancel, bounded memory, duplicate handling, rescan/incremental cache and unreadable/corrupt files tested. |
| 2 | Finish Windows native integration and packaging. | Native compile, embedded Flutter host and window ownership, local-AI resource checks, installer build, fresh install and preserved-data upgrade. |
| 2 | Confirm collaboration/dashboard scope. | Shared repository/board access, agreed ownership and acceptance criteria; separate specification if an in-app GitHub integration is desired. |
| 3 | Prepare production release evidence. | Clean build, dependency/licence inventory, signed Android package with original identity, artifact checksums and recorded platform acceptance. |

Existing recorded checks include 15 focused frontend regression suites, frontend bundles/typechecks, scanner/timer/widget checks, music-bridge/native media handoff checks, Dart analysis, and Android packaging inspection. They reduce specific risks but do not replace the acceptance steps above. Do not rerun every historic test merely to change this document; rerun relevant checks when code or dependencies change and perform the missing runtime tests.

## 8. Superseded blockers and reference map

Use the final combined-build entries in `Project-Continuity.txt` and `RELEASE-STATUS.txt` when interpreting older files:

- `build-work/af/work/coucou/BUILD-STATUS.md` and `verification/AF-0.2.0-verification.json` describe an earlier source-only checkpoint. Statements that no APK/AAR exists or Android toolchains are absent are superseded for this workspace.
- The Android SDK licence blocker was resolved by official tools after the user's corrected authorization, according to continuity. Do not revive it as an unresolved blocker.
- Android host/module connection is no longer merely historical reported work: combined artifacts now exist. Runtime acceptance is still open.
- Historical Flutter settings failures are recorded as resolved. Missing Windows native work and original Android signing access remain material blockers.

Primary local references reviewed:

- `Project-Continuity.txt` and `build-work/verification/RELEASE-STATUS.txt` — latest development chronology and release limits.
- `build-work/verification/native-music-final-test.log`, `spotube-focused-analyze.log`, `dashboard.log`, and `audio-hub.log` — selected prior check results.
- `build-work/verification/music-module-source.json` — module version and source inventory.
- `build-work/verification/development-checkpoint-sha256.txt` and `build-work/package-development-checkpoint.py` — checkpoint identity and packaging exclusions.
- `build-work/Original-Workspace-Recovery.txt` — historical recovery findings and repository/environment uncertainty.
- `build-work/coucou/SOURCE-README.txt` and `release-notes/Coucou-0.1.19-Code-and-Potential.txt` — historical architecture, capabilities and limits.
- Current Windows/Android workspace entry points, Home dashboard source, and Spotube scanner source — targeted source inspection.

Synced project material under `sources/` is read-only and was not changed. No populated source files were listed there during this review. The referenced conversation's missing attachment was not recovered. This handoff is a bounded synthesis of available evidence, not an assertion that inaccessible history or every source file has been audited.
