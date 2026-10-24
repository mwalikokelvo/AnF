# GitHub continuation and Tauri development plugin

User authorization, 24 October 2026: resume saving project updates on GitHub, and provide Tauri documentation/tools for this chat. This authorizes source checkpoint pushes; it does not request public release publication.

Canonical repository verified with Git: `https://github.com/mwalikokelvo/AnF.git`. Remote `main` at discovery: `5d8c73fe77b8a7e78c1c903145ba12ad264054d6`. Local clone: `build-work/github/AnF`. Git write access passed a dry run. The earlier inaccessible-repository findings are historical.

## Divergence and preservation

Remote main contains substantial work absent from the local 0.2.0 export: `_core`, native Spotube playback controls/adapters, shared design changes, integration preparation and Windows/Android CI workflows. Local source has its own writing/reader/sync safeguards, native build verification and first shared DSP/queue extraction. Version numbers do not establish that either tree supersedes all of the other.

Save the local checkpoint in `continuations/af-0.2.0-2026-10-24/` on branch `codex/af-checkpoint-2026-10-24`, preserving existing main files. It is a recoverable source checkpoint, not a merge of both implementations. Future implementation should compare the two sources and port behavior deliberately with tests before replacing the active GitHub app. No force push or release tag is requested.

Signing material, tool/dependency caches, generated native outputs, installers/APKs and large model/runtime binaries are excluded from Git. The exact EXE/APK hashes remain in the native checkpoint document. No new app build was required for this documentation/plugin/Git-save update; the native/shared-core EXE and APK remain current.

## Private Tauri toolkit

- Display name: AnF Tauri Toolkit; package `anf-tauri-toolkit`, version `0.1.0`.
- Plugin: `Plugin_dad55eb1ebf08191a51c4e274da6310d`.
- Release: `pluginrel_6adce77fdcac81919b47f6d4cff08336`.
- Private workspace plugin: https://chatgpt.com/plugins/Plugin_dad55eb1ebf08191a51c4e274da6310d
- Editable source: `build-work/plugins/anf-tauri-toolkit`; portable archive: `build-work/artifacts/anf-tauri-toolkit-0.1.0.zip`.

Contains one reusable Tauri development skill, official reference links and a read-only Python source inspector for actual configuration, plugin dependencies/registrations, capabilities and missing default resource mappings. The inspector was run on the local A&F source. Package JSON/YAML and archive contents were checked; the saved plugin file listing confirms the expected skill and inspector. Creation/save does not establish installation or activation in this chat. No hosted MCP server, app runtime plugin, new network access or credentials are bundled. Open the private plugin to enable it for future chats as needed.

## Next synchronization milestone

Reconcile tested draft safeguards and shared-core work with main's native music integration and CI, keeping cryptographic/storage identities stable. Continue saving named source checkpoints to GitHub, with accurate commit/branch references and both-artifact delivery for app changes. Record actual push success separately from a prepared local commit.
