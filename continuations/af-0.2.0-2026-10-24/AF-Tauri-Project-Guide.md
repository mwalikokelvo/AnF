# A&F Tauri project guide

Verified against the current working source on 24 October 2026.

- Framework: Tauri v2 for the desktop host, Vite and TypeScript for its frontend.
- Desktop working directory: `build-work/af/work/coucou/windows`.
- Standard commands from that directory: `npm run tauri dev` and `npm run tauri build`.
- Configuration: `windows/src-tauri/tauri.conf.json`.
- Executable entry: `windows/src-tauri/src/main.rs`, which calls `coucou_lib::run()`.
- Backend wiring, plugin registration and command registration: `windows/src-tauri/src/lib.rs`; domain implementations are neighboring Rust modules.
- Actual plugins: `tauri-plugin-single-instance` and `tauri-plugin-autostart`. Updater, store and shell are not registered dependencies in this checkout. Native Rust process/storage operations do not imply those plugins are installed.
- Capability file: `windows/src-tauri/capabilities/default.json`, granting `core:default` and `autostart:default` to the `island`, `settings` and `workspace` windows.

## Build profiles and platform boundary

The standard desktop build uses the full resource configuration, including the Windows offline-AI pack. Those model/runtime assets are absent in this checkout. Do not interpret the standard command as a verified complete build without those resources.

For the locally verified base development installer, run `./build-work/Build-Windows-Development.ps1` from the project root. It uses the project-local provisioned tools, compiles/stages the hook relay, runs the frontend tools directly and supplies an explicit resource overlay excluding missing AI assets. This helper requires those tools to be provisioned on a new computer; it is not a tool installer. See `AF-Windows-Native-Checkpoint-2026-10-24.md` for artifact identities, checks and limitations.

Android currently uses a Java/WebView host and the embedded Flutter music module. It is not yet a Tauri Android application. Shared Rust/mobile host unification remains a migration goal.

## Permission semantics

Tauri v2 capabilities grant core/plugin permissions to selected windows or webviews. Custom application commands registered using `invoke_handler` are available to application windows by default unless separately restricted through an application command manifest. This checkout's `build.rs` calls `tauri_build::build()` without a custom command manifest; the capability file should not be described as a per-command allowlist for A&F's custom Rust commands. See the [official capability documentation](https://v2.tauri.app/security/capabilities/).

## Upstream references

- [Tauri repository](https://github.com/tauri-apps/tauri)
- [Tauri v2 documentation](https://v2.tauri.app/)

The supplied `https://github.com/tauri-apps.git` is not the Tauri repository clone URL. The repository is `https://github.com/tauri-apps/tauri.git`.

This guide changes documentation only. The EXE/APK from the native/shared-core checkpoint remain the latest app builds.
