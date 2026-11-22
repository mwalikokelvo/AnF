# 02: Kevo 0.5 fix 1, the Stop check (issue #278)

**Goal**: the self-test's Stop check (check 5) must measure Stop against speech that is really playing, without needing the local model to answer. Today on the PC the real model is used, gives no reply under memory pressure, and the check fails with `spokenBeforeStop=false`. Also the report's `"version"` says `0.1.58` because `appVersion` is never passed in.

**Branch**: `agy/kevo-0.5-fix-1` from `origin/main`. Comment `Taking this` on #278 first.

**Files**: `windows/src/workspace/jarvis/kevo-selftest.ts`, its caller in `windows/src/workspace/jarvis/jarvis-command-desk.ts`, their tests.

**Steps**:
1. In check 5 (around line 339), the fake `askAI` is installed only when the context has none. Install it for the Stop test always, and put the real one back afterwards, as the code already does at line 361. Leave every other check unchanged.
2. Pass `appVersion` from the caller so `"version"` matches the build; remove the hard-coded `'0.1.58'` fallback (line 535).
3. Add a test that check 5 passes when the real `askAI` returns nothing, and a test that the report's version is the one passed in.

**Checks** (`docs/KEVO-MAP.md` "Checks"): `cd windows && npx tsc --noEmit && npm test`, `node scripts/check-release.mjs`, `cd windows && npm run build`. No Rust build needed.

**Done when**: a pull request from `agy/kevo-0.5-fix-1` with `Closes #278` exists (open, merged or closed): `gh pr list --head agy/kevo-0.5-fix-1 --state all`.
