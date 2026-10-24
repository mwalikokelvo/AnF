# A&F master plan

24 October 2026. This is the working order for unifying Windows and Android. It replaces the suggestion to move Android onto Tauri before the vault can migrate.

## Why this order

Windows is a Tauri host. Android is a Java WebView host plus a Flutter music module. Shared TypeScript now owns tasks, knowledge, reading, library metadata, follow-ups, evidence, and the audio queue/denoise algorithms. The SQLCipher vaults are still separate, and `main`'s `_core` is a ThingsBook crate, not the AnF vault. Offline speech models are not in this checkout.

## Phases

### Phase 1 — Build the hosts that already exist

GitHub Actions builds the Windows base installer (no GGUF or DLL placeholders) and the current Android host with its embedded music module. Each run that is meant to be a delivery attaches both files. A missing model file must fail the full bundle only, not the base build. Do not publish those files as a production release: the Windows installer is unsigned, and the Android package stays `com.coucou.workspace.dev` until the original signing key is available.

Status: `.github/workflows/phase1-hosts.yml` is manual. It builds the Windows base installer without speech models, and the current Android host without the Flutter music module, which is not in this checkout. Run it with workflow dispatch. A green run is a development package, not a signed release.

### Phase 2 — One workspace, four destinations

The existing sections stay. A mode rail groups them:

- Reader: Home, Documents, Writing
- Assistant: Chat
- Music: Music Hub, Audio Studio
- Settings stays available in every mode

Opening a section from code switches to its mode, so a hidden section is never the current one. Unavailable native pieces stay explicit. This is not a visual redesign and does not claim the same music engine on both platforms.

Status: mode rail added in the Windows workspace shell. Android still uses its own navigation until that shell is shared.

### Phase 3 — Vault and sync contracts, then one Rust crate

Write the versioned vault and sync contracts and an encrypted fixture. Only after a round trip and recovery check, move SQLCipher operations behind that crate and call it from Windows. Do not point either host at `_core`.

Status: not started. The TypeScript `shared/` layer is not this crate.

### Phase 4 — Android calls the same crate

Add a bridge from the current Android host to the crate proven in Phase 3. A Tauri Android host is a later option, after music playback and vault recovery work on that bridge. Do not replace the Java host and the Flutter player in the same step.

Status: not started.

### Phase 5 — Speech models on request

The installer stays free of GGUF and DLL files. Settings offers a download for Piper, Kokoro, or Whisper only when a real model file and its license are known. Until then the action says the model is not installed. Missing models must not fail the base package.

Status: not started. No model is claimed available.

## Out of scope until the phase that owns it

Replacing the Android host, adopting `_core` as the vault, bundling dummy models, and signing a production upgrade.
