# Neural TTS disk cache verification

Date: 2026-11-03 (America/Chicago)
Scope: `windows/src/workspace/tts-service.ts`. No read-aloud view calls this module yet, so there is no product screen to click. The coucou-audio IndexedDB schema (`indexedDB.open('coucou-audio', 2)`) was not changed.

## Acceptance

- A chunk is looked up on disk, and checked, before a provider is called.
- A valid file is a cache hit and does not dispatch synthesis.
- A missing file is a cache miss: the provider runs once and the framed chunk is stored.
- A bit-flipped, truncated, or non-audio file is deleted and synthesized again.
- `ENOSPC` on write returns the new audio, stores nothing, and leaves no `.partial` file.
- `ENOSPC` or another read error does not dispatch synthesis.
- Cleanup removes corrupt and expired chunks and trims oldest files to a byte budget.

## Evidence

Isolated disk run of `synthesizeChunk` + `createFileVoiceDisk` (temporary directory):

```
before: []
miss: source=provider cacheStored=true bytes=44 providerCalls=1
file: 2e9cea0dd81ba3b572c3922b9646634d45dbde2171a40a0223637c2a358ec16e.chunk
hit: source=cache cacheStored=true bytes=44 providerCalls=1
```

`npm test` in `windows/` (2026-11-03, about 9:55 AM America/Chicago):

```
# cache miss source=provider providerCalls=1 files=1
# cache hit source=cache providerCalls=1
# tests 251
# pass 251
# fail 0
```

`npx tsc --noEmit` in `windows/`: exit 0.
`node scripts/check-release.mjs`: 11 release checks pass.

Disabling the cache return (`if (false && cached)`) made `a repeated chunk is served from disk and the provider is not called again` fail with `source` actual `provider`, expected `cache`. The return was restored before the suite above.

`bash scripts/simplify-code.sh` did not run the tools. The script's first line has a UTF-8 BOM, so the shebang is not a comment, and `npx ponytail-cli` returns npm 404. No files were rewritten.

Screenshot of the disk run and suite totals: `tts-cache-hit-miss.png` in this directory.

Labels: tested on Linux. NOT installed. The Tauri shell and a live TTS provider were not exercised.
