# OPDS and KOReader offline queue

Checked 2026-11-03 at 4:01 PM CT (America/Chicago), Linux container.

No catalog screen and no reader view call these modules, so there is no before/after UI to capture. Acceptance is the unit suite. Reading state stays `{offset, bookmarks, annotations}`. The KOReader queue item fields are unchanged. OPDS feed and request files are a separate side store.

## Commands

```
cd windows && npm ci && npx tsc --noEmit && npm test
```

`npx tsc --noEmit` exited 0.

`npm test` (`node scripts/test.mjs`) exited 0:

```
# tests 305
# suites 49
# pass 305
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 856.167984
```

## What the new tests cover

- KOReader: a 503 is retried and a later 202 is not queued; five tries is the cap; 401 after a 503 is not queued; a queue file round-trips progress fields and drops `userkey`, bookmarks, and a slash document id; a corrupt file loads empty and the next push replaces it; drain skips a record older than 28 days and still sends the later one.
- OPDS: two failed fetches then a parsed feed; an offline next page serves the stored feed and queues that URL once; an HTML body is stored unparsed without replacing the parsed feed; a doctype body is never used as the fallback; a real empty feed replaces stale books; a blank body does not write the store; an oversized unparsed body is not stored; feed and queue JSON drop `javascript:` and userinfo URLs; a successful read leaves the other queued URL; drain retries then stops on the next offline URL; expired and credentialed URLs are not requested; a second drain does not send while the first request is in flight; text stores reload after `{`; the feed store keeps 32 pages and the queue keeps 100 URLs.

## Not run

- No live OPDS catalog and no live KOReader sync server. Fetch and storage are injected.
- Not installed. Playback, TTS, and the project store were not modified.
