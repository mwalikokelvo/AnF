# Synced LRC timestamp and active-line verification

Date: 2026-11-03 (America/Chicago)
Scope: `windows/src/workspace/lyrics-provider.ts` and `windows/tests/lyrics-provider.test.ts`
UI: none. Playback controls and stored lyrics were not changed, so there is no screen to capture.

## Acceptance
- `[mm:ss.xx]` tags become times in seconds, including `00:00.00`, `00:59.99`, and `01:00.00`
- The active line is the latest line at or before the playback time, and is null before the first stamp
- Malformed tags (`ss >= 60`, non-numeric fractions, extra fraction digits) are dropped
- Out-of-order stamps are sorted before the active line is chosen
- Plain text stays unsynced and has no active line
- Existing LRCLIB fetch tests still pass

## Evidence
Commands (Linux container, `windows/`):

```
./node_modules/.bin/tsc --noEmit
npm test
```

`tsc --noEmit` exit 0.

`npm test` summary:

```
# tests 244
# suites 49
# pass 244
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 565.374718
```

Isolated `lyrics-provider.test.ts` (same suite): 16 pass / 0 fail, including the four new cases for boundaries, malformed tags, unsynced text, and out-of-order stamps.

`bash scripts/simplify-code.sh` exit 1. The shebang line is a UTF-8 BOM plus `#!/usr/bin/env`, and `npx ponytail-cli` returns npm 404. No files were rewritten by that script.
