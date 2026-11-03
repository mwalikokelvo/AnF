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

## 2026-11-03 Cursor: reader section bar hides on text focus

- The deep reader's section bar (Previous / section / Next / bookmarks) hides when the document text is focused and comes back with Ctrl+B or Cmd+B. Escape still closes the reader. The bar's slot keeps its height, and a click does not change the reading scroll position, so the text does not jump. Existing button colors and the glass sidebar are unchanged.
- Labels: tested on Linux (`npm run typecheck`, `npm test` 244 pass / 0 fail). Browser fixture `node scripts/app-qa/reader-nav.mjs` (headless Chrome): focus hides the bar, Ctrl+B restores it, Escape closes, column position unchanged (body y 206, page y 214). Evidence in `.cursor/verification-artifacts/reader-nav.md`. NOT installed. `scripts/simplify-code.sh` still cannot run: `ponytail-cli` is not on npm (404), and the script's shebang has a leading BOM.
