# AnF — Gemini & Antigravity Guidelines

Refer to [AGENTS.md](./AGENTS.md) for full project rules, autonomous skill execution policies, and platform constraints.

Key directives:
1. **Autonomous Skill Execution**: Proactively execute matching skills from `.agents/skills/` and roles from `.agents/agency-agents/` without waiting for explicit prompt triggers.
2. **Codebase Navigation via Graphify**: Always check `graphify-out/graph.json` using `graphify query "<question>"` or `graphify path "<A>" "<B>"` before reading raw files. Run `graphify update .` after code edits.
3. **Ponytail Dev Standard**: Smallest complete change, zero speculative boilerplate, never skip tests or security.
4. **NotchBuddy Contracts**: Never rename pill IDs in `NotchBuddy/Sources/App/PillCatalog.swift`.
5. **App Store Preservation**: Never restyle existing shipped views in `main`.

## Storage
- **Clear superseded builds**: once a newer AnF build is installed and runs, remove the older build's files from the owner's devices so storage does not fill up. Keep the newest build, the source checkout, user data backups and signing keys. Details: `docs/BUILDER-RUNBOOK.md`, "Clearing superseded builds".
