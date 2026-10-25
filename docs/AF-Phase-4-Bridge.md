# Phase 4 — Bridge plan (AnF)

## Dependency

Phase 4 in the master plan says Android calls the **same Rust crate** proven in Phase 3. Encryption/fixture work for that crate was **skipped for now**, so Phase 4 cannot finish as a shared-native migration yet.

What we can do now:

1. Freeze the **bridge surface** (`docs/contracts/vault-bridge-v1.md`).
2. Keep the **Java WebView + VaultRepository** path as the production Android vault.
3. Keep **Windows Tauri vault.rs** as the production Windows vault.
4. Leave ThingsBook / `_core` completely out of AnF storage.

## Architecture (current and target)

```
Today:
  Android Web → vaultRequest → VaultRepository (SQLCipher / AndroidKeyStore)
  Windows UI  → Tauri commands → vault.rs (SQLCipher / OS keyring)

Target (after Phase 3 AnF crate):
  Android Web → vaultRequest → VaultRepository → AnF vault lib
  Windows UI  → Tauri commands → AnF vault lib
```

Same operation names; one library; two hosts. Music stays on the existing Flutter path until a later, separate milestone.

## Acceptance for “Phase 4 complete”

- [ ] AnF vault library builds for Android and Windows
- [ ] Android `status` / `put` / `get` / `list` use the library
- [ ] Recovery secret still restores access after keystore clear (device test)
- [ ] No dependency on `_core`
- [ ] Flutter music host unchanged

## Status

**Bridge contract written.** Shared library and device acceptance are blocked on resuming Phase 3 crate work (or an explicit decision to implement the crate without the encrypted fixture step).
