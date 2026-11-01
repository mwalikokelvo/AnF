# AnF Workspace Architecture Specification

## 1. System Overview & Philosophy

**AnF** is an offline-first, local-first workspace for desktop (Windows/Linux) and mobile (Android). All documents, audio, knowledge bases, and AI inference run locally on the user's hardware without telemetry or mandatory cloud connections.

### Core Architectural Principles
- **Offline Autonomy**: Every capability—including text processing, OCR, audio synthesis, DSP equalization, and Spicetify styling—functions without internet access.
- **Embedded Protocol Security**: The Windows desktop shell (built with Tauri v2) embeds all web assets directly within the executable using the `custom-protocol` runtime (`tauri://localhost`). It does not rely on ephemeral local HTTP development servers.
- **Unified Domain Boundaries**: The workspace frontend is a flat set of modules in `windows/src/workspace/`, grouped below by domain for documentation only.

---

## 2. Workspace Layout (`windows/src/workspace/`)

The workspace is a flat directory. Production code (`main.ts`), the unit and e2e tests, and `android/web/main.ts` all import these top-level files. The domain groupings below are documentation, not directories.

> The earlier per-domain copies of these files (`windows/src/workspace/{audio,ai,reader,editor,storage,marketplace}/` and `workspace/index.ts`) were removed; the live files are the flat ones at `windows/src/workspace/`. They remain in git history.

`main.ts` is the application bootloader, layout orchestrator and IPC binding. Per-domain files:

### 2.1 Audio
- `music-hub.ts`, `music-hub.css`, `audio-studio.ts`, `audio-studio.css`, `music-flow.ts`: music UI and studio layout.
- `audio-engine.ts`, `audio-queue.ts`, `audio-library.ts`, `audio-data.ts`, `audio-metadata.ts`, `native-music-player.ts`: WebAudio graph, queue, library and native OS media controls.
- `audio-dsp.ts`, `audio-denoise.ts`: equalizer, spatial audio and denoising.
- `lyrics.ts`, `lyrics-provider.ts`, `echo-lyrics-orchestrator.ts`: LRC parsing and lyric providers.
- `streaming-provider.ts`, `spotube-desktop.ts`, `podcast-feeds.ts`, `speech-player.ts`: streaming sources, podcasts and text-to-speech.
- `echo-canvas.ts`, `echo-music-dna.ts`: visualizer and audio analysis.

### 2.2 AI and OCR
- `local-ai-manager.ts`: manages local `llama-server` child processes and model selection.
- `ocr-client.ts`: embedded OCR client.
- `answer-evidence.ts`, `followups.ts`: source citations and follow-up suggestions.

### 2.3 Reader and Knowledge
- `reader.ts`, `reader-data.ts`, `reader.css`: document reader.
- `zim-reader.ts`: offline `.zim` archives.
- `library.ts`, `library-data.ts`, `library.css`, `knowledge-data.ts`, `quick-capture.ts`, `dashboard.ts`, `dashboard-data.ts`: library, notes and dashboard.

### 2.4 Editor and Publishing
- `writing.ts`, `writing-layout.css`, `writing-guard.ts`, `live-editor.ts`, `reply-to-draft.ts`, `article-publishing.ts`.

### 2.5 Storage and Backup
- `vault-panel.ts`, `encrypted-pack.ts`, `snapshot-panel.ts`, `backup-tools.ts`.

### 2.6 Marketplace and Theming
- `addons-core.ts`, `addons.ts`, `addons.css`, `apps-catalog.ts`, `apps-catalog.css`: themes and the app catalog.

---

## 3. Test Verification

Run from `windows/`:

| Command | What it runs |
|---|---|
| `npm test` | Unit suites: `windows/tests/*.test.ts` |
| `npm run test:e2e` (`node scripts/test-e2e.mjs`) | Four e2e tiers in `windows/tests/e2e/` |
| `node scripts/check-release.mjs` (from the repo root) | Release regression checks, including that `scripts/package-release.py` refuses incomplete inputs |

The four e2e tiers:

1. **Tier 1, category-partition feature coverage**: 60 tests.
2. **Tier 2, boundary-value analysis**: 60 tests.
3. **Tier 3, pairwise cross-feature combinations**: 12 tests.
4. **Tier 4, real-world multi-step workloads**: 6 tests.

`check-release.mjs` is a separate release gate, not a fifth e2e tier. Type checking is `npx tsc --noEmit`. These gates run on a developer machine or CI; they do not verify an installed build.

---

## 4. Release Packaging

`scripts/package-release.py` only copies and zips artifacts that earlier build steps already produced. It builds nothing.

1. **Windows and Linux**: `npm run pack` in `windows/` stages files in `windows/release/` (`AnF-Windows-X-setup.exe`, the `AnF-Windows-X-portable/` folder; on Linux the AppImage, `.deb` and `.rpm`). Linux packages are not handled by `package-release.py`.
2. **Android**: `node scripts/build-android.mjs` writes the debug and unsigned release APKs under `android/gradle-build/outputs/apk/`.
3. **Packaging**: `python3 scripts/package-release.py [--version X.Y.Z]` copies these into `releases/anf-X.Y.Z/`:
   - `AnF-Windows-X.Y.Z-setup.exe`
   - `AnF-Windows-X.Y.Z-portable.zip` (zipped with a top-level `AnF-Windows-X.Y.Z-portable/` folder)
   - `AnF-Android-X.Y.Z-debug.apk`
   - `AnF-Android-X.Y.Z-unsigned.apk`
   - `SHA256SUMS`, covering the files above that were packaged

Behavior:
- The version is read from `windows/src-tauri/tauri.conf.json`. `--version` must match it unless `--force`.
- Previous output for that version is cleared first, so stale artifacts are never reused.
- Missing required artifacts make the script exit non-zero and list them, unless `--allow-partial`. An empty `SHA256SUMS` is never written.
- Checks are `scripts/check-android-apk.py` and `zipalign -c -P 16 4` (found on `PATH` or in `$ANDROID_HOME/build-tools/*`). Missing `zipalign` is an error unless `--skip-align-check`. Skipped checks print `SKIPPED`.
- "Successfully packaged and verified" is printed only when nothing was missing and every check passed. Otherwise the output says the release is not fully verified.
- The script does not install or launch anything. Passing it means files exist, are checksummed, and the APK checks passed; it is not an installed-build verification.
