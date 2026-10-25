# Sync contract v1

Status: normative for Phase 3. Android and Windows must accept and emit this wire shape for conversation sync over the local link.

## Snapshot

```json
{
  "project": { /* Wire project */ },
  "revision": "<64 hex sha256>"
}
```

`revision` is `sha256` of the canonical JSON of the cleaned project (see Cleaning), hex lowercase, 64 characters.

## Wire project

| Field | Meaning | Limit |
| --- | --- | --- |
| `id` | Stable sync identity | 64 hex |
| `name` | Display name | ≤ 160 bytes UTF-8 |
| `title` | Sync title | ≤ 300 bytes UTF-8 |
| `question` | Prompt / question | ≤ 10_000 bytes |
| `draft` | Writing body | ≤ 200_000 bytes |
| `history` | Turns | ≤ 1000 |
| `history[].role` | `user` \| `assistant` (Windows may use other labels internally; wire uses these) | |
| `history[].content[].text` | Turn text | ≤ 200_000 bytes |
| `sources` | Documents when `documents=true` | each text ≤ 2_000_000 bytes |
| `sources[].path` | Always `null` on the wire | |
| `memory` | Opaque | |
| `model` | Opaque | |

## Cleaning

Before hashing or sending:

1. If `documents` is false, set `sources` to `[]`.
2. If `documents` is true, keep sources but set every `path` to `null`.

Revision is computed only on the cleaned object.

## Merge / conflicts

- Same `id` + different `revision` may produce a conflict copy.
- Conflict id: `sha256("coucou-conflict-v1|{id}|{revision}")` hex.
- Conflict name: original name truncated so total length ≤ 160 with suffix ` (conflict copy)`.

## Capabilities

Hosts may advertise features such as `reading-v1`. Document-inclusive sync must fail clearly if the peer lacks the required feature.

## Fixture

See `contracts/fixtures/sync-snapshot-v1.json`.
Verify with `node scripts/verify-contracts.mjs`.

## Out of scope for v1

Encrypting the wire on the link (link security is separate), and replacing SQLCipher with another store.
