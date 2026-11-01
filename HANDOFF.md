# AnF shared handoff

Every assistant (Claude, Gemini/Antigravity, Codex, others) MUST read this file before starting work and update it before stopping. Keep entries short and dated. Workers report the final release (download links, platforms, exact version) back to the primary AnF conversation; a worker's own chat is not enough.

Last updated: 2026-11-01 by Claude (session https://claude.ai/code/session_01DHgVzsPDP7PNt8MKD8CHFa).

## Status of every line of work

| Line | Where | Version | State |
|---|---|---|---|
| GitHub `main` | github.com/mwalikokelvo/AnF `main` | 0.1.22 | Published source of truth; App Store build for the macOS app. |
| Gemini/Antigravity feature line | `feat/mkr-music-integration` (PR #48) | up to 0.1.47 | MKR Music lyrics provider and multi-LLM reconcile. Not merged. |
| Antigravity backups | `backup/antigravity-committed-2026-10-31`, `backup/antigravity-wip-2026-10-31` | 0.1.47 | Snapshots of the other assistant's work: domain reorg of `windows/src/workspace/{audio,ai,reader,editor,storage,marketplace}`, `ARCHITECTURE.md`, `scripts/package-release.py`. The wip branch is a superset. |
| Integration branch (this PR) | `claude/anf-v0147-integration` (from the wip backup) | 0.1.47 | Linux gates verified (below), plus this file. Not merged. |
| User's local copy | user's PC | 0.1.21 | Older than main; do not treat as authoritative. Windows desktop build is run separately by the lead on the user's PC. |
| Superpowers skills | `claude/superpowers-skills` (PR #49) | n/a | Shared skills in `.agents/skills/`. |
| Other open PRs | #8 dependabot `sha2` 0.10 to 0.11 in `crates/anf-vault`; #2 `codex/downloadable-releases` Android music previews and host lifecycle | n/a | Unreviewed here. |

Nothing in this table has been merged to `main` by Claude. Merging is a decision for the user.

## Verification so far (integration branch, Linux container, 2026-11-01)

Labels: tested = executed and passed; compiled = built only; installed = run on a real device (none yet).

- `npm ci` in `windows/`: ok, 0 vulnerabilities.
- `npm test --prefix windows`: tested, 138 pass, 0 fail.
- `node windows/scripts/test-e2e.mjs`: tested, 138 pass, 0 fail (run via the same node:test harness).
- `node scripts/check-release.mjs`: tested, 10 release regression checks passed.
- `npx tsc --noEmit` in `windows/`: passes.
- Android APK: NOT built in this container. The egress allowlist blocks `dl.google.com`, `maven.google.com`, `repo.maven.apache.org`, `plugins.gradle.org` and `services.gradle.org` (HTTP CONNECT 403), so the Android SDK, AGP 9.2.1 and dependencies cannot be fetched. Only `archive.ubuntu.com` is reachable. No APK, no zipalign 16 KB check and no SHA-256 exist for 0.1.47. Fix: allow those hosts, or run the `Android packages` GitHub Actions workflow (`.github/workflows/android.yml`, also triggers on PRs touching `android/**`).
- Windows-only, not run on Linux: `npm run pack` (needs MSVC, Rust, llama.cpp/Qwen/OCR downloads, `prepare-offline.ps1`, `prepare-media.ps1`), installer and portable folder, Defender/signing checks, hook relay on Windows. Installed verification of any build still needs a real device.

## How to build, test, release

- Windows/Linux (Tauri): `cd windows && npm ci && npm test && npm run test:e2e && npm run tauri dev`. Release pack on Windows x64 only: `./scripts/prepare-offline.ps1; ./scripts/prepare-media.ps1; npm run pack`. See `docs/RELEASE-BUILDS.md`.
- Release gate checks: `node scripts/check-release.mjs`. Android APK checks: `scripts/check-android-apk.py`.
- Android: `node scripts/build-android.mjs` (JDK 21, Gradle 9.4.1, Android SDK platform 37.0, build-tools 36.0.0, target SDK 35, package `com.coucou.workspace`). Version comes from `windows/src-tauri/tauri.conf.json`; versionCode is derived from it. Check 16 KB alignment with `zipalign -c -P 16 4 <apk>` and publish SHA-256 sums. The release APK stays unsigned unless the original signing key is available; never commit or publish the key. See `android/RELEASE-PROCEDURE.txt`.
- macOS: `cd NotchBuddy && xcodegen && xcodebuild -scheme NotchBuddy -configuration Debug build`. Never edit the `.xcodeproj` by hand.
- Keep versions in sync across `tauri.conf.json`, Cargo and frontend `package.json`. Note: `docs/RELEASE-BUILDS.md` still says 0.1.21 on this branch.
- CI: check results through the REST API (`gh api repos/mwalikokelvo/AnF/...`); GraphQL is unavailable from Claude Code sessions. Build workflows produce review artifacts only; they do not publish a GitHub release.

## Rules (from CLAUDE.md)

- Never restyle shipped UI (pills, cards, Settings, chat). Existing views stay as in `main` unless explicitly asked. New views follow the existing style.
- Pill IDs are stable contract values; never rename one. Keep the bundle identifier `fr.louisraille.NotchBuddy` and legacy storage/cryptographic names.
- Secrets in the Keychain only. No telemetry. Network only to services the user configured.
- Never block Claude Code (hook exits immediately if the app does not answer). Never overwrite `~/.claude/settings.json` without dated backup, diff and confirmation. Never send an email or approve a permission without an explicit click.
- Swift 6, SwiftUI + AppKit, no third-party dependencies unless unavoidable. 0 percent CPU when the island is hidden.
- Default style is Ponytail: smallest complete change, reuse first, never skip validation, security or tests for non-trivial logic.
- Release reports lead with usable download links and accurate platform/version labels. Distinguish installed verification from compilation and browser fixtures. Do not call a review build a verified functioning release.
- Never force-push, never merge to `main` without the user.
- Check installed skills before specialized work; keep them current with `skills update -g`.

## Open items

1. Allow the Android build hosts (or run the Android workflow) to produce APKs, 16 KB alignment check and SHA-256 sums for 0.1.47.
2. User decision: how PR #48, the backups and this branch relate (the wip backup is a superset of the committed one); then merge order into `main`.
3. Windows 0.1.47 installer: built separately on the user's PC; record the result, links and exact version here when it is done.
4. Update `docs/RELEASE-BUILDS.md` version text when 0.1.47 is chosen as the release.

## 2026-11-01 Claude: sha2 0.10 to 0.11 (supersedes dependabot PR #8)

Branch `fix/sha2-0.11`. `format!("{:x}", Sha256::digest(..))` does not compile on sha2 0.11 (E0277), so every use now goes through an explicit lowercase-hex helper `sha256_hex` (anf-vault, `_core`, vault-fixture, `windows/src-tauri/src/hashing.rs`). Keyring credential id, sync revision/conflict ids and add-on/file fingerprints are byte-identical (pinned by tests against NIST vectors and golden values produced by the 0.10 code).

- tested on Linux (`cargo test --locked`): `crates/anf-vault` 7 pass, `_core` 14 pass, `contracts/tools/vault-fixture` 1 pass (no committed lock there).
- Tauri crate (`windows/src-tauri`): NOT compiled locally (gdk/glib missing). The new `hashing.rs` module was tested standalone against sha2 0.11 (2 pass). Full crate verification is CI only.
