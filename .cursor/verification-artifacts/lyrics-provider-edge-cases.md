# Lyrics provider network/edge-case verification

Date: 2026-11-03
Scope: windows/src/workspace/lyrics-provider.ts (unit-level; no UI surface)

## Acceptance
- fetchOnlineLyrics never throws on network failure, AbortError/timeout, invalid JSON, null body, or non-array search payload
- Valid exact-match synced lyrics still returned
- Sparse search entries (null holes) skipped safely

## Evidence
Ran isolated lyrics-provider suite via esbuild + node --test:
- 12 passed / 0 failed

Commands:
- npx esbuild tests/lyrics-provider.test.ts --bundle --platform=node --format=esm --target=node20 --packages=external --outfile=tests/.lyrics-provider.test.mjs
- node --test tests/.lyrics-provider.test.mjs

Note: full windows test suite has a pre-existing unrelated failure in audio-player.test.ts (CONTENT_FROM_FILE_TOO_LARGE...). scripts/simplify-code.sh could not run: ponytail-cli / pstack-cli / thermonuclear-review-cli are not published on npm (404).
