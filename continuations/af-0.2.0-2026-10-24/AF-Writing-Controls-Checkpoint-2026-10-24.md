# A&F writing controls and browser verification — 24 October 2026

Current editable source: `build-work/af/work/coucou`. This continues the live writing-lock checkpoint. Balanced scope remains confirmed. Earlier artifacts and synced references are preserved.

## Finding and fix

A real browser run of the shared editor found that its formatting toolbar could bypass the live transaction lock by updating the underlying textarea and performing trusted host synchronization. Shared writing tools now refuse their actions while locked; commit/accept-revision also checks the lock. The Markdown-source textarea now mirrors the requested read-only state. This avoids changing disabled-control bookkeeping in either host.

Added a synthetic memory-only browser fixture and repeatable checklist under `windows/dev/`. They import the actual writing editor and lazy CodeMirror EditorView without native IPC or saved-project access. The temporary localhost server and browser tab are closed after testing. No native Java/Rust/Flutter or schema/protocol changes.

## Verification

All **25** focused suites and Windows TypeScript/Vite build PASS. A separate real in-app browser run verified editable live text; locked Bold and toolbar Undo retaining text/change count; source-mode read-only DOM state; trusted host document loading while keeping the live lock; and editing plus keyboard Undo after unlocking. The initial browser run reproduced the toolbar bypass before the fix.

Evidence: `build-work/verification/writing-controls-2026-10-24/browser-checks.json`, `browser-state.txt` and `browser-proof.jpg`. The browser used synthetic text, not the full native workspace. Locked keyboard press could not be exercised because the non-editable element refused the browser press; it is recorded as not run. IME, completion popup, native Windows, Android WebView and hardware acceptance remain pending. State-engine tests remain distinct from browser checks.

Android strict TypeScript/interface/debug build PASS (38 tasks, 4 executed / 34 up-to-date). Signature v2, CRC, ZIP alignment, exact JS/CSS and three Flutter engine/AOT ABI checks PASS. Existing 32-bit SQLite ELF alignment caveat persists; ZIP alignment is not universal runtime acceptance. No Android device is connected. Native Windows tooling and original production signing remain unavailable. No production release is declared. Continue target-device lock/shortcut/IME/completion tests and the other pending native/platform work from continuity.

## Artifacts

- Source export: `build-work/AF-0.2.0-writing-controls-checkpoint-2026-10-24.zip`; checksum under `build-work/verification/`. Includes synthetic browser screenshot/records.
- APK: `build-work/artifacts/AF-0.2.0-embedded-music-development-writing-controls-2026-10-24.apk`, 191778595 bytes; SHA256 `9a6a5896f034a75c60733cb7d9ae41301540927c70d7a0e97b9ee9d63ea5a2e9`.
- Same development identity/version/certificate (`com.coucou.workspace.dev`, `0.2.0-dev` / 2000). Native/device and production acceptance remain unverified.
