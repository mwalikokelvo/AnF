# Kevo autopilot state

Read and written by every autopilot run (`docs/kevo-autopilot/AUTOPILOT.md` on `main`). Owner: edit `paused: yes` to stop the autopilot.

paused: no
lock:
phase: 0
step: 0.1, 0.2, 0.3, 0.4a in parallel (board: issues #148-#153)
open_pr:
pc_test:
waiting_for: Jules on #148 and #151 (handed out 2026-11-17T06:28Z); Codex on #150 (handed out 2026-11-17T06:28Z; Codex said on PR #147 it needs a cloud environment for this repo). Claude builds #149 next.
blocked:
last_passed_version: none yet
owner_needed: none yet. When step 0.4 is merged: install that build once and turn on "Run Kevo test builds and Kevo's self-test automatically" in AnF Settings

## Run log (newest last, keep 60)

- 2026-11-17 setup (Claude, interactive): plan, runbook and briefs in PR #146; state branch created; scheduled tasks "Kevo autopilot" and "Kevo PC results" created.
- 2026-11-17T06:28Z setup (Claude, interactive): team mode merged (PR #147); board #148-#153 created; #148 and #151 handed to Jules, #150 to Codex.
