# anf-vault

Shared **AnF** domain for vault projects, schema constants, and sync revision helpers.

- Not ThingsBook / `_core`
- No SQLCipher dependency yet (storage stays in each host)
- Bridge operation names match `docs/contracts/vault-bridge-v1.md`

```bash
cargo test --manifest-path crates/anf-vault/Cargo.toml
```
