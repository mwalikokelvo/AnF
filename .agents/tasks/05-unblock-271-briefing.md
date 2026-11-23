# 05: Bring your #271 (Kevo 7.1 briefing data) up to date and green

**Goal**: #271 conflicts with `main` and fails `build`. Make it mergeable. It still merges only after the owner says yes to Phase 7 (`docs/KEVO-PLAN.md`), so don't add anything new.

**Branch**: your existing `agy/kevo-7.1-briefing-unverified-data`. Merge, don't rebase.

**Steps**:
1. `git merge origin/main`, resolve conflicts keeping `main`'s code.
2. Check the two points from #266 item 3 are still true in the branch: a missing value shows "not available" with no "Verified Local Data" badge, and the briefing data is gathered by one helper, not pasted twice in `jarvis-command-desk.ts`.
3. Fix the `build` failure from its log. Push.

**Checks**: `cd windows && npx tsc --noEmit && npm test && npm run build`, `node scripts/check-release.mjs`.

**Done when**: #271 has no conflicts and `build` is green, or you posted on #271 what still fails after two tries.
