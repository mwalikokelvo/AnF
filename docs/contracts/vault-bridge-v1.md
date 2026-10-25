# Vault bridge contract v1 (AnF)

**AnF only.** ThingsBook / `_core` is not this bridge.

Phase 4 goal: Android keeps its **Java WebView host** and existing `VaultRepository`. A future shared AnF vault library (from Phase 3) will implement the same operations. Until that library exists, Android continues to call Java SQLCipher; Windows continues to call `windows/src-tauri/src/vault.rs`.

## Transport (Android today)

| Layer | Role |
| --- | --- |
| Web | `android/web/native-vault.ts` → `vaultCall(operation, args)` |
| Bridge | `MainActivity.vaultRequest(id, operation, json)` |
| Store | `VaultRepository.request(operation, json)` → JSON string result |
| Reply | `window.vaultResult(id, value, error)` |

Limits: request JSON ≤ 17_000_000 chars; at most 8 concurrent vault jobs; 120s timeout in the web layer.

## Operations (shared names)

Both hosts should understand these operation strings. Argument and result shapes follow vault/sync contracts in `docs/contracts/vault-v1.md` and `docs/contracts/sync-v1.md` where applicable.

| Operation | Purpose |
| --- | --- |
| `status` | `{ encrypted, projects?, legacy_retained?, engine? }` |
| `begin` | Start migration staging (Android) |
| `commit` | Finish migration after integrity check |
| `put` | Upsert one or more projects |
| `get` | Load project by id |
| `list` | Search/list summaries |
| `versions` | List snapshot metadata for an id |
| `version` | Load one snapshot by seq |
| `migration_put` / `migration_get` | Staging-only paths during enable |
| `recovery` | Export recovery secret (when allowed) |
| `recover` | Restore keyring/keystore from recovery secret |

Unsupported operation → clear error; do not fall back to a silent plaintext write when encrypted mode is active.

## Project payload

JSON must satisfy **vault contract v1** limits (id 64 hex, name/title/question/draft/history/sources bounds). Validation failures leave the previous row intact.

## What Phase 4 is not

- Not replacing the Java host with Tauri Android in this step
- Not removing or rewriting the Flutter music module
- Not pointing either host at ThingsBook `_core`
- Not claiming a shared native `.so` is already shipped

## Next implementation step (when Phase 3 crate exists)

1. Package AnF vault logic as an Android-callable library (JNI/UniFFI or equivalent).
2. Keep `VaultRepository.request` as the single entry; swap the body to the library while preserving operation names.
3. Prove status → put → get → list → recovery round trip on a device build.
4. Only then consider a Tauri Android host as a separate milestone.
