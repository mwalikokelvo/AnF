# Kevo autopilot state

Read and written by every autopilot run (`docs/kevo-autopilot/AUTOPILOT.md` on `main`). Owner: edit `paused: yes` to stop the autopilot.

paused: no
lock:
phase: 0
step: 0.1, 0.2, 0.3, 0.4a in parallel (board: issues #148-#153)
open_pr:
pc_test:
waiting_for: Codex building #148 (0.1) and #150 (0.3), both handed out 2026-11-17T08:02Z, Codex reacted. Claude (interactive session) building #149 (0.2) on branch claude/kevo-0.2 - do not start it. Next for the autopilot: #151 (0.4a). Jules is read-only (winds down 31 Dec 2026): never hand it work.
blocked:
last_passed_version: none yet
owner_needed: none yet. When step 0.4 is merged: install that build once and turn on "Run Kevo test builds and Kevo's self-test automatically" in AnF Settings

## Run log (newest last, keep 60)

- 2026-11-17 setup (Claude, interactive): plan, runbook and briefs in PR #146; state branch created; scheduled tasks "Kevo autopilot" and "Kevo PC results" created.
- 2026-11-17T06:28Z setup (Claude, interactive): team mode merged (PR #147); board #148-#153 created; #148 and #151 handed to Jules, #150 to Codex.
- 2026-11-17T07:47Z (Claude, interactive): Jules found read-only; #148 moved to team:codex, #151 to team:claude.
- 2026-11-17T08:02Z (Claude, interactive): Codex environment published by the owner; #148 and #150 handed to Codex (it reacted); Claude started #149.
