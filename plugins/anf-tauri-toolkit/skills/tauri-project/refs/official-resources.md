# Official Tauri v2 resources

Use the current pages for version-sensitive details, checked initially on 24 October 2026.

- Framework source: https://github.com/tauri-apps/tauri
- Documentation: https://v2.tauri.app/
- Plugin catalog and platform support: https://v2.tauri.app/plugin/
- Capabilities: https://v2.tauri.app/security/capabilities/
- Permissions: https://v2.tauri.app/security/permissions/
- CSP: https://v2.tauri.app/security/csp/
- Project configuration: https://v2.tauri.app/develop/configuration-files/
- Windows installer: https://v2.tauri.app/distribute/windows-installer/

Capability files live in `src-tauri/capabilities`. Verify their window labels and permission grants. Tauri documents that application invoke-handler commands are available to application windows by default unless separately restricted through an application command manifest. Do not infer that capability plugin grants restrict every custom Rust command.

Typical desktop layout is `windows/src-tauri/tauri.conf.json`, `windows/src-tauri/src/main.rs` calling a library run function, and `windows/src-tauri/src/lib.rs` wiring plugins and invoke handlers. The inspector resolves this instead of assuming it. AnF's local 0.2.0 export currently uses Java/WebView plus Flutter on Android; a Tauri mobile migration is a goal, not evidence of current mobile implementation. Remote main may differ.
