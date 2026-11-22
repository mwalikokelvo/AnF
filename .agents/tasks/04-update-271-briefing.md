# 04: Kevo briefing de-duplication: catch up with main (PR #271)

**Goal**: #271 (de-duplicate briefing data, no fake badges for missing metrics) conflicts with `main`. Its only failing check was the Android emulator job, which failed because Google's and Maven Central's servers did not deliver `kotlin-stdlib:2.2.10` and other files that day; that is not this PR's fault.

**Branch**: keep working on `agy/kevo-7.1-briefing-unverified-data`. Comment `Taking this` on #271 first.

**Files**: whatever the merge touches; nothing else.

**Steps**:
1. `git merge origin/main` into the branch (merge, never rebase) and resolve conflicts. #239 (Kevo 7.1) is already on `main`, so keep its briefing code and re-apply only what #271 adds on top.
2. Push. If the Android job fails again with "Could not find …" from the Maven repositories, re-run that job once; do not change Gradle files for it.

**Checks**: `cd windows && npx tsc --noEmit && npm test`, `node scripts/check-release.mjs`.

**Done when**: #271 is no longer in conflict and its checks are green: `gh pr view 271 --json mergeable,mergeStateStatus` shows `MERGEABLE`.
