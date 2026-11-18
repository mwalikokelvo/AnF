# AnF builder runbook

The one shared memory for every builder, agent and subagent. Read `HANDOFF.md` and this file first, before any work. When you finish, append your result (what, commit, labels from section 7, links) to `HANDOFF.md`. Do not start from scratch: reuse what is here.

## 1. Reaching the user's PC from a cloud session

- The cloud session (this Linux container) cannot compile the Windows app and has no route to the PC except the `remote-devices` tools.
- `device_bash` runs in a Linux VM on the PC, not in Windows. The PC user folder is `$HOME/mnt/mwali` (= `C:\Users\mwali`). Only connected folders are visible; call `device_list_dir` / `get_device_info` first, `device_request_folder_access` if a folder is missing.
- That VM has no GitHub credentials. Never enter credentials anywhere. To move code to the PC: `git bundle create x.bundle <branch>` (or `git archive`) in the container, `SendUserFile` it, `device_stage_files`/`device_commit_files` into the connected folder, then unpack there (`git clone x.bundle`, or unzip a snapshot). To move results back: `device_stage_files` the installer/log, then upload from the container with `gh`.
- Windows programs cannot be started from `device_bash`. The computer-use terminal tools are click-only (no typing into a build reliably). So: write a `.cmd` launcher into the connected folder, have the user (or a computer-use `double_click`) run it, and read its log with `device_bash` (`tail -n 40 $HOME/mnt/mwali/anf-build-*.log`).
- Delete needs `device_request_delete_permission`; ask once.

## 2. Windows build recipe (proven)

