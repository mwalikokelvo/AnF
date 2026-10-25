# AnF contract fixtures

AnF only. **ThingsBook / `_core` is out of scope** for this tree of work.

| File | Role |
| --- | --- |
| `project-v1.json` | Minimal valid Project JSON |
| `sync-snapshot-v1.json` | Cleaned sync snapshot + fixture revision |
| `vault-v1-fixture.db` | SQLCipher vault (schema `1`), built by the tool below |
| `vault-v1-fixture.db.txt` | Test key + sha256 for the `.db` (test secrets only) |
| `vault-v1-fixture.KEY.txt` | Documented test key before the `.db` is built |

## Verify JSON contracts

```bash
node scripts/verify-contracts.mjs
```

## Build the encrypted vault fixture

```bash
cargo run --manifest-path contracts/tools/vault-fixture/Cargo.toml -- contracts/fixtures/vault-v1-fixture.db
```

The tool writes a SQLCipher database that:

- uses schema `1` and one sample project
- does not start with a plain `SQLite format 3` header
- does not contain the draft plaintext in the file bytes
- re-opens with the documented test key and reads the project back

That test key is **not** a production key. Do not reuse it in real installs.
