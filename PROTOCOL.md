# Agent Team Protocol

## Hierarchy and routing

The Head Orchestrator owns governance, mission briefs, integration and release
verification. Specialists implement application changes in assigned worktrees.
The user communicates with the Head. Specialists report through their worktree's
HANDOFF.md, DECISIONS.md and concise agent messages.

## Git and branch safety

- Never push or merge into main/master. The active checkout remains on its existing
  release branch. Do not reset, stash, discard or commit unrelated user changes.
- Each specialist uses its assigned wt/* branch and isolated worktree. Start from
  the recorded sprint snapshot containing the current released source, not a stale
  default branch. A snapshot does not publish or claim approval of prior changes.
- One integrator applies reviewed specialist commits/patches in dependency order.
  Reconcile shared-file changes explicitly; never overwrite a peer's implementation.
- Worktree removal refuses dirty trees. No force-delete fallback. Generated outputs,
  downloaded models, credentials and private recordings are excluded from Git.

## Communication and verification

Mission briefs specify ownership, exact file scope, acceptance and gate commands.
Run ./scripts/verify_agent_gate.sh before handoff; record failures honestly. A full
release additionally requires --release, an actual current Android APK build and
artifact verification. Assets-only builds cannot satisfy the release gate.
Do not suppress failed checks or describe source code as a built/installed release.
Keep generated reports and detailed logs outside Git under the local tools folder.

## Autonomous decisions

Continue authorized work without repeated permission requests. Record consequential
architecture, migration, model, licensing and failure-recovery choices in
DECISIONS.md. The supplied starter-kit scripts are examples: adapt them to this
stack and strengthen unsafe cleanup and fail-open test behavior.

## Data, assets and product truth

Preserve existing projects, backups, reading anchors and recordings. New identities
use explicit migration paths. Never label an audio sample as a text-to-speech voice
unless real synthesis is implemented and verified. No silent cloud voice fallback.
Import Adobe fonts only from the user's licensed local files/cache; public builds
bundle redistributable fonts and their licenses. Network/model downloads must be
versioned, bounded, verified and documented; missing components fail visibly.

## Dependency order

Bootstrap → branding/migration → reader, Android and asset implementations →
integration → static/native/browser checks → real Android package → release gate.
Parallel discovery is allowed; application edits start only after bootstrap commit.

## Release delivery after every application update

The user requires downloadable releases after every app update. Treat an app
update as delivered only after producing and verifying current Windows installer
and portable ZIP plus Android APK, with version, checksums and direct local download
links in the final response. Never present source-only changes or a previous-version
artifact as the new release. If a platform build fails, state the specific blocker
and keep release delivery outstanding. Complete native/UI checks required by the
change before calling the package verified. Local artifact delivery is authorized;
public hosting/publication remains a separate action. Keep private voice recordings
and their derived private voice pack out of public releases.

## GitHub publication authorization — 2026-10-19

The user explicitly requested saving/uploading/publishing each update to GitHub.
Publish verified release source on the existing release branch and versioned public
build artifacts through that repository's Releases. Keep main protected, never
force-push, preserve working files/index, and keep private recordings/voice packs,
credentials and unfinished unverified runtime components out of release assets.
Repository visibility must remain unchanged. Draft uploads become published only
after remote size/digest verification. Do not bypass account usage limits.
