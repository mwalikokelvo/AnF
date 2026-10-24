---
name: tauri-project
description: "Use for AnF/A&F Tauri v2 development, configuration, capabilities, plugin selection, native build diagnosis and shared Windows/Android architecture work. Includes official reference links and a read-only project inspector."
---

# AnF Tauri development toolkit

This is an independent project reference plugin, not a Tauri runtime plugin or an official Tauri product. It has no hosted MCP server. Use existing filesystem, terminal and web tools with the bundled references and inspector.

1. Resolve the actual checkout from current task context. Read applicable AGENTS.md instructions. Preserve synced sources and original releases. Do not assume that an exported local checkpoint and remote main contain the same changes.
2. Inspect actual source before giving plugin or build advice. Run `python <this-skill>/scripts/inspect_tauri.py --project <checkout>` with an available Python runtime. The inspector reads manifests and Rust source only; it does not install, compile, modify files, access credentials or connect to services. It accepts a repository root or a Windows Tauri directory. Report its selected project path.
3. Consult [official references](refs/official-resources.md). Browse relevant official documentation for version-sensitive guidance. Distinguish generic Tauri support from capabilities implemented in the current app. Read plugin platform support before proposing a shared Windows/Android dependency.
4. Check both Cargo dependencies and `.plugin(...)` registrations before claiming a plugin is installed. Treat the current updater/store/shell names as examples unless source proves otherwise. Never install all available plugins just because they exist.
5. Describe capability grants precisely. Core/plugin capabilities do not automatically create a per-command allowlist for application invoke handlers. Review actual build.rs manifests, permission files, source validation and remote webview access before describing a boundary.
6. Check resource existence before builds. Identify an explicit base profile separately from a complete model-enabled package. Never create dummy models or DLLs to satisfy a glob. Do not silently remove a required capability or disable checks to pass packaging.
7. Preserve vault schemas, cryptographic identifiers, key custody, legacy data and recovery paths during shared-core migration. Preserve original audio. Music Hub playback and Audio Studio processing retain separate responsibilities.
8. Run checks appropriate to actual changes. Distinguish static checks, native tests, frontend tests, package verification, device/installed acceptance and production signing. No automatic production-ready claim from compilation.
9. For AnF app updates, deliver current Windows EXE and Android APK together or state the concrete missing-platform dependency. Documentation-only updates do not require rebuilding unchanged binaries. Save source and continuity to the user-authorized GitHub repository without force pushes or overwriting divergent work. Keep signing keys, credentials, generated tools, local data and installer/APK binaries out of ordinary Git commits. Do not publish releases or contact others without authorization.

When no local Python is available, inspect the same manifests manually and state that the bundled tool was not run. Never claim this plugin adds a native bridge, plugin command, device access or cloud CI capability.
