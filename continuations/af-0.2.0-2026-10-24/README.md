# Local A&F 0.2.0 continuation checkpoint

This preserves the tested local source independently of the divergent AnF app at repository root. It does not replace or merge main. Read AF-GitHub-Continuation-2026-10-24.md and AF-Windows-Native-Checkpoint-2026-10-24.md first.

- `af/work/coucou`: local Windows, Android, shared core and preserved macOS sources.
- `spotube/spotube-master`: source used by the local embedded music build.
- Root build scripts were originally used from a `build-work` directory; restore this layout on a new computer before invoking them. Tools, dependencies, signing keys and runtime/model binaries require separate provisioning.
- `verification`: existing evidence, not cloud CI or device acceptance.
- `checkpoint-manifest.json`: per-file source hashes and excluded binary inventory. No EXE/APK, signing keys or model binaries are stored in ordinary Git. Exact delivered artifact hashes are in the native checkpoint.

The private chat plugin source is versioned at repository root under `plugins/anf-tauri-toolkit`.
