# OPDS pagination and cover prefetch

Checked 2026-11-03 at 10:50 AM CT (America/Chicago), Linux container.

No catalog screen calls this module, so there is no before/after UI to capture. Acceptance is the unit suite.

## Commands

```
cd windows && npx tsc --noEmit && npm test
```

`npx tsc --noEmit` exited 0.

`npm test` (`node scripts/test.mjs`) exited 0:

```
# tests 273
# suites 49
# pass 273
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 711.003887
```

## OPDS tests (all ok)

```
ok 37 - walks atom and json pages until rel=next disappears
ok 38 - reads page, offset, and cursor from the next link, not the current page
ok 39 - computes the next offset from OpenSearch when the link has none
ok 40 - drops a next link that is not a plain http(s) url
ok 41 - an empty feed stops the walk even when it still advertises rel=next
ok 42 - a blank feed body ends the catalog
ok 43 - a doctype payload is not followed
ok 44 - stops when the next url repeats a page already fetched
ok 45 - stops at the page cap while a further next link exists
ok 46 - a corrupt thumbnail is not stored and the full image is used
ok 47 - a slow thumbnail falls back to the next image before the deadline
ok 48 - broken and corrupt cover urls leave the cache empty
ok 49 - a cover already on disk or in memory is not fetched again
ok 50 - cover prefetch does not request a url that carries userinfo
```

## Not run

- `scripts/simplify-code.sh` exits 1: the shebang has a UTF-8 BOM (`﻿#!/usr/bin/env` not found), then `npx ponytail-cli` returns npm 404. No files were rewritten.
- No live OPDS server. Fetch and disk I/O are injected.
- Not installed. Playback and TTS files were not modified.
