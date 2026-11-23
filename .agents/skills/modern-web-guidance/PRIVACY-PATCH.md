# modern-web-guidance — telemetry removed

This folder is Google Chrome's `modern-web-guidance` skill (npm `modern-web-guidance` 1.0.1,
skill version 2026_11_10-47b4c80e, Apache-2.0, see `LICENSE`), modified by the owner's request so
that it sends nothing to Google or anyone else.

## What the upstream build sends

On every `search`, `retrieve`, `list` and `legacy-scan`, upstream starts a detached background
process (`watchdog/main.js`) that posts to Google's Clearcut endpoint (`play.googleapis.com/log`):
the search query text, the guide IDs retrieved, the OS, the coding agent in use, the tool and skill
versions, and timing. It is on unless `DISABLE_TELEMETRY=1` is set. The upstream `SKILL.md` also runs
the tool through `npx ...@latest`, which downloads fresh code from npm on every call.

## What was changed

1. Deleted `watchdog/` (the uploader).
2. In `modern-web.mjs`, deleted the watchdog client and replaced the Clearcut logger with a
   no-op class. Nothing is recorded or sent, whatever the environment.
3. `install`, `update` and `uninstall` now refuse to run, because they would download the upstream
   build (with telemetry) over this copy.
4. `SKILL.md` runs the local copy (`node .agents/skills/modern-web-guidance/modern-web.mjs ...`)
   instead of `npx modern-web-guidance@latest`, so no npm download happens either.
5. Removed `search.mjs.map` (a source map, not needed to run).

The guides, the search index (`gen/`) and `legacy-scan.mjs` are unchanged and work fully offline.
The only optional local logging left is upstream's `ENABLE_FILE_LOGGING=true`, which writes a
`modern-web.log` file on your own disk and is off by default.

## Updating

Do not run the tool's `update`. To take a newer upstream version: `npm pack modern-web-guidance@latest`,
unpack it, repeat the five changes above, and run
`node .agents/skills/modern-web-guidance/check-no-telemetry.mjs` before committing.
