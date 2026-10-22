# AnF 0.1.42 candidate: endpoint security review required

The resident local speech candidate is **not released**. Version 0.1.41 remains the last verified Windows/Android release. Further execution of the affected candidate/test builds is on hold pending the security administrator's review. Protection settings and quarantined files have not been changed.

## Confirmed cause of the interrupted tests

On October 21, 2026, Apex One recorded seven AnF-related detections labelled **Unauthorized file encryption** at 19:10, 19:12, 19:21, 19:24 (two records), 19:30 and 19:32 local time. Records in the agent's `Misc/pccnt35.log` identify the exact isolated QA paths and the native test executable. The affected original executable paths disappeared; matching executable names are present in the agent's `Suspect` storage. Quarantined contents were not opened, copied, restored or executed.

The abrupt exits are therefore correlated with confirmed endpoint-protection detections, rather than successful test completion. Several interrupted runs returned exit code zero without completing their test body. A zero exit code is insufficient acceptance evidence: require the explicit test pass marker and all expected assertions/results.

The local incident record, matching detection lines, retained build hashes, failed native reports and private synthesis outputs remain under `.tools`. Only project-related detection records were collected. No private recording, voice model, generated audio, security log or dump is a release asset. No message or file was sent to a security vendor or administrator.

## Candidate and evidence

- Initial implementation commit: `5b2b6db74cdb7676dcff7d8f7a1816d6505248fc`. Subsequent diagnostic source adds static quit/exit-origin logs and stronger fixtures. The source branch is a candidate, not a released application.
- Retained traced QA executable: 17,287,168 bytes; SHA-256 `c5b29d3890b12f95934cfd530bb29aed8772ad36a22f28500a35bde8241e4e46`. This is an isolated QA build, not a production installer, and is not approved for release by this checkpoint.
- Eight Python parser/path/hash/entrypoint tests passed. The standard native suite passed 106 tests with 18 ignored before two further diagnostic fixtures were added.
- Two short real Windows process/descendant/environment/response-bound fixtures passed. A separate 70-second transport fixture passed and verified that its owner was outside the private child job.
- A standalone Python protocol probe synthesized all five real voices in one worker and exited cleanly. It ran alongside compilation, so its times are functional observations only.
- Full app and native-core all-voice acceptance runs were interrupted by the detections. Idle cleanup, cancellation/restart, actual reader playback and combined managed gateway/model/resident-speech acceptance are **not passed** for 0.1.42. Earlier 0.1.41 evidence does not establish those results for this candidate.
- An actual Android 0.1.42 package passed its earlier source/assets/native/signature/alignment gate. A production Windows 0.1.42 installer/portable pair has not been completed or published.

The speech change uses bounded versioned pipes, full per-request provenance/file hashes, random per-request output directories, an embedded worker script and PCM WAV output. It cleans only known temporary job files. The broader application also contains existing encrypted storage features. These implementation facts do not establish whether the security detection is correct; review the correlated telemetry and source rather than treating the detection as a confirmed false positive.

## Required next steps

Have the security administrator review the detections, source and retained build hash using the organization's normal process. Keep protection enabled and quarantined files untouched. Do not repeatedly rebuild/rename/restore binaries or alter the implementation to evade the detector.

After the review outcome permits testing, rebuild the reviewed source and rerun the standard native suite, all three process fixtures, the real native-core all-voice/cancel/restart/idle fixture, and full native WebView voice/reader/forced-exit QA. Force-stop the owned application before disconnecting its browser debugger when testing abrupt owner death. Then repeat combined OmniRoute/model/voice checks, current Android gates, production Windows packaging/verification, and explicit uploaded-asset hash checks before publishing paired releases.

GitHub Actions is independently blocked before runner startup by account payment/spending settings. This is a separate account issue; the endpoint investigation does not fix hosted CI or justify removing that roadmap task.
