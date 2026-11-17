# Kevo team: how the assistants work together

Owner's instruction (17 Nov 2026): the assistants work on Kevo together and at the same time, not Claude alone. GitHub issues are the shared task board. The Claude autopilot (`AUTOPILOT.md`) coordinates; it does not do everything itself.

## The board

- Every brief step is one GitHub issue titled `Kevo <step>: <name>` (for example `Kevo 0.3: test builds`), labelled `kevo` and one owner label: `team:claude`, `team:codex`, `team:jules` or `team:any`.
- The issue body holds: a link to the brief section (the brief is the spec), the files it may touch, the checks to run, and `Depends on #N` lines.
- A step is **ready** when every issue it depends on is closed. Only ready steps are handed out.
- Steps that do not depend on each other run **at the same time**, each on its own branch.
- One assistant per issue. An assistant claims it by commenting "Taking this" (bots do this by starting their task), and links its pull request with `Closes #N`.

## Who builds what

| Assistant | How it is started | Best at, so it gets |
|---|---|---|
| Codex (cloud) | The autopilot comments on the issue: `@codex <task>: follow docs/kevo-briefs/<file> step <n> and docs/kevo-autopilot/TEAM.md; open a pull request with Closes #N` | Rust, CI workflows, build and packaging |
| Jules (Google, cloud) | The autopilot adds the label `jules` to the issue | TypeScript, UI, tests, the phrase list, scripts |
| Claude autopilot (cloud) | Itself, every 2 hours | Steps that join several parts, hard bugs, the briefs, reviews and merges |
| Antigravity, Gemini CLI, Cursor, Hermes, DeepSeek, Grok (on the owner's PC) | When the owner opens one | Any open issue labelled `team:any` that nobody has claimed; same rules |

The autopilot sets the owner label when it creates the issue, following the table and the brief. Load stays balanced: at most 2 open tasks per cloud assistant at a time.

## Rules for every assistant

1. Read `CLAUDE.md` (or `AGENTS.md` / `GEMINI.md`), `docs/KEVO-MAP.md`, the brief step, and this file first.
2. Branch from `main`: `<assistant>/kevo-<step>` (bots may use their own branch names). Never push to `main`, never force-push someone else's branch.
3. Touch only the files the issue names, plus the always-allowed files in `AUTOPILOT.md`.
4. Run every check in `docs/KEVO-MAP.md` "Checks" before opening the pull request, and say what was tested.
5. Do not bump the version: the autopilot does that when it merges (so parallel pull requests don't conflict on it).
6. Never merge your own pull request. The autopilot merges when the gates pass.

## Cross-review

Every pull request is reviewed by an assistant that did not write it:
- Codex reviews every pull request automatically.
- Pull requests written by Codex also get a fresh Claude subagent review.
- A reviewer's findings go back to the author first (`@codex fix the review findings`, or Jules fixes its own CI and review findings). The autopilot takes over a pull request only when the author has not fixed it within 6 hours or after 2 failed attempts, by branching from it (never force-pushing it).

## When a task stalls

- No pull request 6 hours after the hand-off (Codex did not react, Jules is at its daily limit, an app lost repo access): the autopilot comments why on the issue, moves the owner label to `team:claude`, and builds it itself.
- A builder that stalls twice in a row on the same day gets no new tasks until the next day.

## Merging parallel work

The autopilot merges one pull request at a time, oldest ready first. Before each merge it brings the branch up to date with `main` (merge, not rebase), bumps the version on that branch, waits for the checks to pass again, then merges. A conflict it cannot resolve cleanly goes back to the author.
