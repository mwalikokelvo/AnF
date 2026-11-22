# Antigravity job queue

Claude writes jobs here so Antigravity builds them on the owner's PC; Claude then only reviews the result. Start the queue in Antigravity with `/pickup` (the skill in `.agents/skills/pickup/SKILL.md`; if `/pickup` is not offered, say "follow .agents/skills/pickup/SKILL.md").

- One file per job, numbered in the order to do them: `NN-short-name.md`.
- Each job has: **Goal**, **Branch**, **Files** it may touch, **Steps**, **Checks**, **Done when** (a fact on GitHub that shows the job is finished, so a finished job is skipped next time).
- Finished jobs are not moved or deleted by Antigravity; Claude clears old ones in its next queue update.
- On hold, do not touch: the Kevo Phase 7.2–9.4 pull requests (#240–#244, #247–#254). They wait for the owner's decision and the PC tests (see #266, item 4).