One click: double-click `scripts\build-windows-from-snapshot.cmd` (optionally `build-windows-from-snapshot.cmd C:\path\to\old\tree`, or set `ANF_OLD_TREE`). It runs prepare, `npm ci`, `npm run pack`, logs to `%USERPROFILE%\anf-build-<stamp>.log` and ends with `BUILD-RESULT exit=N`. Manual equivalent, from `windows\`:

```
set CARGO_BUILD_JOBS=1
set CARGO_INCREMENTAL=0
set CL=/Zm500
npm ci
npm run pack
```

- About 12 minutes with a warm target dir. `CARGO_BUILD_JOBS=1` and `/Zm500` avoid MSVC out-of-memory / heap errors; `CARGO_INCREMENTAL=0` keeps the target dir small.
- Output: `windows\release\AnF-Windows-<version>-setup.exe` and `AnF-Windows-setup.exe`. `scripts/pack.mjs` copies from `windows\target\release\bundle\nsis`, so that path must exist.
- Fresh snapshot without a target dir: reuse the old tree's. Either `mklink /J <new>\windows\target <old>\windows\target` (what `scripts\prepare-windows-build-tree.cmd` does) or `set CARGO_TARGET_DIR=<dir>` plus a junction from `windows\target` to it, because `pack.mjs` only looks in `windows\target\release\bundle`. A cold build is far slower.
- Version comes from `windows/src-tauri/tauri.conf.json` (keep Cargo and `package.json` in sync).
- `scripts\prepare-windows-build-tree.cmd OLD NEW [TARGET]` exits 0 ok, 2 bad args, 3 missing source resource, 4 copy failed, 5 junction failed.

### Gitignored resources a fresh checkout lacks

`tauri.conf.json` bundles these; `windows/.gitignore` excludes `local-ai/` and `media/`, so copy them from a prior tree (the prepare script does):

- `windows\local-ai\`: `llama-server.exe`, `*.dll`, `*.rten`, licence files (`*LICENSE*`), `NOTICE.txt`, `model-fast.gguf`, and `model.gguf`. A 16-byte placeholder `model.gguf` is what the proven builds used; the real download is done by `windows\scripts\prepare-offline.ps1` and is not needed for a review build.
- `windows\media\`: `ffmpeg.exe`, `SOURCES.txt`, `FFmpeg-LICENSE.txt`, `NOTICE.txt` (or `prepare-media.ps1`).
- `windows\target\release\coucou-hook.exe` is built by the cargo workspace (`windows/Cargo.toml`: `src-tauri`, `hook`); do not copy it.
- `NotchBuddy\Resources\sounds` (the 28 WAVs) is absent in these snapshots, so the build ships without audio. State that in the release notes; do not claim sound works.

### Clearing superseded builds (owner's standing rule)

When a newer build of AnF replaces an older one, remove the older build's files from the owner's devices so storage does not fill up. Applies to every assistant and every device. "Replaces" means the newer build has been installed and launched successfully; until then the previous build is the rollback and stays.

- On the PC: old build trees and review folders under `C:\Users\mwali` (for example `anf-<commit>`, `anf-<version>-review`, `anf-<version>-main-build`), their `windows\target` dirs, old `anf-build-*.log` files, and older installers in `Downloads`. On the phone: an older AnF APK file after the newer one is installed.
- Keep: the newest build, the `AnF` source checkout, user data and data backups (`anf-userdata-backup-*`), signing keys (`AnF-signing`, the Android key folder), and anything another tree's `windows\target` junction still points to (move the newest target first, then delete).
- A folder that is a Git checkout or worktree is deleted only when `git status` is clean and every commit on it is already on a remote branch or a continuation checkpoint; otherwise push or bundle it first, or leave it and say why.
- Deleting needs `device_request_delete_permission`; list the folders and their sizes to the owner before deleting, and name what was removed in `HANDOFF.md`.

## 3. CI facts

- `tauri build`/`cargo test` need `../dist`: run `npm run build` (in `windows\`) before `cargo test`.
- The Linux container can compile and test the Tauri crate after `apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libgtk-layer-shell-dev libdbus-1-dev` (checked 2026-11-14). It needs the bundled resources to exist: placeholder files in the ignored `windows/local-ai/`, `windows/media/` and `windows/target/release/coucou-hook*` are enough for `cargo test`. Windows-only code (`#[cfg(windows)]`) still needs the GitHub `Windows` workflow.
- From cloud sessions: code-scanning API returns 403; creating a GitHub release returns 403; artifact downloads are blocked, but job logs are readable (2026-11-14): `gh api repos/mwalikokelvo/AnF/actions/jobs/<job-id>/logs` shows the real compiler error. GraphQL is blocked: use `gh api repos/mwalikokelvo/AnF/...` REST only.
- Local gates (Linux, quick): `node scripts/check-release.mjs`; `cd windows && npm ci && npx tsc --noEmit && npm test`.
- Hook "Fact-Forcing Gate" blocks destructive commands unless you state the facts first; state them, never circumvent.

## 4. Android

- CI is the only place the APK is built: workflow `Android packages` (`.github/workflows/android.yml`), runs on PRs touching `android/**`, `windows/src/workspace/**`, `scripts/build-android.mjs` etc., or by hand: `gh workflow run android.yml --ref <branch>` (REST), then poll `gh api repos/mwalikokelvo/AnF/actions/runs?branch=<branch>`.
- The container's egress blocks the Android SDK/Maven/Gradle hosts, so local APK builds fail; do not retry.
- What the run verifies: unsigned release and debug packages build (`scripts/build-android.mjs`, JDK 21, platform 37.0, build-tools 36.0.0), packaged stylesheets, `check-release.mjs`, marketplace trust rules, installed-release instrumentation tests on an emulator including saved-data retention across upgrade from a baseline APK, debug signature and package version. Label that "CI-built, emulator-tested", not "installed on a phone".
- Release APK stays unsigned unless the owner's key is used (manual runs from `main` only); never commit or print the key. Check `zipalign -c -P 16 4 <apk>` and publish SHA-256. See `android/RELEASE-PROCEDURE.txt`.
- Artifacts cannot be downloaded from the cloud session; the user downloads them from the Actions run page.

## 5. PR conventions

