# Implementation sprint mission briefs

All roles read PROTOCOL.md, maintain their own HANDOFF.md and DECISIONS.md and run
`./scripts/verify_agent_gate.sh` (Windows equivalent: `node scripts/verify-agent-gate.mjs`).
Root governance is integrated by the Head. No application code is pasted into chat.

## Core Refactor Specialist — wt/core-refactor

Scope: tracked product source/configuration, Java/Swift/Rust package paths, scripts,
docs and branding references. Make renaming/migration changes only. Own a source
branding audit/checker. Preserve valid third-party attribution and functional
upstream references; encode legacy compatibility constants where necessary and
record why they exist. Ignore Git internals and generated/vendor/model trees.
Acceptance: AnF identifiers, filenames and UI; source audit; valid imports; desktop
data/credential compatibility; new Android identity with explicit data transfer;
no user data deletion. Report old/new path map before other work is integrated.

## Frontend Specialist — wt/frontend-reader

Scope: windows/src/workspace/reader.ts, reader.css, speech-player.ts, main.ts;
android/web/main.ts and focused reader browser/data tests. Coordinate assets via
an injectable voice/font registry instead of hardcoded asset assumptions.
Acceptance: the active document canvas stays inside Documents, with inline speech
start/pause/resume/stop/position/speed controls and exact sentence/word anchors;
original PDF/text modes, notes, search, keyboard access and saved positions work;
navigation away stops speech; no blocking modal or separate screen is required.
Do not modify native storage/Android build tooling or asset/model implementations.

## Mobile Specialist — wt/mobile-android

Scope: .github/workflows/android.yml, windows.yml and other release workflows;
scripts/build-android.mjs, prepare-android-sdk.mjs, verify-android-release.mjs;
android Gradle/build/release integration and Android package tests. Root gate is
owned by Head; request changes rather than overwriting it. Core owns identity
renames; coordinate final package namespaces before building.
Acceptance: identify why APK release lagged, build an actual APK locally, verify
version/application ID and contents, block every release on a matching Android
artifact, preserve offline/core features and document signing/SDK/CI limitations.
Assets-only success must never count as an APK. Run gate with --release.

## Backend / Asset Specialist — wt/assets-engine

Scope: new asset/voice/font modules, model provisioning and asset preparation
scripts, native asset commands and bundled redistributable assets/licenses;
speech-player integration is coordinated with Frontend. User confirmed permission
for both supplied M4A recordings and requested local-only synthesis; originals
remain private and unchanged. Use openly licensed default fonts and licensed
imports. Review the specified font extractor implementation and retain attribution
for reused code. Acceptance: local font import/registration/extraction tooling;
voice references with descriptive labels, real local speech synthesis path,
bounded processing/storage, readiness and failures, installed-voice fallback
chosen visibly, no cloud requests; verify actual synthesized speech from new text.
Do not pretend playback of a reference sample constitutes synthesis. Record any
model/hardware/runtime blocker with evidence and exact recovery steps.
