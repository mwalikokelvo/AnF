# A&F live writing lock checkpoint — 24 October 2026

Current editable source: `build-work/af/work/coucou`. This follows fenced-example handling. Balanced product scope remains confirmed. Earlier exports/packages and synced references are preserved.

## Implemented

The shared live Markdown editor now sets CodeMirror's state-level read-only flag alongside its DOM-editable flag, initially and when the host changes the lock. A shared transaction filter rejects document changes while that state is read-only, covering ordinary command/completion transactions as well as direct input. Selection-only transactions remain available.

Custom Undo/Redo keyboard handlers also check the read-only state before calling the host history actions. Trusted host synchronization retains its explicit bypass so switching/loading a project can update the editor while locked without truncation. The existing 200,000 UTF-8 byte limit remains enforced for normal edits; an oversized existing document can be shortened to fit.

This does not change when the workspace locks writing: writing remains enabled during the previously supported AI waits. It enforces locks that the host already requests. No Java/Rust/Flutter, schema or protocol changes.

## Verification

All **25** focused suites pass. The new guard suite uses the installed real CodeMirror state engine, not a state double. It checks raw edit refusal during lock, reconfiguration/unlock, selection while locked, trusted synchronization, exact Unicode byte limit/overflow and shortening oversized existing content. Existing workspace suites still use DOM/IPC doubles and Markdown-source fallback; they do not test a live EditorView.

Windows TypeScript/Vite frontend PASS. Evidence: `build-work/verification/writing-lock-2026-10-24/`. Android strict TypeScript, interface bundle and debug build PASS (38 tasks, 4 executed / 34 up-to-date). Signature v2, ZIP CRC, 16 KB ZIP alignment, packaged JS/CSS identity and three Flutter engine/AOT ABI checks PASS. Existing 32-bit SQLite ELF alignment caveat remains; ZIP alignment is not universal runtime acceptance. No Android device is connected. Actual browser EditorView/keyboard shortcuts, completion interactions, IME, focus and hardware acceptance remain pending. Native Windows tooling and original production signing access remain unavailable. No production release is declared.

## Next steps

On Windows/Android, test requested locks during load/migration, typing, Undo/Redo, completions and selection; confirm normal writing remains available during supported AI waits. Continue native/tooling and device acceptance alongside music discovery/audio coordination, source anchoring/background jobs and collaboration baseline.

## Artifacts

- Source export: `build-work/AF-0.2.0-writing-lock-checkpoint-2026-10-24.zip`; checksum under `build-work/verification/`.
- Development APK: `build-work/artifacts/AF-0.2.0-embedded-music-development-writing-lock-2026-10-24.apk`.
- APK: 191778528 bytes; SHA256 `674c397c856befc5f6e80a1c36adc465edabd39c871752eaac802a85efb91e78`.
- Same development package `com.coucou.workspace.dev`, version `0.2.0-dev` / 2000 and existing development certificate. Native/device acceptance and production release remain unverified.
