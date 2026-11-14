# build-loop auto-update loop

This repo carries a copy of the **build-loop** skill plus the machinery that keeps its bundled skills current. A weekly scheduled task runs the updater, and you re-upload the refreshed package to claude.ai.

## What's here

- `SKILL.md`, `references/`, `scripts/`, `assets/`, `agents/`, `vendor/`, `evals/`, `NOTICE.md` — the skill itself (see `references/vendored-skills.md` for what's bundled and why).
- `sources.json` — the single source of truth: every bundled skill (url, path, licence, last-adopted commit), the persona pack, the docs-only "adapted" sources, and the plugins / MCP servers we run. Add new things here.
- `update.py` — the updater. Re-clones each source, regenerates the bundles, verifies them, repackages `build-loop.skill`, and writes a report.
- `scripts/pack_vendor.py`, `pack_personas.py`, `make_roster.py`, `make_licenses.py` — the generators `update.py` drives.

## What the loop does each week (auto-adopt latest)

1. Clone every source in `sources.json` at its **default-branch HEAD** (auto-adopt — your choice).
2. Regenerate `vendor/*.md`, `agents/*.md`, `CATALOG.md`, `LICENSES.md`, `ROSTER.md`.
3. **Verify** every bundled file still equals its upstream original byte-for-byte.
4. **Safety scan** (done by the scheduled session, not this script): each *changed* source is scanned before anything is committed. If one comes back flagged malicious, the run is discarded and the last known-good version is kept — you get an alert instead of a silent bad bundle.
5. Repackage `build-loop.skill`, check the limits (≤200 files, ≤30 MB, description ≤1024).
6. Commit the regenerated files to a branch and open/refresh a PR; record the newly adopted commits in `sources.json`.
7. Flag any **adapted** source (condensed into `references/`, not auto-regenerable) whose upstream moved, so it can be refreshed by hand.

Two steps stay yours by design: **merging the PR** to the default branch, and **re-uploading** `build-loop.skill` to claude.ai (Settings → Capabilities → Skills). Neither can be automated, and both are the "publishing waits for the owner" line.

## Run it by hand

```bash
python3 update.py --repo . --latest          # clone latest, regenerate, repackage, report
python3 update.py --repo . --pin              # clone the recorded commits — proves reproducibility
python3 update.py --repo . --use-src DIR      # reuse existing clones under DIR/<repo-basename>
```

Outputs `build-loop.skill` and `build-loop-update-report.json` next to the repo (both gitignored).

## Add a new skill / plugin / MCP server

Edit `sources.json`:
- **A skill** that bundles verbatim → add to `vendor[]` (`name`, `url`, `root` path inside the repo, optional `prefix`, `exclude`, `licence`). Run `update.py --latest`; it bundles and records the commit.
- **A skill adapted into the loop's own docs** → add to `adapted[]` (flag-only on upstream change).
- **A plugin** → add to `plugins[]` with its `/plugin install` command.
- **An MCP server** → add to `mcp_servers[]` with its launch command (these self-update at runtime via `npx …@latest` / `uvx`).

Then watch the limits in the report. The description field is the tight one; adding a bundled skill doesn't touch it, but widening what triggers the skill does.