- Branch from `origin/main`; use your own `git worktree`, never another agent's checkout.
- Plain merge commits only; no squash, no rebase of shared branches, never force-push, never merge to `main` (the user decides).
- Commit trailers (exactly):
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: <session url>`.
- PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)` and the session URL.
- Before starting: read `continuations/` and recent `claude/*`, `codex/*`, `integration/*` heads (Multi-LLM Buildup Protocol in `CLAUDE.md`). Never restyle shipped UI; never rename pill IDs.
- Create PRs via REST: `gh api repos/mwalikokelvo/AnF/pulls -f title=... -f head=... -f base=main -F body=@file`. Check CI: `gh api repos/mwalikokelvo/AnF/commits/<sha>/check-runs`.

## 6. Handoff state

`HANDOFF.md` (repo root) is the shared state: status table, verification, open items. Every worker reads it and this runbook first and appends a short dated result before stopping. Workers report final download links and exact versions to the primary AnF conversation too; a worker's own chat is not enough.

## 7. Verification labels

Use exactly one per claim, never stronger than what was done:

| Label | Meaning |
|---|---|
| compiled | built locally, nothing executed |
| CI-built | a GitHub Actions run produced it (give run id) |
| tested on Linux | Node/TS tests executed and passed in the container |
| installed | installed on a real device or emulator from the produced package |
| smoke-launched | installed and the app started and showed its main window |

Rule: never call anything a "verified release" or "working release" unless it was installed and smoke-launched from the exact file being offered. Browser fixtures and compilation are not installed verification. Release reports lead with the download links and the exact platform and version.


## 8. Unified Multi-Agent Collaboration Protocol

To ensure continuous, 24/7 autonomous forward velocity across multiple developer tools while shielding the project from cloud token exhaustion:

### Collaborator Division of Labor

1. **Antigravity Executive Manager (`f10fdf1b-...`)**:
   - Architectural governance, system integrity checks, and user-facing release delivery reports.
   - Cross-platform release compilation orchestration (Tauri, NSIS, APK packaging).
   - Enforces Ponytail mode (least new code, small working diffs, zero speculative boilerplate).

2. **Cursor IDE (`cursor/*` feature branches)**:
   - Rapid inline feature writing, interactive code exploration, and local component editing.
   - Authors focused PR branches (e.g. `cursor/full-song-playback-*`, `cursor/playlist-dialogs-*`).

3. **Local Ollama (`http://127.0.0.1:11434`)**:
   - **Zero-cost, 100% offline local LLM worker** (`qwen2.5-coder:1.5b`, `llama3.1:latest`).
   - Generates unit test assertions, docstring formatting, AST inspections, and diff summaries.
   - Consumes **0 cloud tokens** and runs indefinitely without subscription limits.

4. **DeepSeek Harness**:
   - Complex algorithmic DSP filter math, IIR/FIR curve computations, and Rust concurrency proofs.

5. **Grok & Grok Bot**:
   - Live external streaming protocol reverse-engineering (Invidious, Piped, YouTube formats, LRCLIB API changes).

6. **GitHub Actions & GitHub Bot**:
   - Automated cloud build matrix (Linux, Windows, Android emulator smoke testing, CodeQL audits).
   - Headless verification using GitHub compute minutes, preserving local RAM and LLM tokens.

7. **Craft Anything App**:
   - Offline visual UI tokens, vector SVG icons, and Spicetify color palette design assets.

### Token Conservation & Autonomous Hand-off Rules

1. **Never Spawn Nested Polling Swarms**: Avoid multi-agent trees with frequent recurring crons that repeatedly transmit massive context windows. Prefer direct, targeted execution.
2. **Atomic Git Checkpoints**: Commit changes to Git immediately after each discrete fix or milestone (`git commit`). Uncommitted work must never be left solely in conversational memory.
3. **Continuous Hand-Off Log**: Before exiting or upon token warnings, summarize progress in `HANDOFF.md`. Any agent can resume by reading `HANDOFF.md` and `git status`.
