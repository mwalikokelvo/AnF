# A&F master plan

24 October 2026. This is the working order for unifying Windows and Android. It replaces the suggestion to move Android onto Tauri before the vault can migrate.

## Why this order

Windows is a Tauri host. Android is a Java WebView host plus a Flutter music module. Shared TypeScript now owns tasks, knowledge, reading, library metadata, follow-ups, evidence, and the audio queue/denoise algorithms. The SQLCipher vaults are still separate. **`_core` is ThingsBook, not AnF** — do not use it for AnF phases (see `docs/PROJECT-BOUNDARIES.md`). ThingsBook belongs in its own project space. Offline speech models are not in this checkout.

## Phases

### Phase 1 — Build the hosts that already exist

GitHub Actions builds the Windows base installer (no GGUF or DLL placeholders) and the current Android host. Each delivery run attaches both files. Do not publish those files as a production release: the Windows installer is unsigned, and the Android package stays a development host until the original signing key is available.

Status: **complete for development packages**. Workflow `.github/workflows/phase1-hosts.yml` succeeded on run 40140600169. Artifacts: `AF-Windows-base-setup` and `AF-Android-host`. Download from the run Artifacts section while signed into GitHub. Re-run after shell changes when you want a new APK/installer.

### Phase 2 — One workspace, four destinations

The existing sections stay. A mode rail groups them:

- Reader: Home, Documents, Writing
- Assistant: Chat
- Music: Music Hub, Audio Studio
- Settings stays available in every mode

Opening a section from code switches to its mode, so a hidden section is never the current one. Unavailable native pieces stay explicit. This is not a visual redesign and does not claim the same music engine on both platforms.

Status: **done** on Windows and Android sources. Rebuild the Android host to ship the mode rail in an APK.

### Phase 3 — Vault and sync contracts, then one Rust crate

Write the versioned vault and sync contracts and an encrypted fixture. Only after a round trip and recovery check, move SQLCipher operations behind that crate and call it from Windows. Do not point either host at `_core`.

Status: **contracts + JSON fixtures done; encryption skipped for now.** See `docs/contracts/`, `contracts/fixtures/`, and `node scripts/verify-contracts.mjs`. CI workflow `contracts.yml` runs the verify script on related path changes. SQLCipher binary fixture and shared Rust crate extraction wait until encryption work resumes. Not ThingsBook / `_core`.

### Phase 4 — Android calls the same crate

Add a bridge from the current Android host to the crate proven in Phase 3. A Tauri Android host is a later option, after music playback and vault recovery work on that bridge. Do not replace the Java host and the Flutter player in the same step.

Status: **bridge contract started.** See `docs/contracts/vault-bridge-v1.md` and `docs/AF-Phase-4-Bridge.md`. Operation names for Android `VaultRepository` / web `vaultCall` are frozen. Shared native library is still blocked on the Phase 3 AnF crate (encryption was deferred). Java host and Flutter music stay.

### Phase 5 — Speech models on request

The installer stays free of GGUF and DLL files. Settings offers a download for Piper, Kokoro, or Whisper only when a real model file and its license are known. Until then the action says the model is not installed. Missing models must not fail the base package.

Status: not started. No model is claimed available.

## Out of scope until the phase that owns it

Replacing the Android host, adopting `_core` as the vault, bundling dummy models, and signing a production upgrade.
