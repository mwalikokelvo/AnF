# KOReader progress sync verification

Date: 2026-11-03, 10:53 AM America/Chicago
Scope: `windows/src/workspace/koreader-sync.ts`. Reading progress is derived from the existing local state `{offset, bookmarks, annotations}`. The sync index and offline queue are separate objects. No project-store schema migration. No reader view calls this module, so there is no screen to click and no before/after screenshot.

## Acceptance

- A saved offset becomes a KOReader payload with `progress`, `percentage`, `device_id`, and `timestamp`, plus the document digest and 1-based chapter.
- Applying that payload restores the offset and leaves bookmarks, notes, and the three stored fields unchanged.
- A numeric KOReader page maps to the matching section start.
- An older timestamp, or a record from this `device_id`, does not move the saved offset.
- `PUT /syncs/progress` then `GET /syncs/progress/:document` round-trips `progress`, `device_id`, and `timestamp`. Missing auth is 401 and does not store a record. The response has no reading-note fields.
- A thrown network push is queued. A 401 is not queued. Drain stops on the next drop and delivers the queued progress once the send succeeds.
- The queue keeps the latest progress for a document on the same UTC day and drops entries older than 28 days.

## Evidence

`npm run typecheck` in `windows/` (10:53 AM America/Chicago): exit 0 (`tsc --noEmit`).

`npm test` in `windows/` (same run):

```
# tests 266
# pass 266
# fail 0
# cancelled 0
# skipped 0
```

Isolated file `windows/tests/koreader-sync.test.ts`: 7 pass / 0 fail, included in the 266.

`bash scripts/simplify-code.sh` (repo root): exit 1. The script's shebang has a UTF-8 BOM (`﻿#!/usr/bin/env`), and `ponytail-cli` is not on npm (404). No files were rewritten.

NOT installed. The Tauri shell and a live KOReader sync server were not contacted. The request builder does not perform a fetch.
