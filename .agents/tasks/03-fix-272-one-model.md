# 03: Kevo 2.8 one local model: update the stale test and catch up with main (PR #272)

**Goal**: #272 makes Kevo use one local model, but `local_ai::tests::switches_between_fast_and_balanced_models_without_keys` (`windows/src-tauri/src/local_ai.rs`, around line 985) still asks for the `fast` and `balanced` profiles, so it panics at line 996 (`reply_profile(...).unwrap()`) on Linux and Windows. #272 also conflicts with `main`.

**Branch**: keep working on `agy/kevo-2.8-one-model` (the PR's own branch). Comment `Taking this` on #272 first.

**Files**: `windows/src-tauri/src/local_ai.rs` (the test only), plus whatever the merge from `main` touches.

**Steps**:
1. `git merge origin/main` into the branch (merge, never rebase). Resolve conflicts by keeping both sides' intent; ask on #272 if one is unclear.
2. Replace the two-profile test with one that checks the single model answers ("2 plus 2" → contains `4`), and that asking for a removed profile name gives a clear error rather than a panic. Do not loosen any other test.
3. CodeQL's "DOM text reinterpreted as HTML" in `writing.ts:123` is the old Bionic reader bug, fixed in #256. Once #256 is merged into `main`, the merge in step 1 clears it; do not fix it again here.

**Checks**: `cd windows/src-tauri && cargo test --locked --lib local_ai` (one Rust build at a time), `cd windows && npx tsc --noEmit && npm test`, `node scripts/check-release.mjs`.

**Done when**: #272's head has a green `build` on both the `Linux` and `Windows` workflows: `gh pr checks 272`.
