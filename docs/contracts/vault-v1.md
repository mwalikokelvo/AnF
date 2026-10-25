# Vault contract v1

Status: normative for Phase 3. Hosts may store data only in forms that satisfy this document. Do not point either host at `_core`; that crate is ThingsBook, not AnF.

## Identity

| Field | Rule |
| --- | --- |
| Schema key | `meta.schema` = `"1"` |
| Project id | 64 lowercase hex characters |
| Vault key | 64 lowercase hex characters (SQLCipher key material) |
| Engine | SQLCipher; unlock with `PRAGMA key="x'<key>'"` |

Unsupported `meta.schema` values must fail open with a clear error. Do not auto-migrate by inventing a new key.

## Tables

```sql
CREATE TABLE IF NOT EXISTS meta(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects(
  id TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS versions(
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  json TEXT NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS versions_id ON versions(id, seq);
CREATE VIRTUAL TABLE IF NOT EXISTS project_search USING fts5(
  id UNINDEXED, title, body, tokenize='unicode61'
);
```

- Keep at most **20** version rows per project id (newest wins).
- `updated` is milliseconds since Unix epoch (integer).
- `json` is a single Project object (see below), UTF-8, no BOM.

## Project JSON (v1)

| Field | Type | Limit |
| --- | --- | --- |
| `id` | string | 64 hex |
| `name` | string | ≤ 160 chars |
| `title` | string | ≤ 300 chars |
| `question` | string | ≤ 10_000 bytes UTF-8 |
| `draft` | string | ≤ 200_000 bytes UTF-8 |
| `history` | array | ≤ 1000 turns |
| `history[].role` | string | non-empty |
| `history[].content[].text` | string | ≤ 200_000 bytes each |
| `sources` | array | host-defined count (Android UI: ≤ 4) |
| `sources[].name` | string | file label |
| `sources[].text` | string | ≤ 2_000_000 bytes |
| `sources[].path` | string \| null | optional local path; strip on sync |
| `sources[].pages` | array | optional page slices |
| `sources[].reading` | object \| omit | offset, bookmarks ≤ 100, annotations ≤ 100 |
| `memory` | string | opaque host tag |
| `model` | string | opaque host tag |

Validation failures must reject the write and leave the previous row intact.

## Key handling

- Create a key only when intentionally enabling a new vault.
- If the OS keyring entry is missing for an existing vault file, **do not** generate a replacement key. Require recovery pack restore.
- Recovery pack must bind to this vault identity; a pack from another install must be rejected.

## Fixture

See `contracts/fixtures/project-v1.json` for a minimal valid Project.
Round-trip check: `node scripts/verify-contracts.mjs`.

## Out of scope for v1

Shared Rust crate extraction, UniFFI bridges, and adopting `_core`.
