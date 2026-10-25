# A&F master plan

24 October 2026. This is the working order for unifying Windows and Android. It replaces the suggestion to move Android onto Tauri before the vault can migrate.

## Why this order

Windows is a Tauri host. Android is a Java WebView host plus a Flutter music module. Shared TypeScript now owns tasks, knowledge, reading, library metadata, follow-ups, evidence, and the audio queue/denoise algorithms. The SQLCipher vaults are still separate. **`_core` is ThingsBook, not AnF** — do not use it for AnF phases (see `docs/PROJECT-BOUNDARIES.md`). ThingsBook belongs in its own project space. Offline speech models are not in this checkout.

## Phases

### Phase 1 — Build the hosts that already exist

GitHub Actions builds the Windows base installer (no GGUF or DLL placeholders) and the current Android host. Each delivery run attaches both files. Do not publish those files as a production release: the Windows installer is unsigned, and the Android package stays a development host until the original signing key is available.

Status: **complete for development packages**. Workflow `.github/workflows/phase1-hosts.yml` succeeded on run 40140600169. Artifacts: `AF-Windows-base-setup` and `AF-Android-host`. Download from the run Artifacts section while signed into GitHub. Re-run after shell changes when you want a new APK/installer. Android host with mode rail: Actions run [40147945248](https://github.com/mwalikokelvo/AnF/actions/runs/40147945248) artifact `AF-Android-host`. Phase 1 upload paths fixed to `releases/` + `gradle-build/`.

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

Status: **contracts done; `crates/anf-vault` started and linked from Windows** via `anf_vault_bridge`. Schema/ops constants shared; SQLCipher still host-local. Encryption fixture still skipped. Not ThingsBook / `_core`.

### Phase 4 — Android calls the same crate

Add a bridge from the current Android host to the crate proven in Phase 3. A Tauri Android host is a later option, after music playback and vault recovery work on that bridge. Do not replace the Java host and the Flutter player in the same step.

Status: **bridge contract + domain crate.** See `docs/contracts/vault-bridge-v1.md`, `docs/AF-Phase-4-Bridge.md`, and `crates/anf-vault`. Android still uses Java `VaultRepository`; next step is host adapters calling `anf-vault` for validation/revision. Java host and Flutter music stay. Not `_core`.

### Phase 5 — Speech models on request

The installer stays free of GGUF and DLL files. Settings offers a download for Piper, Kokoro, or Whisper only when a real model file and its license are known. Until then the action says the model is not installed. Missing models must not fail the base package.

Status: not started. No model is claimed available.

## Out of scope until the phase that owns it

Replacing the Android host, adopting `_core` as the vault, bundling dummy models, and signing a production upgrade.

## 25 October verification update

The encrypted Phase 3 fixture has now run locally with SQLCipher. Wrong-key rejection, recovery-key reopen, integrity, plaintext exclusion, and refusal to overwrite an existing fixture passed. The fixture tool now consumes `anf-vault` schema constants and matches the Windows rusqlite version. This clears the fixture verification gap; it does not move live Windows/Android databases into the shared crate or complete Phase 4. See `docs/AF-Marketplace-Vault-Checkpoint-2026-10-25.md`.
