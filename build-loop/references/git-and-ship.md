# Git, Docs, CI & Release

Open this when committing, writing docs, touching CI, or preparing a release.

## Project conventions first

If the rules file or runbook specifies branch prefixes (e.g. `claude/*` for Claude, `codex/*` for Codex), commit trailers, merge style, or how PRs are opened, follow it exactly — other agents and the user's tooling depend on it. Typical multi-agent rules worth assuming if nothing is written: branch from the up-to-date main, use your own worktree, plain merge commits, no squash or rebase of shared branches, never force-push, never merge to main yourself.

## Commits

- Work on a short-lived branch (project prefix, else `feat/<slug>`, `fix/<slug>`). Check `git status` before starting and never mix in the user's uncommitted work — if the tree is dirty with unrelated changes, leave them unstaged.
- **One slice = one commit**: the change, its tests, and nothing else. Refactors and formatting get their own commits.
- Message: imperative summary line that stands alone in history, following the repo's convention (look at `git log --oneline -20`; Conventional Commits if they use it): `feat(export): add CSV export of entries`. Body: what and *why*, anything surprising, how it was verified. Not "fix bug", "updates", "wip".
- Before each commit: run the checks, review `git diff --cached`, make sure no secrets, build output, `.env`, or large generated files are staged. Keep `.gitignore` current.
- Never rewrite history that has been pushed or shared; never force-push without explicit instruction.
- Generated files (lockfiles, codegen): commit the lockfile, review its diff, never hand-edit it; regenerate codegen with the project's command rather than editing output.

## Save points

Commits are save points. If an approach goes wrong, return to the last green commit instead of patching forward. `git stash push -m "<slice> blocked" -- <files>` parks a blocked slice without losing it.

## Documentation

- **Document the why.** Code shows what; docs and comments record why, the constraints, and the rejected alternatives. Comment non-obvious intent and known gotchas; don't narrate obvious code.
- **README**: update what a new user needs — what it does, how to install/run, new commands or settings.
- **CHANGELOG** (if the project keeps one, or for user-facing apps): write the entry with the change, for users, grouped as Added / Changed / Fixed / Deprecated / Removed / Security. Not a dump of commit messages.
- **ADR** for decisions that are expensive to reverse (data store, sync model, plugin architecture, framework). Match the repo's existing ADR format if any; otherwise `docs/adr/NNNN-title.md`:

```markdown
# NNNN: <Decision title>
Status: Accepted · Date: YYYY-MM-DD
## Context
<the forces and constraints>
## Decision
<what we chose>
## Alternatives considered
<each option, and why not>
## Consequences
<what gets easier, what gets harder, what we must now do>
```

- Docs describe the current state in timeless language ("Exports are written as UTF-8 CSV"), not the history of the change.
- Rules files (`CLAUDE.md`, `AGENTS.md`) help future agent sessions: if this feature added a new command, convention, or "never do X", add one line there.

## CI

- The pipeline is the quality gate: install (frozen lockfile) → lint → type-check → test → build, failing fast, on every push/PR.
- Reproduce CI failures locally with the same commands before changing anything; read the full log, not just the last line. For matrix builds (Windows/macOS/Linux/Android), check what's platform-specific: paths, case sensitivity, line endings, system dependencies, toolchain and SDK versions, signing.
- Fix flaky tests or quarantine them with a tracked note; never just re-run until green or delete the test.
- Cache dependencies; pin action and toolchain versions; keep secrets in the CI secret store, scoped to the jobs that need them.
- A CI change is a code change: one concern per commit, verified by a run.
- When CI keeps going red, prefer the fix that stays fixed (pin the toolchain, fix the flaky test, cache the dependency) over the fix that turns one run green.

### Using CI when this machine can't build a target

Cloud containers often can't build desktop or mobile targets (missing OS, SDK, or system libraries; package hosts blocked). Then CI is the build machine:

