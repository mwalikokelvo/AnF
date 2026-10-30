# Multi-LLM Continuity & Buildup Protocol

Repository: [mwalikokelvo/AnF](https://github.com/mwalikokelvo/AnF)

This repository is developed concurrently across multiple AI systems:
* **Anthropic Claude** (Claude Code, Sonnet) → Commits typically on `claude/*`
* **OpenAI Codex** → Checkpoints and PRs typically on `codex/*`
* **Google DeepMind Antigravity / Gemini** → Core workspace orchestration, test automation, and builds

---

## 🧭 The 3-Step Continuity Protocol

Before writing or modifying any code in AnF, every AI agent must execute this 3-step intake:

### Step 1: Trace Existing Checkpoints & Active Branches
1. Inspect `continuations/` (e.g. `continuations/af-0.2.0-2026-10-24/` and `AF-Delivery-Requirements.md`).
2. Run `git for-each-ref --format='%(committerdate:short) %(refname:short) | %(subject)' refs/remotes/origin/` to view the latest commits across:
   - `claude/*` (e.g., companion, marketplace, sync-main)
   - `codex/*` (e.g., checkpoints, app downloads, vault recovery)
   - `integration/*` (e.g., bugfix integration, PR branches)
   - `release/*`

### Step 2: Reconcile and Preserve Prior Buildup
1. Compare your base branch with recent unmerged remote branches (`git log origin/main..<branch>`).
2. Determine what features, fixes, or safeguards the other LLM completed.
3. Incorporate those improvements rather than rewriting or discarding them.
4. If a regression was introduced (e.g., accidental truncation or typecheck break), fix the specific error while retaining the intended features.

### Step 3: Verify All Platform Gates
Before declaring any task or checkpoint complete:
1. Rust engine unit tests: `cargo test` in `_core`, `crates/anf-vault`, and `windows/hook`.
2. TypeScript & Vite build: `npm test` and `npm run build` in `windows/`.
3. Multi-platform delivery rule: Follow `AF-Delivery-Requirements.md` (keep Windows `.exe` and Android `.apk` delivery aligned).
