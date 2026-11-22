---
description: Work through the Antigravity job queue in .agents/tasks/, one job after another, until it is empty
---

# /pickup

The queue is `.agents/tasks/`. Claude writes the jobs; you build them. Read `AGENTS.md` first (it is already loaded as a rule) and follow it in every job.

1. `git fetch origin` and read the job files on `origin/main`, lowest number first. Skip `README.md`. If `origin/main` has no `.agents/tasks/` yet, read them from `origin/claude/antigravity-handoff` (`git show origin/claude/antigravity-handoff:.agents/tasks/<file>`).
2. For each job, check its **Done when** line on GitHub (`gh`). If it is already true, skip the job.
3. Do the job exactly as written. Touch only the files it names, plus `HANDOFF.md` and `CHANGELOG.md`.
   - Code jobs: branch from the branch the job names (usually `origin/main`), on the `agy/` branch the job names. Run the checks it lists, push, open or update the pull request.
   - Review jobs: post your review as a comment on each pull request. Do not change their code.
4. Say exactly what you tested ("compiled", "automated tests", "installed on the PC" are different claims).
5. Two strikes: if the same build or test fails twice, stop that job, write what failed on the pull request or issue, and go to the next job.
6. One Rust build on this PC at a time (8 GB RAM). Close other heavy apps before a build.
7. Never push to `main`, never merge, never force-push someone else's branch.
8. When a code job is done, add a dated entry to `HANDOFF.md` **in that job's pull request** (what was done, what was tested, what is left).

When every job is done or skipped, stop and write a short summary in the Antigravity chat: one line per job (done, skipped and why, or failed and why).
