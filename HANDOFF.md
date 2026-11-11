# AnF shared handoff

**Start here: [docs/BUILDER-RUNBOOK.md](docs/BUILDER-RUNBOOK.md)** - the shared recipe (reaching the user's PC, Windows and Android builds, CI limits, PR conventions, verification labels). Read it before this file's status table, and append your result below when you finish.

Every assistant (Claude, Gemini/Antigravity, Codex, others) MUST read this file before starting work and update it before stopping. Keep entries short and dated. Workers report the final release (download links, platforms, exact version) back to the primary AnF conversation; a worker's own chat is not enough.

Last updated: 2026-11-01 by Claude (session https://claude.ai/code/session_01DHgVzsPDP7PNt8MKD8CHFa), after `main` reached `20e8557` (PR #57 merged). Status below was re-checked against the GitHub API and `git log origin/main` at that point.

## Status of every line of work

| Line | Where | Version | State |
|---|---|---|---|
| GitHub `main` | github.com/mwalikokelvo/AnF `main` (20e8557) | 0.1.47 | Source of truth. Contains the v0.1.47 merge (PR #51), security hardening (#52), packaging hardening (#53), Superpowers skills (#49), sha2 0.11 (#62), streaming URL fix (#64), Rust `safe_fetch` (#55), Android emulator smoke CI (#58), the music-bar layout fix (#60) and the builder runbook (#57). The macOS app keeps its own version (0.1.4). |
| Superpowers skills | `claude/superpowers-skills` (PR #49) | n/a | Merged into main. |
| Open PRs | #54 (this file), #56, #59, #61, #63, #2 | n/a | Not merged. #59 (`fix/lyrics-clean-room`) comes from another assistant and is unreviewed by Claude. See Open items. |
| Stale PR | #2 `codex/downloadable-releases` | n/a | See the triage section below. (#8 dependabot `sha2` is closed; superseded by #62.) |
| User's local copy | user's PC | 0.1.21 | Older than main; not authoritative. |

Nothing is released. No GitHub release was published; build workflows only produce review artifacts.

## What the merged PRs did (#48-#53, #55, #57, #58, #60, #62, #64)

- #48: MKR Music lyrics provider and multi-LLM reconcile (Gemini/Antigravity line).
- #49: Superpowers skills v7.0.1 for all assistants. Merged.
- #50: v0.1.47 integration branch (Antigravity wip snapshot) plus the first shared HANDOFF.md.
- #51: merged v0.1.47 into `main` (domain reorg of `windows/src/workspace/*`, removal of stale duplicate domain directories and superseded scripts, single-pass HTML tag scanner in the ZIM reader).
- #52: security hardening for v0.1.47 (OCR, CSP, themes, opt-in lookups, local AI labels).
- #53: hardened `scripts/package-release.py` and corrected `ARCHITECTURE.md`.
- #55: Rust `safe_fetch` for user-entered podcast feeds and episodes (public-IP and redirect policy).
- #57: shared builder runbook (`docs/BUILDER-RUNBOOK.md`) and Windows snapshot build scripts.
- #58: CI emulator smoke test for the debug APK (install, launch, screenshot).
- #60: floating music player kept clear of the sidebar.
- #62: sha2 0.10 to 0.11 with explicit hex encoding (supersedes #8).
- #64: pasted YouTube links resolved through allow-listed instances; non-audio responses refused.

Merged on main so far: #49, #50, #51, #52, #53, #55, #57, #58, #60, #62, #64 (checked with the GitHub API and `git log origin/main`). Still open when this was written: #54, #56, #61, #63, plus #59 (`fix/lyrics-clean-room`, from another assistant, not reviewed by Claude) and #2. `main` contains v0.1.47.

## Verification state of 0.1.47

Labels: tested = executed and passed; compiled = built only; installed = run on a real device.

Verified (Linux container and GitHub CI):
- `npx tsc --noEmit` in `windows/`: passes.
- Unit tests: 144 of 147 pass (3 not passing; see open items).
- E2E (`windows/scripts/test-e2e.mjs`): 138 pass, 0 fail.
- `node scripts/check-release.mjs`: 11 release regression checks pass.
- CI Linux and Windows builds, including Rust tests, are green (compiled and tested in CI).
- Android CI run 41277276482 built the unsigned and debug APKs (compiled only). Run 41347092353 later built owner-signed APKs (compiled only).
- Latest local run on the open PR branch for #63 (main merged in): `tsc` clean, 176 unit pass / 0 fail, e2e 0 fail, 11 release checks pass.

NOT verified:
- Installed verification is thin: the Windows 0.1.47 portable build was smoke-launched on one PC (UI level only). The Windows installer was built but never installed. The Android APKs (run 41347092353, owner-signed per the owner) were never installed on a device; only the debug APK's emulator smoke passed in CI.
- The Windows review build files were delivered in chat only, not through a release or this repository: setup sha256 `639a4d19...`, portable `075e8f27...` (prefixes only; take the full sums from the original delivery). They were built from the tree BEFORE the #52/#53 fixes, so they do not correspond to current `main`. Treat them as a review build, not a verified release.
- No Android 16 KB alignment result, signed APK or sums have been recorded here for current `main`.

## Stale branch and PR triage (computed against `main` 52ba24d, 2026-11-01; main has since moved to 20e8557)

"Ahead/behind" is commits not in main / commits main has that the branch lacks. No branch was deleted or changed.

| Branch / PR | Ahead / behind | Unique content left | Already in main? | Merge conflicts with main | Recommendation |
|---|---|---|---|---|---|
| `claude/companion` | 13 / 201 | Opt-in desktop companion commit (`ff41f5e`) and Spotube Android CI diagnostics (heap, annotation text). | `windows/src-tauri/src/companion.rs`, `windows/src/companion/*` exist on main in a different (later) form; CI diagnostics are superseded by the current workflows. | Yes, 17 files. | Close. Nothing to cherry-pick unless the companion regresses; compare against main's `companion.rs` first. |
| `claude/marketplace` | 12 / 201 | Opt-in theme marketplace (`074426a`), `addons.ts` additions, same CI commits. | `marketplace/` (themes, `registry.json`) and `addons.rs` are on main. | Yes, 20 files. | Close. |
| `claude/sync-main-2` | 14 / 199 | Merge of main into the CI fix branch, review build of marketplace + companion (#7, "do not merge"). | Same content as the two branches above. | Yes, 35 files. | Close. It is a review-build carrier, not a feature branch. |
| `codex/marketplace-vault-recovery-2026-10-25` | 1 / 199 | `windows/src/workspace/marketplace.ts` and `addon-data.ts`, `addon-sandbox.html`, `marketplace/SETUP.txt`, `windows/dev/marketplace-check.mjs`, vault v1 fixture (`contracts/fixtures/vault-v1-fixture.db`, `contracts/tools/vault-fixture` changes), `docs/AF-Marketplace-Vault-Checkpoint-2026-10-25.md`. | No: `marketplace.ts` and the vault fixture db are absent from main. `addons.rs` exists on main separately. | Yes, 13 files (add/add in `addons.rs`). | Keep. Cherry-pick the vault fixture and `contracts/tools/vault-fixture` update first (self-contained); decide separately on the isolated marketplace UI, which conflicts with main's `addons.rs`/`lib.rs`. |
| `codex/windows-release-verify` | 6 / 289 | Windows/Android/Linux/macOS reproducible release build prep, FFmpeg pin, Linux runner disk space, PDF bytes on Windows. | All 6 commits are patch-equivalent to commits already on main. | Yes, 42 files (very old base). | Close. |
| `integration/preserve-v0141-pr47` | 0 / 99 | None. | Fully contained in main (0 commits ahead). | None. | Close (or keep only as a historical pointer). |
| PR #2 `codex/downloadable-releases` | 67 / 289 | 36 commits not patch-equivalent to main: Android music preview isolation and host lifecycle (`002ca93`), ARM64 16 KB alignment verification, local speech worker isolation, OmniRoute lifecycle (0.1.32 snapshot), specialist protocol docs, app-QA scripts. | 31 commits are patch-equivalent to main. | Yes, 266 files (330 files changed). | Do not merge as is. Cherry-pick selectively if the Android music preview or speech worker work is wanted; otherwise close the PR. Last updated 2026-10-25. |
| PR #8 dependabot `sha2` 0.10 to 0.11 | 1 / 198 | One-line `crates/anf-vault/Cargo.toml` bump. | Superseded by merged #62. | n/a | Closed. |

PR #8 is closed: #62 did the sha2 0.11 change (see the dated entry below).

Other remote branches not triaged (all recent or backups, left alone): `backup/antigravity-*`, `base51`, `claude/anf-v0147-integration`, `merge/v0.1.47-into-main`, `fix/security-v0147`, `codex/af-checkpoint-2026-10-24`, `codex/android-music-preview-0.1.21`, `codex/app-downloads-0.1.19`/`0.1.20`, `release/0.1.22`, `feat/mkr-music-integration`. Several are now merged into main and are candidates for deletion by the user.

## Continuation checkpoints

`continuations/af-0.2.0-2026-10-24/` holds the AF checkpoints (Project handoff 2026-10-23, then checkpoints through 2026-10-24). The newest are the 2026-10-24 files, with `AF-GitHub-Continuation-2026-10-24.md` as the latest GitHub continuation record and `AF-Windows-Native-Checkpoint-2026-10-24.md`, `AF-Writing-Controls-Checkpoint-2026-10-24.md`, `AF-Writing-Lock-Checkpoint-2026-10-24.md` among the last. They predate v0.1.47 by about a week and describe the AF 0.2.0 line; read them for background, but this file and `main` are authoritative.

## How to build, test, release

- Windows/Linux (Tauri): `cd windows && npm ci && npm test && npm run test:e2e && npm run tauri dev`. Release pack on Windows x64 only: `./scripts/prepare-offline.ps1; ./scripts/prepare-media.ps1; npm run pack`. See `docs/RELEASE-BUILDS.md`.
- Release gate checks: `node scripts/check-release.mjs`. Android APK checks: `scripts/check-android-apk.py`.
- Android: `node scripts/build-android.mjs` (JDK 21, Gradle 9.4.1, Android SDK platform 37.0, build-tools 36.0.0, target SDK 35, package `com.coucou.workspace`). Version comes from `windows/src-tauri/tauri.conf.json`; versionCode is derived from it. Check 16 KB alignment with `zipalign -c -P 16 4 <apk>` and publish SHA-256 sums. The release APK stays unsigned unless the original signing key is available; never commit or publish the key. See `android/RELEASE-PROCEDURE.txt`.
- macOS: `cd NotchBuddy && xcodegen && xcodebuild -scheme NotchBuddy -configuration Debug build`. Never edit the `.xcodeproj` by hand.
- Keep versions in sync across `tauri.conf.json`, Cargo and frontend `package.json`.
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

1. Install and launch verification: nobody has installed the Windows installer or either Android APK for 0.1.47. The Windows 0.1.47 portable build was smoke-launched on one PC (UI level only). The installer was built (sha256 `c1bbfa01e0ba84cef9d99a34ccff01dec4cd641522fca3b0b43bfef4b0aaf54d`) but never installed. Record the install result, full SHA-256 sums and download links here.
2. Android: run 41347092353 (workflow "Android packages", `success`, built from main at `5e1160a`, before #55/#58/#60/#62/#64) CI-built APKs signed by the owner (per the owner; signature not re-checked here). They are NOT installed anywhere. The emulator smoke of the debug APK (install, launch, screenshot) passed in CI (workflow added in #58). Run the 16 KB alignment check (`zipalign -c -P 16 4`) and record sums.
3. Rebuild release files from current `main`; the earlier chat-delivered review build predates the fixes.
4. Open PRs, none merged by me: #56 (OCR private loopback port, conflicts with main), #61 (vault fixture recovery, conflicts with main), #63 (verified local-AI download; main merged in, no conflicts), #54 (this file; main merged in), #59 (`fix/lyrics-clean-room`, lyrics clean-room rewrite from another assistant: exists and has NOT been reviewed by Claude), #2 (old codex branch, see triage). Merge order matters: #56 and #63 both edit `windows/src-tauri/src/lib.rs`, so whichever merges second may need another conflict resolution; #54, #61, #63 all touch HANDOFF.md.
5. Unit-test baseline: the old "3 of 147 not passing" figure is stale. On `main` plus this file (b39b220 + main 3ad343c content), `npm test` is 166 pass / 0 fail, e2e 138 pass / 0 fail, `tsc` clean, 11 release checks pass (Linux container, 2026-11-01).
6. Salvage from `codex/marketplace-vault-recovery-2026-10-25` (vault fixture first; PR #61 does part of this), then the user may delete the stale branches listed in the triage table.
7. When a release is chosen, workers report links, platforms and exact version to the primary AnF conversation and update this file.

## Update 2026-11-01: verified local-AI download (branch `feat/local-ai-verified-download`)

- `windows/src-tauri/src/model_download/` (policy, store, mod) plus `windows/src/workspace/{local-ai-manager,offline-models}.ts`. Manifest hashes for Qwen3-0.6B-Q8_0 and Qwen3-1.7B-Q8_0 were read from the Hub's LFS pointers and cross-checked on the blob pages; all other catalog models have no hash and stay not-available.
- Tested: pure Rust logic and file handling (21 tests, built outside Tauri because the container lacks GTK), TS (157 unit, 138 e2e). NOT exercised: a real multi-GB download, the real redirect hosts, the Tauri build with this module, installed behaviour on Windows.
- Merged with main (which now has #55 `safe_fetch`): `model_download::policy` re-exports `safe_fetch::policy::is_public_ip` instead of keeping its own copy (identical ranges; the policy tests of both modules pass together in a std-only harness). The Tauri crate itself is not compiled locally (no GTK); CI is the check. Host allow-list, redirect cap and DNS pinning in the downloader remain its own because they differ from `safe_fetch`'s.
- Heads-up: PR #56 also edits `windows/src-tauri/src/lib.rs`; whichever of #56/#63 merges second may need another merge-conflict resolution there.

## 2026-11-01 Claude: sha2 0.10 to 0.11 (supersedes dependabot PR #8)

Branch `fix/sha2-0.11`. `format!("{:x}", Sha256::digest(..))` does not compile on sha2 0.11 (E0277), so every use now goes through an explicit lowercase-hex helper `sha256_hex` (anf-vault, `_core`, vault-fixture, `windows/src-tauri/src/hashing.rs`). Keyring credential id, sync revision/conflict ids and add-on/file fingerprints are byte-identical (pinned by tests against NIST vectors and golden values produced by the 0.10 code).

- tested on Linux (`cargo test --locked`): `crates/anf-vault` 7 pass, `_core` 14 pass, `contracts/tools/vault-fixture` 1 pass (no committed lock there).
- Tauri crate (`windows/src-tauri`): NOT compiled locally (gdk/glib missing). The new `hashing.rs` module was tested standalone against sha2 0.11 (2 pass). Full crate verification is CI only.

## 2026-11-01 streaming URL resolution fix (branch `fix/streaming-url-resolution`, Claude)

- Music Hub > Streaming: pasted YouTube links (watch, youtu.be, shorts, embed, live, music) are parsed with URL, resolved only through the existing Piped instance list and only when "Online lookups" is on; otherwise the user is told how to enable it. The provider Search box resolves a pasted link instead of searching it as text.
- Non-audio responses (text/html etc.) are refused before playback and before offline caching; failed resolutions no longer create Recently played / Direct Stream entries; a failed `play()` no longer records the track as recent.
- Labels: tested on Linux (`npm test`, e2e, tsc, check-release, `scripts/app-qa/streaming-url.mjs` with stubbed network and IPC). NOT tested: live YouTube/Piped resolution, installed Windows app. Existing HTML "Web Audio Stream" items already cached in a user's library are not deleted; they now refuse to play with a message.

## 2026-11-02 Claude: dependabot triage (#65-#68) and main baseline

Nothing merged. Labels per runbook section 7. Baseline on origin/main `b7cb275` (Linux container): tested on Linux, `npx tsc --noEmit` clean, `npm test` 181 pass / 0 fail, `npm run test:e2e` 138 pass / 0 fail, `node scripts/check-release.mjs` (repo root, not `windows/`) 11 release checks pass, `npm audit --omit=dev` 0 vulnerabilities (0 high, 0 critical). `cargo test` in `windows/src-tauri`: NOT run (no GTK/gdk dev packages); CI is the check.

| PR | Change | Verdict | Evidence |
|---|---|---|---|
| #65 | music-metadata 12.2.3 -> 12.3.2 | safe-to-merge | Upstream 12.3.0-12.3.2: new chapter limits, MP4/ID3/AIFC/Vorbis-date parsing fixes, RIFF copyright field; no breaking changes listed. All 10 PR check-runs success or skipped. PR branch (older base): tsc clean, 166 unit, 138 e2e, 11 release checks pass. 12.3.2 installed over current main: tsc clean, 181 unit, 138 e2e pass. Only consumer: `windows/src/workspace/audio-metadata.ts`. Not tested: real audio files, date tags can now resolve differently (fix #2871). |
| #66 | sqlcipher-android 4.19.1 -> 4.20.0 | needs-check | Release notes: SQLite baseline 3.54.1, `PRAGMA cipher_migrate` deferred-error fix, WebAssembly finalizer skip, LibTomCrypt 1.18.2 on Android Community. No DB format, KDF, page size, HMAC or default change is listed in the release notes or the Zetetic announcement. The repo never calls `cipher_migrate`/`cipher_compatibility`, so the migrate fix does not apply. CI success (android + emulator builds), which includes the saved-data-retention upgrade test from a baseline APK. Not independently verified: no format change is stated, but the source diff could not be read here (sqlcipher repos not reachable by the session), so "safe for existing vaults" rests on release notes plus CI. Recommend merging only after the Android workflow's upgrade-retention test is confirmed to open a vault written by 4.19.1. |
| #67 | tauri-plugin-single-instance 2.5.4 -> 2.5.5 | needs-check | Upstream: lock now released in `cleanup_before_exit`; Windows race fix for secondary instance exit. Lock file changes only this crate (2 lines). CI success (Windows and Linux builds). Behaviour change on exit/restart (updater relaunch) is not exercised by any test; smoke-launch on Windows, including a second launch and restart, before release. |
| #68 | setup-gradle 6.4.0 -> 6.4.1 | safe-to-merge | Upstream 6.4.1 fixes GHSA-chpw-2mqm-95cc in the dependency-submission action. Four workflow files, SHA-pinned (`8da46b5...`), tag comment updated. CI success including the `android` and `windows` workflows. |

## 2026-11-02 Claude: remove broken stream entries (branch `feat/clean-broken-streams`)

- Music Hub library shows "Remove broken stream entries (N)" only when N > 0; clicking asks for confirmation, then removes only entries with the exact title "Web Audio Stream", artist "Direct Stream" and a stored non-audio type (text/html etc.), and drops their ids from recent/liked/queue. No network calls. Detection is pure: `isBrokenStreamEntry` / `findBrokenStreamEntries` in `streaming-provider.ts`.
- Labels: tested on Linux (tsc, `npm test` 184 pass, e2e 138 pass, `check-release` 11 pass). NOT installed; the button flow itself is not exercised by a UI test. Playlist order lists and the persisted stream-metadata cache are not pruned.

## 2026-11-02 Claude: sleep timer "End of chapter" (branch `feat/sleep-end-of-chapter`)

- Music Hub sleep select gains "End of chapter" and a "Chapter" chip: pauses at the start of the next chapter (or the end of the last), re-arms after a forward seek, falls back to End of track when the track has no chapters. Pure logic in `windows/src/workspace/sleep-timer.ts`; spec `docs/specs/sleep-end-of-chapter.md`. Custom minutes remain open.
- Labels: tested on Linux (tsc, `npm test`, e2e, `check-release`, `scripts/app-qa/sleep-chapter.mjs` browser fixture with a synthetic WAV and stubbed IPC). NOT installed; real M4B chapter metadata and the Android WebView are not exercised.

## 2026-11-02 Claude: "make it work" QA sweep of the Windows/Linux frontend (branch `fix/qa-sweep-2026-11-02`)

- Method: built `windows/dist`, served it with the real `tauri.conf.json` CSP header and stubbed Tauri IPC (`scripts/app-qa/fixture.mjs`), drove every section (Home, Chat, Documents, Writing, Music Hub, Audio Studio, Settings with all panels open, Reader, Search, Quick note, full player, add-ons) at 1280x800, 900x600, 820x760 (default window) and 600x500 (minimum window), dark/light, standard/larger text. Recorded console errors, uncaught exceptions, failed requests, CSP violations, overflow, dead buttons. Result: no CSP violations, no uncaught exceptions from the app, no horizontal overflow; three real layout defects.
- Fixed (each its own commit, each with a failing-before/passing-after Playwright check): (1) empty music player dock visible over every view when no track is loaded (`display:grid!important` beat `[hidden]`), `music-dock-hidden.mjs`; (2) at <768px the stacked header took ~236px of a 500px window and left ~114px for content, `narrow-window.mjs`; (3) docked player title squeezed to 2px and transport overflowing the pill at 768-1200px (including the 820x760 default window), pill overlapping the bottom bar under 768px, `music-dock-width.mjs`. The three checks are added to the Windows workflow's dispatch QA step.
- Labels: tested in browser fixture (headless Chromium, stubbed IPC, synthetic WAVs), Linux `tsc`, `npm test`, `npm run test:e2e`, `check-release`. CI-built: see the PR. NOT installed; the Tauri shell, real IPC, WebView2 rendering and the real audio output were not exercised.
- Not fixed (see PR body): `scripts/app-qa/appearance.mjs` is stale (clicks a mode-hidden section); Audio Studio shows enabled Save details/Remove with no track (they answer "Open a track first."); 600x500 first screen still shows only the top of each panel until the header is scrolled away.

## 2026-11-02 Claude: sleep timer "End of chapter" (branch `feat/sleep-end-of-chapter`)

- Music Hub sleep select gains "End of chapter" and a "Chapter" chip: pauses at the start of the next chapter (or the end of the last), re-arms after a forward seek, falls back to End of track when the track has no chapters. Pure logic in `windows/src/workspace/sleep-timer.ts`; spec `docs/specs/sleep-end-of-chapter.md`. Custom minutes remain open.
- Labels: tested on Linux (tsc, `npm test`, e2e, `check-release`, `scripts/app-qa/sleep-chapter.mjs` browser fixture with a synthetic WAV and stubbed IPC). NOT installed; real M4B chapter metadata and the Android WebView are not exercised.

## 2026-11-02 Claude: Music Hub / streaming audit and fixes (branch `fix/music-streaming-2026-11-02`)

- Base: `origin/main` (#72 had already been merged, so it is in main) plus `origin/feat/sleep-end-of-chapter` (#71) merged in. Method: real built UI with the real `tauri.conf.json` CSP, stubbed Tauri IPC and stubbed network (`scripts/app-qa/fixture.mjs`, now with a `window.__ipc` hook). Audited local playback, queue/next/prev, seek, volume, speed, repeat/shuffle at track end, sleep timers, mini-dock vs full player, playlists, lyrics, podcasts, streaming (YouTube/youtu.be/direct links, lookups on and off), offline cache.
- Fixed (each with a red-first unit test or Playwright check): (1) direct audio, podcast episodes and proxied YouTube streams on hosts outside CSP `media-src` never played (CSP block while the UI said "Playing"): in the desktop app they are now downloaded by Rust `safe_fetch_audio` and played from a blob, CSP unchanged (`stream-source.ts`); (2) success notice overwrote a playback error; (3) `inv.nadeko.net` is Invidious but was queried with Piped paths: instances are now tagged and use `/api/v1/*` shapes; (4) duplicate results in "All services"; (5) stale "Loading audio..." notice; (6) Rust "did not return audio" now reads as the plain not-audio message; (7) Internet Archive audiobooks: zip as stream URL / fallback, zip picked as an mp3, fake chapter starts; (8) instance thumbnails on hosts blocked by `img-src`.
- Not fixed: podcast artwork on arbitrary hosts is blocked by `img-src` (needs a Rust image fetch kind; CSP deliberately not loosened); direct/streamed tracks are not in the library so they are absent from "Recently played" and vanish on reload unless saved offline; Internet Archive audiobooks play only the first mp3; Rust download is whole-file before playback (cap 200 MB, so long YouTube videos start slowly); `prompt()`/`confirm()` are used for Add feed, New playlist and Remove (not testable here on WebView2/WebKitGTK); no radio feature exists.
- Labels: tested in browser fixture (headless Chrome, stubbed IPC and network, synthetic WAVs) and tested on Linux (tsc, `npm test`, `npm run test:e2e`, `check-release`). CI-built only after the PR's runs finish. NOT installed. Live YouTube NOT tested; no real Piped/Invidious instance was contacted.

## 2026-11-02 Claude: second UI pass (branch `fix/ui-polish-2026-11-02`)

- Based on `main` (3d948ed): PR #72 was already merged, so this does not stack. Fixed, each its own commit with a red-first check under `scripts/app-qa/` wired into the dispatch QA step: Audio Studio Save details/Remove disabled with no track (`audio-no-track`); player title squeezed to ~71px at 1280 (`music-dock-title`); stale `appearance.mjs` and `music-hub.mjs` repaired; clipped Music tabs (`music-tabs-fit`); light-theme contrast in Music Hub, Audio Studio, rail, marketplace ratings, muted text (`contrast`, probe in `contrast-probe.mjs`); reduced motion in the Music Hub (`reduced-motion`); 24px targets (`controls-a11y`); Writing editor focus ring (`focus-visible`); focus return after recap/details/full-player dialogs (`dialogs-focus`); Writing toolbar wrap (`writing-toolbar`); tooltips on truncated card text (`music-card-titles`).
- Found, not fixed: the Equalizer button exists only in the wide dock, so it cannot be opened below 1200px (music logic, other worker); 600x500 first screen still shows the top of each panel until the header scrolls away.
- Labels: tested in browser fixture (headless Chromium, stubbed IPC); CI-built: see the PR. NOT installed; WebView2 not checked; Android not exercised.

## 2026-11-02 Claude: 30 s playback and YouTube resolution (branch `fix/playback-30s-and-yt-resolve`)

- 30 s songs: the iTunes `previewUrl` (and the Spotify embed `audioPreview`) was stored as the track's `streamUrl`; when no YouTube match could be resolved the preview was played as "the song" and "Save offline" stored it in the library. `previewUrl` is now its own field, the fallback is flagged `preview:true`, the player/queue/notice say "30 s preview" and name the full routes, previews cannot be saved (`cacheStreamTrack` refuses), and queued playlist/album items resolve when selected. Old stored metadata migrates on load. Checks: `tests/stream-preview.test.ts`, `scripts/app-qa/music-preview.mjs` (stubbed 30 s clip and 4-minute track; red on main).
- YouTube: a watch link with `list=RD...&start_radio=1` was treated as a playlist import; mixes are now ignored (RDCLAK playlists still import). Failure causes are distinct (all unreachable / unavailable / no audio), failing instances go to the back for 2 minutes, instance list corrected (`api.piped.privacy.com.de` was the wrong host; `piped-api.lunar.icu` unlisted) and refreshed from the Piped and Invidious docs; `connect-src` (csp and devCsp), docs and pinning tests updated together.
- Labels: tested on Linux (tsc, `npm test`, `test:e2e`, `check-release`) and tested in browser fixture (stubbed network). NOT tested: live YouTube / Piped / Invidious (sandbox cannot reach them), installed Windows app, Rust crate (unchanged).

## 2026-11-03 Cursor: lyrics provider network/edge hardening (PR #77, branch `fix/lyrics-provider-network-edges`)

- `windows/src/workspace/lyrics-provider.ts`: `fetchOnlineLyrics` now parses LRCLIB bodies via safe `readJson` / `lyricsFrom`, ignores non-array search payloads and null/sparse entries, and still attempts fuzzy search after soft exact-lookup failures (timeout/network/unparseable). Rate-limit (`429`/`503`) backoff unchanged.
- Tests: isolated `windows/tests/lyrics-provider.test.ts` 12 pass / 0 fail (network failure, AbortError, invalid/null JSON, non-array search, sparse entries, happy-path exact match). Evidence in `.cursor/verification-artifacts/lyrics-provider-edge-cases.md`.
- CI on PR #77: all required checks success (Windows, Linux, Build, Android packages, Android emulator smoke, CodeQL). Mergeable/CLEAN. Codex review bot hit usage limits (no findings delivered).
- `scripts/simplify-code.sh` not runnable here: `ponytail-cli` / `pstack-cli` / `thermonuclear-review-cli` return npm 404.
- Labels: tested (unit). NOT installed; live LRCLIB and Music Hub UI path not exercised. Left alone: pre-existing local `audio-player.test.ts` failure (`CONTENT_FROM_FILE_TOO_LARGE_...`) unrelated to this change.

## 2026-11-03 Cursor: Linux Cloud Agent environment

- Desktop environment for Ubuntu agents: WebKitGTK 4.1, gtk-layer-shell, Rust 1.99.0 (same pin as `.github/workflows/linux.yml`), Node 22, `npm ci` in `windows/` and `android/`, release `coucou-hook`, and placeholder `windows/local-ai` files so the Tauri crate can compile. Real weights stay on `windows/scripts/prepare-linux.mjs`. macOS and the Android SDK are outside this image.
- Labels: tested on Linux (`npx tsc --noEmit`, `npm test` 240 pass, `npm run test:e2e` 138 pass, `node scripts/check-release.mjs` 11 pass, `cargo test` hook 3 / `_core` 14 / `anf-vault` 7 / vault-fixture 3). smoke-launched the debug Linux binary: workspace opened, model set to Fast · Qwen3 0.6B, quick note "Cloud agent hello" written to `~/.local/share/coucou/projects`. NOT a release install. Offline chat was not run (placeholders are not GGUF models).

## 2026-11-03 Cursor: synced LRC timestamps and active line (branch `cursor/lrc-active-line-3590`)

- `windows/src/workspace/lyrics-provider.ts`: `fetchOnlineLyrics` still returns the raw LRCLIB string (synced LRC when present, otherwise plain text). New `parseSyncedLyrics` reads `[mm:ss.xx]` (also `[mm:ss]` / 1–3 digit fractions), rejects seconds ≥ 60, skips ID3-style metadata tags, sorts out-of-order stamps, and marks plain text `UNSYNCED`. `activeLyricLine` returns the line whose time is the latest at or before the playback position (seconds), or null before the first stamp, for unsynced text, and for a non-finite time.
- Tests: `windows/tests/lyrics-provider.test.ts` covers minute boundaries (`00:00.00`, `00:59.99`, `01:00.00`), duplicate timestamps, malformed tags, and shuffled stamps. Isolated file 16 pass / 0 fail. Full `npm test` 244 pass / 0 fail. `tsc --noEmit` clean.
- `scripts/simplify-code.sh` still cannot run: the script's shebang has a UTF-8 BOM, and `ponytail-cli` is not on npm (404). No unrelated files were rewritten.
- Labels: tested on Linux (unit + tsc). NOT installed. Music Hub still parses playback lyrics through `lyrics.ts`; this change does not touch player controls or persisted stores.

## 2026-11-03 Cursor: reader section bar hides on text focus

- The deep reader's section bar (Previous / section / Next / bookmarks) hides when the document text is focused and comes back with Ctrl+B or Cmd+B. Escape still closes the reader. The bar's slot keeps its height, and a click does not change the reading scroll position, so the text does not jump. Existing button colors and the glass sidebar are unchanged.
- Labels: tested on Linux (`npm run typecheck`, `npm test` 244 pass / 0 fail). Browser fixture `node scripts/app-qa/reader-nav.mjs` (headless Chrome): focus hides the bar, Ctrl+B restores it, Escape closes, column position unchanged (body y 206, page y 214). Evidence in `.cursor/verification-artifacts/reader-nav.md`. NOT installed. `scripts/simplify-code.sh` still cannot run: `ponytail-cli` is not on npm (404), and the script's shebang has a leading BOM.

## 2026-11-03 Cursor: disk voice-cache check before neural TTS

- `windows/src/workspace/tts-service.ts`: chunk files in a caller-chosen directory (SHA-256 header, `ANF1` framing). `synthesizeChunk` validates the file before calling the provider. Corrupt or bit-flipped files are deleted and synthesized again. A full disk on write returns the audio and leaves no partial file; a full disk or other read error does not dispatch. `cleanupVoiceCache` drops corrupt and expired files and trims oldest files to a byte budget. The `coucou-audio` IndexedDB schema is unchanged. Read-aloud still uses the system voice; nothing in the UI calls this module yet.
- Labels: tested on Linux (`npx tsc --noEmit` clean, `npm test` 251 pass / 0 fail before this merge, `node scripts/check-release.mjs` 11 pass). After merging `origin/main` (`b963835`), `npm test` is 259 pass / 0 fail. Evidence in `.cursor/verification-artifacts/tts-cache.md`. NOT installed. No live TTS provider. `scripts/simplify-code.sh` still cannot run (`ponytail-cli` npm 404, and the script shebang has a UTF-8 BOM).
- Commit `b30308b` on `cursor/tts-voice-cache-578b`. PR: https://github.com/mwalikokelvo/AnF/pull/81

## 2026-11-03 Cursor: OPDS page walk and cover prefetch (branch `cursor/opds-pagination-covers-7c97`)

- `windows/src/workspace/opds-client.ts`: `parseOpds` reads Atom and OPDS 2 JSON (including grouped publications and localized titles). A feed-level `rel="next"` becomes a cursor with `page`, `offset`, and `cursor`. OpenSearch `startIndex` + `itemsPerPage` supplies the next offset when the link has none. An entry-level `rel="next"` is not a page link. `javascript:` URLs and URLs with userinfo are dropped. A `<!DOCTYPE` or `<!ENTITY` page is not followed.
- `traverseOpds` keeps requesting the next page until the link is gone, the page has no books, the body is blank, the URL repeats, or the page cap is hit.
- `prefetchBookCovers` tries the thumbnail, then the full image. HTTP errors and non-image bodies are not stored. A slow URL is aborted and the next candidate is used. Memory is checked before disk (SHA-256 file name). A corrupt disk file is fetched again.
- Playback, TTS, and the Rust `_core` OPDS parser are unchanged. No screen calls this module yet.
- Labels: tested on Linux (`npx tsc --noEmit` clean, `npm test` 273 pass / 0 fail). Evidence in `.cursor/verification-artifacts/opds-client.md`. NOT installed. No live OPDS catalog. `scripts/simplify-code.sh` still cannot run (UTF-8 BOM on the shebang, `ponytail-cli` npm 404).
- Commit `b58d539` on `cursor/opds-pagination-covers-7c97`. PR: https://github.com/mwalikokelvo/AnF/pull/82

## 2026-11-03 Cursor: KOReader reading progress sync (branch `cursor/koreader-progress-sync-19bf`)

- `windows/src/workspace/koreader-sync.ts`: existing reading state stays `{offset, bookmarks, annotations}`. Chapter, percentage, and the `anf:<offset>` locator are derived from that state and the same FNV-1a document digest the reader already uses for its scroll key. Payloads match the kosync progress fields (`document`, `progress`, `percentage`, `device`, `device_id`, `timestamp`, optional metadata). `PUT`/`GET /syncs/progress` use a side index, not the project store. A dropped push is queued (one entry per document per UTC day, 28-day expiry, stop on the next failure); 401 is not queued.
- Labels: tested on Linux (`npm run typecheck` clean, `npm test` 266 pass / 0 fail). Evidence in `.cursor/verification-artifacts/koreader-sync.md`. NOT installed. No reader view calls this module. `scripts/simplify-code.sh` still cannot run (UTF-8 BOM on the shebang, `ponytail-cli` npm 404). After merging `origin/main` (`41f6ac1`, OPDS page walk), `npm run typecheck` is clean and `npm test` is 280 pass / 0 fail.
- Commit `f1d62ee` on `cursor/koreader-progress-sync-19bf`. PR: https://github.com/mwalikokelvo/AnF/pull/83

## 2026-11-03 Cursor: reader theme transitions

- Reader themes (soft dark, black, sepia, light, night amber) ease `--reader-bg`, `--reader-ink`, `--reader-line`, and the focus, meter, and quote tokens. A theme change only sets `data-theme`; it does not restyle the type or rebuild the page. Shell borders are at least 3:1 and text, headings, and placeholders at least 4.5:1 on every theme. Amber uses the same tokens as the other themes. The glass rail's light theme sets its border with its overlay, and the header eases background and border only. Existing rail size variables are unchanged.
- Labels: tested on Linux (`npx tsc --noEmit` clean, `npm test` 264 pass / 0 fail, including `windows/tests/reader-theme.test.ts`). Browser fixture `node scripts/app-qa/reader-theme.mjs` (headless Chrome): five themes, scroll stayed at 140px, page text was not rebuilt, column/toolbar/rail/header boxes did not move, no console warnings. Evidence in `.cursor/verification-artifacts/reader-theme.md`. NOT installed. `scripts/simplify-code.sh` still cannot run (`ponytail-cli` npm 404, and the script shebang has a UTF-8 BOM).
- Commit `b12e96a` on `cursor/reader-theme-transitions-674a`. PR: https://github.com/mwalikokelvo/AnF/pull/84. Merged with `origin/main` (`8e1a85b`). The OPDS and KOReader files do not touch the reader theme styles.

## 2026-11-03 Cursor: regression audit of reader, sync, and voice cache

- Reviewed `windows/tests/` for the reader, KOReader sync, voice cache, LRC, and OPDS modules merged the same day. Replaced the lyrics abort test that threw before the signal fired, and the tier-2 LRC check that only asserted `lines.length >= 1`.
- Added boundary tests: framed audio decode (including an 8 MiB chunk and a truncated frame), invalid LRC seconds, and network aborts for lyrics, KOReader progress, and OPDS covers. Evidence: `.cursor/verification-artifacts/regression-boundary-audit.md`.
- Bug: `isNeuralAudioChunk` compared four characters with `'ID3'`, so an ID3v2 header never counted as audio. It now matches the three magic bytes.
- Labels: tested on Linux, twice (`npm test` 292 pass / 0 fail, `npm run test:e2e` 138 pass / 0 fail, `npx tsc --noEmit` clean). NOT installed. `bash scripts/simplify-code.sh` exited 1 (UTF-8 BOM on the shebang, `ponytail-cli` npm 404) and did not edit the tree. Debug `console.log` calls in `tts-cache.test.ts` were removed directly.
- Commit `ef86f40` on `cursor/regression-boundary-audit-8f17`. PR: https://github.com/mwalikokelvo/AnF/pull/86

## 2026-11-03 Cursor: OPDS and KOReader offline queue (branch `cursor/opds-koreader-offline-queue-d569`)

- `windows/src/workspace/koreader-sync.ts`: a dropped push still uses the existing queue item (`document`, `progress`, `percentage`, `device`, `device_id`, `timestamp`, optional `metadata` and `queued_at`). Transport failures and 408/429/5xx are retried at most five times, then one queue write. 401 is not retried and not queued. Drain still stops on the next failed send, and it drops entries older than 28 days. `readKoreaderQueue` reloads that same shape and discards unknown keys, including credentials. Reading state stays `{offset, bookmarks, annotations}`.
- `windows/src/workspace/opds-client.ts`: catalog fetches retry when a resilience store is passed. A parsed page is kept as the fallback. An unparsed or hostile body is stored beside it and does not replace it. Oversized unparsed bodies are not stored. Offline requests are queued (one URL, 100 entries, 28-day expiry) and a later success removes that URL. `javascript:` and userinfo URLs are not stored. No project-store schema change.
- Labels: tested on Linux (`npx tsc --noEmit` clean, `npm test` 305 pass / 0 fail before this merge). After merging `origin/main` (`3e1d23c`), `npx tsc --noEmit` is clean and `npm test` is 312 pass / 0 fail. Evidence in `.cursor/verification-artifacts/opds-koreader-offline.md`. NOT installed. No screen calls these modules. No live OPDS or KOReader server.
- Commit `98a62b3` on `cursor/opds-koreader-offline-queue-d569`. PR: https://github.com/mwalikokelvo/AnF/pull/87. Merged with `origin/main` (`3e1d23c`, PR #86). The new abort and cover-timeout tests sit beside the offline-queue tests. No behavior clash: an aborted or 408/504 progress push is still queued once, and cover prefetch is unchanged.

## 2026-11-03 Cursor: reader contrast across dark, light, amber, and glass-light

- Reader shell borders, focus rings, meters, and quote marks now clear 4.5:1 on dark, black, sepia, light, and night amber (they were about 3.1:1). Start OCR Server uses the reader background, ink, and border instead of the dark workspace surface. Light and sepia readers set `color-scheme: light`. Below 700px the reader chrome stays on one scrolling row, the title ellipsizes, and controls ease only color, so a viewport change does not animate the page. The open light glass rail is opaque (`--shell-blur: 0`, `backdrop-filter: none`) with a `#5b7067` border at 4.65:1, and `#workspace-root` paints `var(--bg)` so the light canvas is `#f5f6f2` rather than the dark page showing through.
- Labels: tested on Linux (`npm run typecheck` clean, `npm test` 288 pass / 0 fail before this merge). Browser fixture `node scripts/app-qa/reader-theme.mjs` (headless Chrome): five themes, OCR control matches the reader fill, resize 1100px to 640px and back leaves the page settled, light rail blur is none. Evidence in `.cursor/verification-artifacts/reader-theme.md`. NOT installed. `scripts/simplify-code.sh` still cannot run (`ponytail-cli` npm 404, and the script shebang has a UTF-8 BOM). After merging `origin/main` (`9df717a`, PRs #86 and #87), `npm run typecheck` is clean and `npm test` is 315 pass / 0 fail. The contrast styles do not touch the offline queue or the ID3 audio check.
- Commit `445b7c5` on `cursor/reader-theme-contrast-1b2e`. PR: https://github.com/mwalikokelvo/AnF/pull/85.

## 2026-11-03 Cursor: play the full song, not the 30 s clip (branch `cursor/full-song-playback-f189`)

- Catalogue tracks (iTunes search and Spotify embed) only carry a 30 s `previewUrl`. `resolveSpotubeStream` used to play the first YouTube hit, so a 30 s upload became "the song" and the audio ended at 30 s. It now skips clips (about 30 s, or titles marked preview/snippet/teaser), tries the closest full-length public recording first, and falls through to the next full recording when that stream does not answer. The labelled catalogue preview remains only when every hit is a clip. Queued catalogue tracks with no stream URL resolve on play. The player badge says `30 s PREVIEW` for that fallback.
- Labels: tested on Linux (`npx tsc --noEmit` clean, `npm test` 321 pass / 0 fail, `npm run test:e2e` 138 pass / 0 fail, `node scripts/check-release.mjs` 11 pass). Browser fixture `CHROMIUM_BIN=/usr/local/bin/google-chrome node scripts/app-qa/music-preview.mjs` (headless Chrome, stubbed network): with YouTube down the 30 s clip plays and is labelled and not saved; with a 30 s hit listed before a 4-minute track, playback duration is 240 s and the preview label is gone. NOT installed. No live YouTube, Piped, or Invidious.

## 2026-11-03 Cursor: catalogue songs keep playing when a full public recording exists (branch `cursor/full-song-playback-f189`)

- A catalogue song still stopped at 30 s when the music-filter search returned only a clip. That list was used as-is, so the general public search (the one that had the full recording) never ran, and the player fell through to the iTunes/Spotify `previewUrl`. A clip reported as 30000 ms was also treated as a long recording, which blocked the follow-up query. `resolveSpotubeStream` now asks the general search when the music filter has no full-length hit, treats millisecond durations as seconds when that value is nearer the catalogue length, and a queued row whose URL is still the labelled preview is resolved again.
- Songs with no full public recording on the allow-listed Piped/Invidious instances still play the labelled 30 s preview and `PREVIEW_ONLY_MESSAGE`. This does not call Spotify, Apple Music, or any other paid catalogue's full stream. A pasted direct audio link, an imported file, and an Internet Archive / LibriVox recording are unchanged.
- Labels: tested on Linux (`npx tsc --noEmit` clean, `npm test` 324 pass / 0 fail, `npm run test:e2e` 138 pass / 0 fail, `node scripts/check-release.mjs` 11 pass). Browser fixture `CHROMIUM_BIN=/usr/local/bin/google-chrome node scripts/app-qa/music-preview.mjs` (headless Chrome, stubbed network) passed: YouTube down still plays the labelled 30 s clip and does not save it; a 30 s hit listed before a 4-minute track plays 240 s. NOT installed. No live YouTube, Piped, or Invidious. Not a release.

## 2026-11-03 Cursor: playback, short window, and 0.1.48 review builds (branch `cursor/playback-window-release-2033`)

- Internet Archive audiobooks resolve every MP3 in numeric filename order (`parts` on the stream result). Playing one queues the later files after the book. A zip is still not audio, and files are still not fake chapter starts inside one stream.
- Sleep timer "End of chapter" is wired to the existing `sleep-timer.ts` logic: select option, Chapter chip, pause at the next chapter, re-arm after a forward seek, fall back to End of track when the track has no chapters.
- Below 1280px the dock keeps one Equalizer button in the transport. The extras column stays hidden so the title is not squeezed.
- At 600×500 and 700×560 the header is one row (hint and project title hidden) so the open section starts on screen. The header still scrolls away, and the status bar stays above the bottom bar.
- Version is 0.1.48 in `tauri.conf.json`, `windows/package.json`, `windows/Cargo.toml`, `windows/Cargo.lock`, and `android/package.json`.
- Labels: tested on Linux (`npx tsc --noEmit` clean, `npm test` 316 pass / 0 fail, `npm run test:e2e` 138 pass / 0 fail, `node scripts/check-release.mjs` 11 pass). Browser fixtures (headless Chrome, stubbed IPC): `narrow-window.mjs`, `music-dock-width.mjs`, `sleep-chapter.mjs` pass. NOT installed. No package was built in this container (no WebKitGTK).
- PR: https://github.com/mwalikokelvo/AnF/pull/88. CI-built review packages (not a GitHub Release; Windows publication stays paused while the unsigned installer is flagged). All four package workflows succeeded.
  - Linux run 41735125765: https://github.com/mwalikokelvo/AnF/actions/runs/41735125765 artifact `AnF-Linux`. `AnF-Linux-0.1.48-x86_64.AppImage` `a40afb509d55301f4e37504b0be3ff1071819667dd373c6b4fb76197336fd3c1`, `AnF-Linux-0.1.48-amd64.deb` `71ecad3e5b92bc00b49c618f2737f809c6bca365ae114632d04b10cdb340a845`, `AnF-Linux-0.1.48-x86_64.rpm` `33f673b40dd2d360d59499856d222533c4bcccc1622683710a0ea95807d4edc5`. Hashes are from the workflow log (`sha256sum`), not re-downloaded here (the artifact zip is 7.1 GB).
  - Windows run 41735126135: https://github.com/mwalikokelvo/AnF/actions/runs/41735126135 artifacts `AnF-Windows-setup` and `AnF-Windows-portable`. Setup `AnF-Windows-0.1.48-setup.exe` sha256 `d420104eeec6516c65b97578fa8e9a0ef324de10431347536a3a73f06e1b2e64` (1,770,305,612 bytes), matches `SHA256SUMS-Windows` inside the downloaded artifact. Unsigned. NOT installed.
  - Android run 41735125951: https://github.com/mwalikokelvo/AnF/actions/runs/41735125951 artifact `AnF-Android`. `AnF-Android-0.1.48-unsigned.apk` `94ab023f0019fff0b852497f8c7fb8891d948ea98cdf18ee745571cc0a3efb40`, `AnF-Android-0.1.48-debug.apk` `db1d3091761bbe76f40f1e196badbae7ffb3f5669a74781631ac086954dc88a4`. Package `com.coucou.workspace`, versionName 0.1.48, versionCode 1048. Hashes checked against the downloaded artifact. Emulator smoke run 41735125918 succeeded (install, launch, screenshot of the debug APK). NOT installed on a phone. 16 KB alignment was not rechecked here.

## 2026-11-03 Cursor: phone sync, lock-screen handoff, and export safety (branch `cursor/repair-sync-playback-27de`)

- Phone notes keep their speaker across a Windows sync. `You` stays a user turn. `PC offline AI` and `Browser reply` stay assistant turns with an optional `label` of `pc` or `browser`. Desktop turns omit the label. Windows and `anf-vault` reject any other label. A bare Windows assistant turn still arrives on the phone as `Assistant`.
- One conversation Windows cannot store (question over 10,000 bytes, or another text limit) is skipped. The rest of the sync continues. A dropped link still stops the sync. Project memory sent with Ask my Windows PC is cut to 12,000 UTF-8 bytes, and the PC uses that memory plus `balanced` only when the saved sync model is balanced. The default remains Fast.
- A file restore stays a new copy (new id, no Windows sync id) and now keeps OCR pages. A snapshot restore puts the same conversation back, including its sync identity and pages.
- Enabling the encrypted vault commits first, then reads status. A failed commit leaves later saves in the unencrypted store. Vault errors append a short exception name or message and hide paths.
- Lock screen no longer calls `play` on an empty Android player, and the request id fits the 12-digit bridge. An https stream uses `play_remote`. A local file up to 16 MB with a known extension is imported, then queued. http, `podcast:` ids, oversized files, and unknown extensions stay on the HTML player. HTML audio pauses only after the handoff message `Handed to the Android player.`
- Find lyrics asks LRCLIB only. The DNA button is unchanged. `parseSyncedLyrics` is unchanged; the player still uses `lyrics.ts`.
- The prominent Android export buttons write an encrypted `.anfpack`. The restore picker still accepts an old plaintext backup, and asks for the passphrase when the file is an encrypted pack. The existing backup panel was already encrypted.
- Android podcast download and feed fetch use `SafeHttps`: https, port 443, no userinfo, no single-label or local names, and no loopback, private, link-local, CGNAT, documentation, or resolved private address. Redirects are checked again (at most 3). Audio downloads reject a body that is not an audio or generic binary type. `play_remote` is https only.
- The sharing session keeps the last 10,000 request nonces. A full window drops the oldest nonce instead of refusing every later request. A nonce that has fallen out of the window can be replayed. That is the trade for keeping a long sharing session alive.
- Labels: tested on Linux (`npx tsc --noEmit` clean, `npm test` 331 pass / 0 fail, `npm run test:e2e` 138 pass / 0 fail, `node scripts/check-release.mjs` 11 pass, `cargo test -p coucou --lib` 131 pass / 12 ignored, `cargo test -p anf-vault` 7 pass). `SafeHttps` refusal checks compiled and passed on this JDK (http, userinfo, non-443, loopback, LAN, CGNAT, documentation, 240/4, IPv6 loopback, IPv4-mapped loopback, `.local`, single-label). Android `main.ts` bundles with esbuild. NOT installed. Not a release. No phone, no Windows installer, no live LRCLIB, no live LAN sync.
- Commit `edb6197` on `cursor/repair-sync-playback-27de`. PR: https://github.com/mwalikokelvo/AnF/pull/91

## 2026-11-03 Cursor: one backup opens on either host

- Android Settings reads its version from `android/package.json` through `androidVersionLabel()`. The heading is no longer a separate literal.
- `restoreEitherHost` accepts `coucou-mobile-backup` and `coucou-windows-backup`. A Windows export restored on the phone keeps speakers (`You`, `PC offline AI`, `Browser reply`, `Assistant`) and OCR pages, and uses a new phone id. A 64-hex Windows id is kept only as `sync.id`.
- Windows `validated_restore` accepts `coucou-mobile-backup` version 1. Speakers map back to user and assistant turns with the `pc` and `browser` labels. The Windows id is always new, and source paths are dropped. A bad note rejects the whole batch.
- KOReader progress, the OPDS client, and the neural voice cache still have no reachable control. Read-aloud stays on the system voice. Those modules were left in place.
- Assistants now dispatch one subagent per independent problem. The controller reviews, tests, and commits. That rule is in `CLAUDE.md`.
- Labels: tested on Linux (`npx tsc --noEmit` clean, `npm test` 340 pass / 0 fail, `npm run test:e2e` 138 pass / 0 fail, `node scripts/check-release.mjs` 11 pass, `cargo test -p coucou --lib` 137 pass / 12 ignored, `node scripts/build-android.mjs --assets-only` bundled `android/build/assets/web/main.js`). NOT installed. Not a release.
- Commit `f27697f` on `cursor/either-host-backup-27de`. PR: https://github.com/mwalikokelvo/AnF/pull/92. The sync and lock-screen work landed on `main` as `a66437f` (PR #91).
- Left in place on purpose: the phone SQL table and the Windows SQL table both say schema version 1 and are not the same shape; copying `coucou.db` between them still fails. Music, lyrics, and podcasts stay out of conversation backup and sync. The DNA button can still call its existing lookups. Reader scroll position and the character offset are still different coordinates. KOReader, OPDS, and the neural voice cache are still library modules with no screen calling them. The Android settings heading is the literal `0.1.48`. The pairing code is still the AES key; the screen already says to keep it private and to stop sharing on Windows to revoke it. Three Android players remain (HTML audio, Media3, optional Spotube).

### 2026-11-04 — OPDS catalog UI (Windows Documents)

- Wired `opds-client.ts` acquisition URLs into parsing; new `opds-panel.ts` in Documents (`OPDS catalogs` details): save catalog URLs, opt-in **Allow catalog requests**, browse up to 5 pages, **Open link** via `open_url` or HTML via `workspace_read_web`.
- Labels: **tested on Linux** (`npx tsc --noEmit`, `npm test` 332 pass, `check-release.mjs` 11 pass). Not installed.
- Branch `cursor/opds-catalog-ui-d2fe` (worktree `.worktrees/opds-ui`). No PR.

### 2026-11-06 — DeepSeek: overnight stack integrated, main build repaired

- **`main` was broken at `9e8d3c7`.** The library sort commits wrote a doubled escape into `windows/src/workspace/library.ts:11` (`/^https?:\\/\\//i`), which terminates the regex early. `tsc` reported 11 errors and `vite build` failed; Android bundles the same module. Fixed in PR #103 (`fix/library-regex-build`, commit `0c48663`) with a new `windows/tests/library-module.test.ts` that imports the module. **Why nobody saw it:** `build.yml` is the macOS Swift build, `windows.yml` only runs on `pull_request`/`windows-v*` tags, and no workflow runs `npm test`. The green Build check on `main` never typechecked `windows/`.
- Integration branch `integration/buildup-2026-11-06` (worktree `AnF-buildup`, base `9e8d3c7`) merges the 2026-11-04 overnight stack in dependency order: **#101 → #99 → #100 → #98 → #102 → #97 → #96**. All conflicts were `HANDOFF.md` (append collisions) except `main.ts`/`opds-panel.ts` in #102, resolved by keeping #93's panel and #102's download code, and `lib.rs` command lists (union).
- **#95 (neural TTS) was dropped.** `neural-speech.ts` never registers a provider, so `neuralSpeechEnabled()` is permanently false: the Settings toggle can never be enabled and 236 lines are unreachable. Revisit with Phase 5 when a real Piper/Kokoro provider exists.
- **#100** is based on #99 (not main); the delta applies cleanly after #99. **#102** carries a commit identical to merged #93 and overlaps it; only the Document fetch + import commits are wanted. #96 is the docs/tracker PR.
- **Fixes added on the integration branch** (`76ba604`, `2a694a0`): Flow card covers created `blob:` URLs that were never revoked (leak per card; now revoked on Close); `coverImg` falls back to the direct https URL when safe-fetch returns nothing instead of leaving an empty `<img>`; the OPDS panel called `workspace_read_web` with `webEnabled:true` even when **Search the web** was off (now refused, same as `addWebSource`); the KOReader bridge followed redirects to any public https host while re-sending the stored user key (now redirects must keep scheme, host and port, with a unit test).
- Labels: **tested on Linux-style Node gates on Windows** (`npx tsc --noEmit` clean, `npm test` **356 pass / 0 fail**, `npm run test:e2e` **138 pass / 0 fail**, `node scripts/check-release.mjs` **11 pass**). NOT installed, not a release, no live OPDS/KOReader/cover hosts contacted.
- Left for the owner: #95 is still open and should be closed; #100/#102 still target their stacked bases on GitHub; merge order above is the safe one. Adding a `windows` typecheck/test job on pushes to `main` is the durable fix for the missed breakage.

## 2026-11-04 Cursor: neural read-aloud wiring (Phase 5 prep)

- `windows/src/workspace/neural-speech.ts`: `playNeuralSentence`, `createNeuralUtterancePlayer`, `registerNeuralSpeechProvider`, `neuralSpeechEnabled()` (`anf-neural-tts=1`), `NullTtsProvider` stub, in-memory disk helper for tests.
- `speech-player.ts`: optional per-player `{ disk, provider, config }`; Reader tries neural when flag + provider, else system/Android speech.
- Settings: **Neural read-aloud (experimental)** `<details>`; checkbox disabled until a provider is registered.
- `docs/specs/neural-tts-wire.md`: Phase 5 checklist (Piper/Kokoro or Tauri command + disk registration).
- Labels: tested on Linux (`tsc` clean, `npm test` 335 pass / 0 fail, `check-release.mjs` 11 pass). NOT installed. No live neural model.
- Branch: `cursor/tts-cache-wire-d2fe`.

### 2026-11-07 — Antigravity: Audius Decentralized Music Streaming (Replacing Spotify)

- **Spotify Replacement**: Spotify Connect is deprecated and removed following user account ban. Replaced with **Audius** decentralized music streaming.
- **Audius Implementation**:
  - Direct public Discovery API integration (`https://discoveryprovider.audius.co/v1/`).
  - Search (`/v1/tracks/search`) and Trending tracks (`/v1/tracks/trending`).
  - Direct 320kbps MP3 stream playback (`/v1/tracks/{track_id}/stream?app_name=AnF`) with cover artwork and metadata.
  - Dedicated 'Audius' tab added to Music Hub with instant search and playback.
- **Files Created & Updated**:
  - `windows/src/workspace/audius.ts`
  - `windows/src/workspace/audio/audius-provider.ts`
  - `windows/src/workspace/music-hub.ts`
  - `windows/tests/audius.test.ts`
- **Quality Gates Passed**:
  - `npx tsc --noEmit`: Clean (0 errors).
  - `npm test`: 369/369 pass across 52 suites.
  - `npm run test:e2e`: 138/138 pass across 24 suites.
  - `node scripts/check-release.mjs`: 11/11 release checks pass.

### 2026-11-07 — Antigravity: Multi-Source Audius Search, Strict REA Mandate & Ecosystem Sync

- **Strict REA Mandate Enacted**:
  - Enforced "Never skip REA" in `CLAUDE.md`, `AGENTS.md`, and `docs/BUILDUP-STATUS.md`. All partner agents (DeepSeek Harness, Cursor, Claude Code) must run `rea` CLI / tools during app, binary, or protocol investigations to ground features in reverse-engineered evidence.
- **Unified Multi-Source Streaming with Audius**:
  - Integrated Audius as a primary streaming provider into `windows/src/workspace/streaming-provider.ts` alongside YouTube and Audiobooks.
  - Enabled concurrent multi-source search across Audius, YouTube, and Audiobooks in `SpotubeStreamService.searchMultiSource`.
  - Added dedicated 'Audius' filter tab in Music Hub streaming switcher and updated search box hints.
- **Skills & App Catalog**:
  - Added `openwhispr` local speech transcription skill (`~/.agents/skills/openwhispr/`).
  - Added `digitalocean` droplet/self-hosting orchestrator skill (`~/.agents/skills/digitalocean/`).
  - Added DigitalOcean self-hosting connector card to `windows/src/workspace/marketplace/apps-catalog.ts`.
- **Quality Gates Passed**:
  - `npx tsc --noEmit`: Clean (0 errors).
  - `npm test`: 369/369 pass across 52 suites.
  - `npm run test:e2e`: 138/138 pass across 24 suites.
  - `node scripts/check-release.mjs`: 11/11 release checks pass.

### 2026-11-07 — Antigravity: Guaranteed Full-Length Streaming Engine & Multi-Node Failover

- **Full-Length Playback Guarantee**:
  - Enhanced `resolveSpotubeStream` in `windows/src/workspace/streaming-provider.ts`: before any track ever degrades to a 30-second preview clip, AnF automatically queries Audius for matching full-length tracks (`duration > 45s`). When matched, it streams the full 320kbps MP3 directly.
- **High-Availability Multi-Node Failover**:
  - Updated `windows/src/workspace/audius.ts` with round-robin failover across official Audius discovery nodes (`discoveryprovider.audius.co`, `discoveryprovider2.audius.co`, `discoveryprovider3.audius.co`).
- **Quality Gates Passed**:
  - `npx tsc --noEmit`: Clean (0 errors).
  - `npm test`: 369/369 pass across 52 suites.
  - `npm run test:e2e`: 138/138 pass across 24 suites.
  - `node scripts/check-release.mjs`: 11/11 release checks pass.


### 2026-11-07 — Antigravity: Spotify-Class Music Engine (Universal Search, Track Radio, Autoplay, Volume Normalization)

- **Spotify-Class Music Engine Deliveries**:
  - **Universal Online Search**: Restored and unified the `Streaming` tab in `tabButtons` supporting concurrent searches across Audius, YouTube, and global catalogue metadata. Enter on empty local searches prompts one-click online streaming resolution.
  - **Track Radio & Similar Music**: Added `startRadio(seed)` algorithm that populates the queue with similar songs (querying Audius or matching library genres/artists). Exposed via "Track Radio" buttons on local cards, streaming results, Audius rows, and Now Playing dock.
  - **Infinite Auto-Play**: When the playback queue ends, AnF automatically fetches and queues 3-4 similar tracks (Audius or local catalog) to ensure continuous, uninterrupted music playback.
  - **Volume Normalization (Loudness Equalization)**: Integrated Web Audio `DynamicsCompressorNode` (-24 dB threshold, 30 dB knee, 12 ratio) in `AudioDspEngine` to prevent volume jumps between tracks, toggleable in EQ dialog, Listening options, and Full Player chips.
  - **Smart Queue Actions**: Added "Play next", "Queue", and "Radio" actions directly on Audius and streaming cards.
- **Quality Gates Passed**:
  - `npx tsc --noEmit`: Clean (0 errors).
  - `npm test`: 370/370 pass across 52 suites.
  - `npm run test:e2e`: 138/138 pass across 24 suites.
  - `node scripts/check-release.mjs`: 11/11 release checks pass.


### 2026-11-08 — Antigravity: Seamless Crossfade, Audio Spectrum Analyser, Unified Omni-Search, History, VoiceStudio TTS & OpenWhispr

- **Spotify-Grade Capabilities Completed**:
  - **Seamless Continuous Crossfade**: Replaced silence gaps with smooth volume crossfade stepping (`step(1, true)`) triggering as the remaining track duration hits `prefs.fade` (0s - 12s), fading out current track and fading in next track concurrently.
  - **Real-Time Audio Spectrum FFT Analyser**: Web Audio API `AnalyserNode` integrated into `AudioDspEngine` and exposed via `getFrequencyData()`.
  - **Unified Multi-Source Omni-Search**: Connected Subsonic/Navidrome alongside Audius, YouTube, and Internet Archive audiobooks in `searchMultiSource` and added Subsonic switcher tab.
  - **Dedicated Listening History Tab**: Added "History" tab to `tabButtons` displaying `prefs.recent` tracks in chronological order with quick replay and history clearing.
  - **Custom Badges**: Added styled source badges for Audius (`.music-badge-audius`) and Subsonic (`.music-badge-subsonic`).
- **Neural Reader & Speech Integrations**:
  - **VoiceStudio Neural TTS Provider**: Built `VoiceStudioTtsProvider` in `windows/src/workspace/neural-speech.ts` connecting Reader to local `http://localhost:3900/v1/audio/speech` via HTTP with zero cloud telemetry.
  - **OpenWhispr Local Speech-to-Text**: Built `windows/src/workspace/transcription.ts` for transcribing audio recordings into structured AnF/Obsidian Markdown notes with frontmatter metadata.
- **Skills Ecosystem**:
  - Formally created and synced 9 agent skills across `~/.agents/skills` and `.agents/skills`: `open-seo`, `cap`, `appflowy`, `chatwoot`, `calcom`, `openproject`, `open-higgsfield-ai`, `clouds-against-humanity`, `supoclip`.
  - Maintained and re-enforced mandatory "Never skip REA" policy.
- **Quality Gates Passed**:
  - `npx tsc --noEmit`: Clean (0 errors).
  - `npm test`: **376/376 passed** across 52 suites.
  - `npm run test:e2e`: **138/138 passed** across 24 suites.
  - `node scripts/check-release.mjs`: **11/11 passed**.
  - `npm run build`: Vite build succeeded in 5.90s.

### 2026-11-08 (Part 2) — Antigravity: Interactive Spectrum Visualizer Animation & Audio Studio 1-Click Transcription

- **Interactive Spectrum Visualizer Animation**:
  - Connected `requestAnimationFrame` loop in `music-hub.ts` directly to `audioDsp.getFrequencyData()`.
  - Dynamically drives `miniVis` (8 bars) and `fullVis` (24 bars) with real-time audio FFT frequency heights via CSS custom property `--bar-h`.
  - Added `.realtime` reactive styles in `music-hub.css` that override static pulse keyframes when live frequencies are detected, smoothly resuming idle state when playback pauses.
- **Audio Studio "Transcribe to Note" 1-Click Integration**:
  - Added `Transcribe to Note` action in `audio-studio.ts` (and synchronized `audio/audio-studio.ts`).
  - Converts active audio buffer to WAV, executes local speech-to-text via OpenWhispr (`transcribeAudio`), formats timestamped quotes (`transcriptionToMarkdownNote`), and saves note directly into AnF documents or daily note via `workspace_save`.
  - Added unit tests in `windows/tests/transcription.test.ts` for plain text responses and timestamped multi-segment blockquote notes.
- **Verification Gates 100% Green**:
  - `npx tsc --noEmit`: 0 errors.
  - `npm test`: **378/378 passed** across 52 suites.
  - `npm run test:e2e`: **138/138 passed** across 24 suites.
  - `node scripts/check-release.mjs`: **11/11 passed**.
  - `npm run build`: Production Vite build completed cleanly in 4.72s.

### 2026-11-08 (Part 3) — Antigravity: Open-SEO Publishing Audit & iCalendar (.ics) Task Export

- **Open-SEO Article & Metadata Audit Engine**:
  - Built `auditSeo` in `windows/src/workspace/article-publishing.ts` providing 0–100 SEO scoring, optimal title length (30–60 chars), subtitle/description checks (60–160 chars), heading hierarchy validation, image alt-text verification, and actionable suggestions.
  - Added 1-click `Audit SEO` action button in the Writing editor toolbar (`writing.ts` and `editor/writing.ts`) displaying immediate feedback and scores.
  - Enhanced `exportArticleHtml` to automatically emit Open Graph (`og:title`, `og:description`, `og:type`, `og:url`, `og:image`) and Twitter Card (`twitter:card`, `twitter:title`, `twitter:description`) `<meta>` tags.
- **RFC 5545 iCalendar (.ics) Task Export**:
  - Built `tasksToIcs` in `shared/domain/dashboard-data.ts` converting Markdown checklist tasks (`- [ ] task`) into RFC 5545 compliant `VTODO` iCalendar streams.
  - Added `Export tasks (.ics)` button to the Dashboard task drawer (`dashboard.ts`), enabling 1-click task export to Cal.com, Outlook, Apple Calendar, and Google Calendar.
- **Companion App Catalog Synchronized**:
  - Synced `windows/src/workspace/apps-catalog.ts` with all 15 companion open-source tools (`voicestudio`, `openwhispr`, `appflowy`, `cap`, `open-seo`, `chatwoot`, `cal-diy`, `openproject`, `higgsfield-ai`, `clouds-against-humanity`, `supoclip`, `mirofish`, `jev-ultrafast`, `jcode`, `digitalocean`).
- **Comprehensive Quality Gates**:
  - `npx tsc --noEmit`: 0 errors.
  - `npm test`: **386/386 passed** across 53 suites (+8 new unit tests).
  - `npm run test:e2e`: **138/138 passed** across 24 suites.
  - `node scripts/check-release.mjs`: **11/11 passed**.
  - `npm run build`: Production Vite build completed cleanly in 5.73s.

### 2026-11-08: Kanban Board, Podcasting 2.0, Spotify Audio Crossfade & Swarm Simulation
- **Interactive Kanban Board**: Added 3-column visual Kanban board in `dashboard.ts` & `dashboard.css` with card counters and toggleable `List View` / `Kanban Board` modes. Extended `draftTasks` in `shared/domain/dashboard-data.ts` to parse `- [/]` / `- [~]` as in-progress and `- [x]` as done with full backwards compatibility.
- **Podcasting 2.0 Namespace**: Implemented extraction of `<podcast:chapters>`, `<podcast:transcript>`, and `<podcast:soundbite>` in `podcast-feeds.ts` and `audio/podcast-feeds.ts`.
- **Spotify-Grade Audio Crossfade**: Integrated sample-accurate Web Audio `GainNode` in `audio-dsp.ts` and `audio/audio-dsp.ts` supporting `fade(gain, duration)` (0-12s) with zero clicks or zipper noise.
- **MiroFish Swarm Simulation Engine**: Created `ai/swarm-simulation.ts` and `swarm-simulation.ts` providing offline multi-perspective agent consensus scoring, friction point identification, and frontmatter Markdown export.
- **Quality Gates**:
  - `npx tsc --noEmit`: 0 errors.
  - `npm test`: **394/394 passed** across 54 suites (100% green).
  - `npm run test:e2e`: **138/138 passed** across 24 suites.
  - `node scripts/check-release.mjs`: **11/11 passed**.
  - `npm run build`: Production Vite build completed cleanly in 6.92s.

### 2026-11-08: Spotify Crossfade Chips, Cap Audio Clip Exporter, Security Challenge Cards, Brag Document Generator & Chatwoot Inbox
- **Spotify Crossfade Chips & DSP Automation**: Added crossfade duration selector chips (`Off`, `2s`, `4s`, `6s`, `8s`, `12s`) to Music Hub full player with automated sample-accurate Web Audio DSP fading on track switch and end-of-track.
- **Audio Studio Cap/Supoclip Audio Clip Exporter**: Implemented `slicePcmAudio` in `audio-data.ts` and added an `Export Clip` button with duration options (`15s`–`120s`) in `audio-studio.ts` generating standalone 16-bit PCM WAV clips. Re-exported domain audio modules to deduplicate codebase by ~4,000 lines.
- **Clouds Against Humanity Security Challenge Cards**: Created `security-cards.ts` providing an interactive evaluation engine for offline-first architecture, privacy, AES-GCM cryptography, Web Audio DSP, and RFC standards with scorecards and markdown report export.
- **Latent-Spaces Brag Document Generator**: Created `brag-document.ts` analyzing completed and in-progress tasks to produce structured Markdown engineering accomplishment documents with impact categories and added a 1-click `Brag Doc` button in the Dashboard task drawer.
- **Chatwoot Community & Support Inbox**: Created `chatwoot-inbox.ts` providing offline-first support thread triage (`open`, `pending`, `resolved`), reply appending, channel filtering, and 1-click Markdown thread export.
- **Quality Gates (All 100% Green)**:
  - `npx tsc --noEmit`: 0 errors.
  - `npm test`: **409/409 passed** across 58 suites (100% green).
  - `npm run test:e2e`: **138/138 passed** across 24 suites.
  - `node scripts/check-release.mjs`: **11/11 passed**.
  - `npm run build`: Production Vite build completed cleanly in 4.97s.

### 2026-11-08: Open-Higgsfield-AI Storyboard, Jev-Ultrafast BM25 Search & DigitalOcean Spaces Backup
- **Open-Higgsfield-AI Storyboard Generator**: Built `storyboard.ts` implementing scene parsing, framing detection (wide, medium, close-up, macro, pov, aerial), camera trajectory motion controls (dolly-in, tracking, pan, orbital, tilt), speed and lighting inference, and Markdown screenplay/storyboard export with YAML frontmatter. Added a 1-click `Storyboard` action button to the Writing editor toolbar in `writing.ts`.
- **Jev-Ultrafast & Agent-Reach BM25 Search**: Built `jev-index.ts` delivering sub-millisecond client-side BM25 ranking, token normalization, compact token-efficient serialization, and bounded-token context snippet extraction across notes, transcripts, lyrics, articles, and tasks.
- **DigitalOcean Spaces & S3 Cloud Backup**: Built `cloud-backup.ts` supporting S3-compatible remote backup target configuration, vault manifest diffing, exportable `rclone.conf` and `s3cmd.cfg` configurations, and AWS Signature Version 4 request signing using native Web Crypto (`crypto.subtle.sign`).
- **Codebase Cleanliness**: Converted `editor/writing.ts` and `editor/article-publishing.ts` to single-line re-exports, preventing file drift.
- **Quality Gates (All 100% Green)**:
  - `npx tsc --noEmit`: 0 errors.
  - `npm test`: **428/428 passed** across 58 suites (100% green).
  - `npm run test:e2e`: **138/138 passed** across 24 suites.
  - `node scripts/check-release.mjs`: **11/11 passed**.
  - `npm run build`: Production Vite build completed cleanly in 5.20s.

### 2026-11-08: Spotify Smart Mixes, Gentle Sleep Fade, Bionic Reading & Pomodoro Focus Timer
- **Spotify Smart Mixes & Mood Flow**: Created `smart-mix.ts` with multi-attribute scoring across 6 smart playlist types (`Deep Focus Flow`, `High Energy Cardio`, `Late Night Acoustic`, `Discovery Radar`, `Spoken Stories`, `Time Capsule Classics`) with Extended M3U export.
- **Sleep Timer Gentle DSP Fade-Out**: Updated `music-hub.ts` to execute gradual Web Audio DSP gain ramp down (`audioDsp.fade(0, fadeSeconds)`) in the final seconds of the sleep timer before pausing playback.
- **Bionic Reading & Speed Reader**: Created `bionic-reading.ts` providing adaptive fixation emphasis to accelerate eye tracking and reading speed while preserving code blocks, markdown syntax, tags, and URLs.
- **Pomodoro & Focus Timer**: Created `pomodoro.ts` implementing a 25/5/15 Pomodoro state machine, pure Web Audio harmonic bell chime synthesis, and Markdown session logging.
- **Quality Gates (All 100% Green)**:
  - `npx tsc --noEmit`: 0 errors.
  - `npm test`: **445/445 passed** across 58 suites (100% green).
  - `npm run test:e2e`: **138/138 passed** across 24 suites.
  - `node scripts/check-release.mjs`: **11/11 passed**.
  - `npm run build`: Production Vite build completed cleanly in 5.49s.

### 2026-11-08: Vault Health, Broken Link Finder & Graph Analytics
- **Vault Health Engine**: Created `vault-health.ts` analyzing notes for broken wikilinks, orphan notes, top knowledge hubs, graph density, and 0–100 overall vault health scoring.
- **Markdown Audit Reports**: Implemented `vaultHealthToMarkdown` generating structured Obsidian/AnF audit reports with frontmatter and actionable tables.
- **Quality Gates (All 100% Green)**:
  - `npx tsc --noEmit`: 0 errors.
  - `npm test`: **450/450 passed** across 58 suites (100% green).
  - `npm run test:e2e`: **138/138 passed** across 24 suites.
  - `node scripts/check-release.mjs`: **11/11 passed**.
  - `npm run build`: Production Vite build completed cleanly in 4.49s.

### 2026-11-08: Complete UI Integration & Fresh Native Releases for Windows and Android
- **Front-and-Center Dashboard Productivity Studio**: Integrated uncollapsed, prominent companion tools directly into `dashboard.ts`:
  - **Pomodoro Focus Timer**: Live 25:00 countdown display, phase badge (`FOCUS`, `SHORT BREAK`, `LONG BREAK`), Start/Pause/Reset controls, mode chips, harmonic Web Audio bell chime, and 1-click "Log Session to Daily Note" capturing `- [x] Pomodoro focus session (25m) #focus` directly into the day's markdown note.
  - **Vault Health Diagnostics**: 1-click "Run Vault Audit" auditing all notes for broken wikilinks, orphan notes, and knowledge graph density; displays 0–100 health score badge; and 1-click "Export Report (.md)" generating full audit reports.
  - **Clouds Against Humanity Security Challenge**: Interactive modal cycling through the 5 zero-trust security challenge cards with instant feedback, explanations, and score tracking.
  - **Chatwoot Community & Support Inbox**: Interactive modal providing offline-first support thread triage (`open`, `pending`, `resolved`), reply dispatching as Maintainer, status toggles, and 1-click Markdown thread export.
  - **Direct Launcher Row**: Kanban Board toggle, Export tasks (.ics), and Brag Document generator (.md).
- **Spotify Smart Mixes & Mood Flow in Music Hub**: Added `Smart Mixes` as a top-level tab in `music-hub.ts` tab bar displaying all 6 partitioned smart mix playlists (*Deep Focus Flow*, *High Energy Cardio*, *Late Night Acoustic*, *Discovery Radar*, *Spoken Stories*, *Time Capsule*) with 1-click "Play mix" (immediately sets player queue) and "Export .m3u".
- **Bionic Speed Reader in Writing Editor**: Added `Bionic View` action to the writing editor toolbar in `writing.ts` opening an interactive reading modal with adaptive fixation bolding and estimated reading time saved.
- **Fresh Windows Local Release Compilation**: Compiled `coucou` Rust crate and Tauri NSIS bundle using `cargo build --release` and `npx tauri build`, updating `windows/release/AnF-Windows-0.1.48-setup.exe` (64.1 MB) and `windows/release/AnF-Windows-0.1.48-portable/AnF.exe` (16.89 MB) with fresh Nov 8, 2026 timestamps.
- **Android Web Assets**: Rebuilt Android assets with `scripts/build-android.mjs --assets-only`, updating `android/build/assets/web/main.js` (1.6 MB) and `main.css`.
- **Quality Gates (All 100% Green)**:
  - `npx tsc --noEmit`: 0 errors.
  - `npm test`: **450/450 passed** across 58 suites (100% green).
  - `npm run test:e2e`: **138/138 passed** across 24 suites.
  - `node scripts/check-release.mjs`: **11/11 passed**.
  - `npm run build`: Production Vite build completed cleanly in 5.82s.

### 2026-11-10 — Cursor: continue Antigravity unfinished engines (BM25 + Spaces backup + JARVIS vault)
- Branch: `cursor/wire-jev-cloud-backup-d2fe` (base `main` @ `0961587`).
- **Wired `jev-index` into Ctrl+K studio search** via `vault-search.ts`: plain-text queries use BM25 ranking; `tag:` / `type:` / `has:` / `read:>` keep `matchesNote` filters. Dashboard gains a Vault Search launcher.
- **Wired `cloud-backup` into Settings → Vault & Privacy** via `cloud-backup-panel.ts`: validate S3/Spaces target, export `rclone.conf` / `.s3cfg`, preview local vault manifest diff. Access keys stay session-only (not localStorage).
- **JARVIS voice**: `search notes for…` / `find in vault…` runs BM25 vault search; also fixed `searchMusic` not being forwarded from the command desk context.
- **Verification** (this session): `npx tsc --noEmit`; `npm test` (see commit). Label: tested on Linux.
- **Still open from Antigravity next priorities**: remove duplicate/legacy scrape path in dual `streaming-provider.ts` trees; refresh `docs/BUILDUP-STATUS.md` HEAD pointer; stop `music-hub.ts` placeholder clobber.
