---
trigger: always_on
description: Proactively apply matching skills, MCP connectors, and agency roles in AnF without waiting for manual invocation.
---

## Autonomous Skill, Connector, and Agency Usage

In AnF:
- **Zero-Prompting Execution**: Do not wait for the developer to call out specific skills. Autonomously leverage:
  - **Anthropic Suite**: `mcp-builder` (MCP development), `claude-api` (prompting/API integration), `pdf`/`docx`/`xlsx`/`pptx` (document tasks), `web-artifacts-builder` & `theme-factory` (UI previews), `webapp-testing` (browser verification).
  - **Engineering Lifecycle**: `spec-driven-development`, `api-and-interface-design`, `test-driven-development`, `code-review-and-quality`, `browser-testing-with-devtools`.
  - **UI & Motion**: `frontend-ui-engineering`, `design-taste-frontend`, `animate`, `gestures`.
  - **Superpowers**: `brainstorming`, `systematic-debugging`, `verification-before-completion`, `dispatching-parallel-agents`.
  - **MCP Connectors**: `codebase-memory` (persistent knowledge graph), `fetch` (docs & schemas), `filesystem` (safe I/O), `git` (atomic commits), `magic-ui` (UI components).
  - **Agency Specialists**: Adopt domain roles in `.cursor/skills/agency-agents/` and `.agents/agency-agents/` (e.g. `systems-architect`, `ui-designer`, `security-auditor`, `qa-engineer`).
  - **Architecture Questions**: Run `graphify query "<question>"`.
- **AnF Invariants**:
  - `NotchBuddy/Sources/App/PillCatalog.swift` is the source of truth for pills. Never rename pill IDs.
  - Never restyle views currently in production / App Store.
  - Keep 0% CPU footprint when NotchBuddy / Mochi island is hidden.
  - Follow Ponytail mode: smallest complete working diff, reuse first.
