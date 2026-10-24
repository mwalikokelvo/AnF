# A&F / AnF architecture unification audit

24 October 2026. Working source: `build-work/af/work/coucou`. This records the architectural mandate and completed migration stages, not a completed rewrite or production release. Latest stage: `AF-Shared-Domain-Checkpoint-2026-10-24.md` adds six neutral domain modules with direct Windows/Android consumers and a tested platform-dependency boundary. GitHub saving has resumed on the continuation branch; earlier no-repository statements below describe the original exported tree, not the separate Git clone.

## Confirmed source state

| Domain | Existing implementation to preserve | Remaining consolidation |
| --- | --- | --- |
| Audio DSP | FFT overlap-add spectral subtraction, profile limits, smoothed attenuation, cancellation and progress moved byte for byte to `shared/audio/denoise.ts`. | Native worker execution, batch jobs and hardware audio acceptance. No promise of artifact-free audio. |
| Playback state | Queue reconciliation, repeat, shuffle and ordering moved byte for byte to `shared/audio/queue.ts`. Old import paths re-export these implementations. | One cross-platform audio ownership contract and durable background queue. |
| Vault | Windows `windows/src-tauri/src/vault.rs` uses SQLCipher and OS credentials; Android `android/java/com/coucou/workspace/VaultRepository.java` uses SQLCipher and Android Keystore wrapping. | Different schema fields and platform key custody prevent blind database replacement. Preserve recovery, migration and encrypted backup behavior before a Rust core migration. |
| Local sync | Windows `local_link.rs` / `sync_data.rs`, Android `LocalLink.java` / `sync-data.ts`, with existing bounds and identity checks. | Shared versioned wire contract and real paired-device conflict acceptance. |
| UI | Android imports shared Reader, Writing, Studio, Audio Studio and other TypeScript components from the Windows source directory. Native entry points and platform services remain separate. | Move these modules behind a neutral shared boundary, then unify shell/state with explicit capability adapters. No aesthetic or feature parity claim yet. |
| Music | Android hosts the modified Flutter music AAR; Windows has its own web music tools. | Windows Spotube embedding is absent. Keep Music Hub playback and Audio Studio processing distinct inside the requested music workspace mode. |
| Speech / AI | Read-aloud uses Android native speech or browser speech synthesis. Windows has a local model/server integration, but this checkout lacks its runtime/model pack. | Piper/Kokoro, Whisper and custom voice models are requested capabilities, not confirmed installed pipelines. Model distribution, licensing and performance acceptance remain pending. |
| HUD | Existing Windows island/notch code and Android native hosts are present. | A single shared compact playback/task controller, touch/keyboard navigation and accessibility acceptance. |

Preserved algorithm hash evidence: `build-work/verification/windows-native-2026-10-24/preserved-audio-algorithms.json`. No encryption algorithm, database schema, original recording, synced source or prior release was removed. The compatibility re-exports hold no duplicate algorithm. No broad dead-code deletion was attempted without a dependency and behavior baseline.

## Build and workflow findings

The editable source is an exported tree without `.git`; `git status` reports it is not a repository. Neither `.github/workflows/windows.yml` nor `.github/workflows/build.yml` exists in this A&F working tree. Upstream Spotube workflows belong to that separate dependency and are not evidence of A&F CI success. No commit, push, cloud run or passing CI tag has been produced.

`build-work/Build-Windows-Development.ps1` now compiles the real hook relay, runs frontend checks directly without an npm launcher, and packages an explicit base development resource profile. It removes absent AI resource mappings from that profile instead of creating dummy models or silently editing the production profile. A short Cargo target path avoids the observed OpenSSL Windows path-length failure. The successfully built static OpenSSL library is reused. The full default AI package still requires actual models/runtime files.

The first native Windows check and NSIS package completed locally. Current package/test results and exact artifact identities belong in `AF-Windows-Native-Checkpoint-2026-10-24.md`; local success is not passing cloud CI. Android retains its verified embedded music build route and separate development identity.

## Ordered migration milestones

1. Complete and deliver both local development artifacts with hashes and passing baseline checks. Record native/device limitations separately.
2. Define versioned shared storage/sync/audio-job contracts and encrypted migration fixtures. Extract pure domain modules into `shared/` while retaining compatibility entry points until both hosts pass the same behavior suite.
3. Build the shared responsive shell: Reader & Vault, Music Hub & Audio Studio, AI Assistant, plus the compact HUD controller. Preserve draft/history, reading position and audio ownership across transitions. Retain explicit unavailable states for missing capabilities.
4. Introduce a shared Rust domain crate behind platform adapters. Prove Android native library packaging and encrypted migration/recovery before routing existing storage through it. Preserve legacy data for rollback.
5. Integrate neural speech and offline transcription with explicit asset manifests, cancellation, bounded jobs and model/device performance checks. Verify actual model inference before exposing availability.
6. Add reproducible Windows/Android CI against the real Git repository and resource manifests. Produce draft test artifacts only; validate YAML, shell commands and resource existence before any authorized push. Require both artifacts for each update.
7. Accept hardware journeys, accessibility, install/upgrade/recovery and background audio on both platforms before claiming parity or production readiness.

Immediate external dependencies are Android hardware verification, original release signing access, Windows offline-AI assets and a real repository/remote for cloud CI. Independent source consolidation and local checks can continue without these. No credentials are needed merely to continue the local migration.
