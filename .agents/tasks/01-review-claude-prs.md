# 01: Review Claude's waiting pull requests

**Goal**: Claude's pull requests can't merge until an assistant that did not write them reviews them. Codex and Cursor are at their limits, so you review.

**Branch**: none (review only, change no code).

**Pull requests**: #255, #256, #264, #274, #277, #268.

**Steps**, for each one:
1. Read the description and the diff (`gh pr diff <n>`).
2. Check it against `AGENTS.md` section 5 (Ponytail, no telemetry, push not polling, replace in place, shipped views unchanged) and that its checks on GitHub are green.
3. Post one comment starting `Antigravity review of <head SHA, first 7 characters>:` then `approve` or `changes needed`, then a short list of findings with file and line. Only real problems; no style nitpicks.

**Done when**: each pull request is closed, or has a comment from you starting `Antigravity review of <first 7 characters of its current head SHA>:`. When the author pushes after your review, the head changes, so you review it again.