1. Find the workflow that builds the target (`.github/workflows/*.yml`; check its `on:` triggers and paths).
2. Push your branch (if allowed) or trigger it: `gh workflow run <file>.yml --ref <branch>` (use the REST API, `gh api repos/<owner>/<repo>/actions/workflows/<file>/dispatches -f ref=<branch>`, if GraphQL is blocked).
3. Poll `gh api repos/<owner>/<repo>/actions/runs?branch=<branch>` until it finishes; read failed job logs before changing anything.
4. Report the run id and label the result "CI-built" (or what the workflow actually verified, e.g. "CI-built, emulator-tested") — not "installed".

If artifacts can't be downloaded from this environment, give the user the run page link where they can download them.

## Release & rollout

- **Versioning**: semver judged by what users can observe — a behaviour change they relied on is a major, whatever the diff size. Tag the release from the commit that was tested; the tag is the source of truth.
- **Feature flags**: put risky or half-finished user-visible work behind a flag defaulting off; it's also your kill switch. Record when the flag will be removed.
- **Staged rollout** where the platform allows (internal → small % → all), watching error rate and key metrics at each step.
- **Rollback plan** written before release: trigger conditions, exact steps, data considerations, how long it takes.

- **Keep the version in sync** everywhere the project stores it (e.g. `tauri.conf.json`, `Cargo.toml`, `package.json`, Android `versionCode`) — the project's release script or runbook says which.
- **Never overwrite a verified release**; a new build gets a new version.
- **Mobile upgrades keep user data:** Android release builds must be signed with the same key as the installed app so they install over it (uninstalling wipes on-device data). Never commit, print, or move the signing key; if it isn't available here, say the build is unsigned or debug-signed.
- **Publish checksums** (SHA-256) next to every downloadable artifact.

In autonomous mode, preparing a release (version bump commit, changelog, release notes, CI build) is in scope. Building and handing over release artifacts is in scope too **when a standing permission says so** (e.g. "deliver the Windows and Android builds without asking"). Merging to main, pushing release tags, publishing to stores or registries, and deploying stay with the user unless a permission explicitly covers them — put the exact commands in the report.

### Release report

Lead with what the user came for, then the evidence:

```
<App> 1.4.0 — Windows x64 installer: <link>  ·  Android APK: <link>
SHA-256: <sums>
Verification: Windows — CI-built (run 123456); Android — CI-built, emulator-tested (run 123457); not installed on a phone
What's new: <2–4 lines, from the changelog>
Not verified / known gaps: <...>
```

### Watching PRs and releases

- **Before merge:** the bundled `claude-mem babysit` skill (`python3 scripts/vendor.py claude-mem babysit/SKILL.md`) loops over a PR — CI, review comments, fixes — until it's merge-ready. It stops there: merging into main follows §8.
- **After a release:** `claude-mem childhood` checks what actually shipped — published packages, download links, installed version, production behaviour. Use it to earn the "installed" / "smoke-launched" labels after a permitted release, or to list exactly what still needs a human to check.
- **Comparing other agents' work:** `claude-mem standup` lines up branches, worktrees and PRs (e.g. `claude/*`, `codex/*`, `integration/*`) and produces one consolidation plan.

## Shared handoff file

When several agents work on a project, a handoff file (commonly `HANDOFF.md`) is the shared memory every worker reads first and updates last — chat history isn't visible to the next agent. Append, keep it short, never rewrite others' entries:

```markdown
## YYYY-MM-DD <agent> — <what> (branch `<branch>`)
- Built: <one or two lines>
- Verification: <claims with labels; what was NOT verified>
- Links: <PR, CI run, downloads>
- Open: <what's left, who decides>
```

Update its status table if it has one (line of work, branch, version, state). If none exists, create it with a status table and your entry.

## Excuses vs. reality

| Excuse | Reality |
|---|---|
| "I'll commit when the feature is done" | One giant commit can't be reviewed, bisected, or partly reverted. |
| "The message doesn't matter" | It's the only documentation most changes ever get. |
| "I'll squash it all later" | Clean slice commits from the start make squashing unnecessary. |
| "CI is just flaky, re-run it" | Flakiness is a bug. Find it or quarantine it with a note. |
| "The changelog is just the commit log" | Commits are for developers; the changelog is for users. |
