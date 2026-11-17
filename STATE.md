# Kevo autopilot state

Read and written by every autopilot run (`docs/kevo-autopilot/AUTOPILOT.md` on `main`). Owner: edit `paused: yes` to stop the autopilot.

paused: no
lock:
phase: 0
step: 0.1, 0.2, 0.3, 0.4a in parallel (board: issues #148-#153)
open_pr: #156 (0.4a, claude/kevo-0.4a, draft, waiting for CI and Codex review; mark ready for review when green). #154 (0.2) belongs to the interactive Claude session.
pc_test:
waiting_for: Codex finished #148 (0.1, task commit a094c54) and #150 (0.3, ecc5bf6) at 08:05-08:15Z but opened no pull request: the owner has to press "Create PR" on each Codex task (asked 2026-11-17T08:55Z). Stall rule (6 h after 07:59Z hand-off, about 14:00Z): take them over if still no PR. #154 (0.2): checks running, Codex finding on 8587146 open; interactive session owns it. #156 (0.4a): CI and Codex review. Jules is read-only (winds down 31 Dec 2026): never hand it work.
blocked:
last_passed_version: none yet
owner_needed: press "Create PR" on the two finished Codex tasks for #148 and #150 (links in their issue comments). Later: when step 0.4 is merged, install that build once and turn on "Run Kevo test builds and Kevo's self-test automatically" in AnF Settings

## Run log (newest last, keep 60)

- 2026-11-17 setup (Claude, interactive): plan, runbook and briefs in PR #146; state branch created; scheduled tasks "Kevo autopilot" and "Kevo PC results" created.
- 2026-11-17T06:28Z setup (Claude, interactive): team mode merged (PR #147); board #148-#153 created; #148 and #151 handed to Jules, #150 to Codex.
- 2026-11-17T07:47Z (Claude, interactive): Jules found read-only; #148 moved to team:codex, #151 to team:claude.
- 2026-11-17T08:02Z (Claude, interactive): Codex environment published by the owner; #148 and #150 handed to Codex (it reacted); Claude started #149.
- 2026-11-17T08:55Z (autopilot): built #151 (0.4a), PR #156 opened (draft, @codex review asked); 40 clips, 1.83 MB, all local checks pass. Board: Codex done on #148/#150 but no PRs, owner asked to press Create PR.
