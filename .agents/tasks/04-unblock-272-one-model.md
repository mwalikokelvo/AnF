# 04: Bring your #272 (Kevo 2.8, one local model) up to date and green

**Goal**: the owner wants one local model running the whole app. Your #272 does that but conflicts with `main` and fails `build` and `CodeQL`.

**Branch**: your existing `agy/kevo-2.8-one-model`. Merge, don't rebase.

**Files**: the ones #272 already touches. Nothing new.

**Steps**:
1. `git merge origin/main` into the branch. Resolve conflicts keeping everything `main` added since (Kevo fixes, the clause splitting in `local_ai.rs`, the prefill fix). Never drop `main`'s code to make yours fit.
2. Open the failing `build` and `CodeQL` logs on GitHub (`gh run view --log-failed`) and fix the cause. CodeQL findings are real problems: fix the code, never silence the rule.
3. Push and wait for the checks.

**Checks**: `AGENTS.md` section 8 (all of it, including `cargo test --locked --lib` in `windows/src-tauri`). Rust build: one at a time on this PC.

**Done when**: #272 has no conflicts and its `build` and `CodeQL` checks are green, or you posted on #272 what still fails after two tries.
