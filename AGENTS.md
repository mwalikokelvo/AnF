# AnF Multi-Agent Development Standards

This document establishes mandatory operating standards for all developers and autonomous AI coding agents (Antigravity, Cursor, Claude Code, Codex, DeepSeek Harness, OpenCode, Gemini CLI, Aider) building on the AnF codebase.

This repository (`AnF`) is fully outfitted with shared team agent skills, agency roles, knowledge graphs, and MCP connectors in `.agents/` and `.cursor/`. **Anyone and any agent building our apps MUST actively utilize these skills, connectors, and agent roles.**

---

## 1. Mandatory Skills, Connectors & Agency Personas

**Do NOT wait for the developer to call out specific skills, slash commands, or roles.** Agents and developers must autonomously identify, adopt, and apply matching resources from `.agents/` and `.cursor/`:

### A. Core Skill Suites (In `.agents/skills/` and `.cursor/skills/`)
1. **Official Anthropic Suite**:
   - `mcp-builder`: Creating, authoring, and structuring custom Python/TypeScript MCP servers.
   - `claude-api`: Official prompt patterns, model capabilities, token budgeting, and tool use.
   - `pdf`, `docx`, `xlsx`, `pptx`: Complete extraction, generation, formula calculation, and document formatting.
   - `web-artifacts-builder`, `theme-factory`: Multi-component interactive React/Tailwind/shadcn HTML artifacts.
   - `algorithmic-art`, `canvas-design`: Generative visual workflows, SVG, and canvas rendering.
   - `webapp-testing`: Browser interaction, accessibility, and end-to-end verification.
   - `doc-coauthoring`, `internal-comms`: Technical specs, RFCs, change documentation, and status updates.
2. **Engineering Lifecycle Suite (Addy Osmani)**:
   - `spec-driven-development` & `api-and-interface-design`: Specifying interfaces, contracts, and types before writing implementation.
   - `test-driven-development`: Red-Green-Refactor cycle for non-trivial logic.
   - `browser-testing-with-devtools`: Automated real-browser assertions and console verification.
   - `code-review-and-quality`: Pre-commit/pre-PR automated quality audits.
   - `ci-cd-and-automation` & `shipping-and-launch`: Release workflows and pipelines.
3. **UI, Motion & Interaction Suite (Emil Kowalski)**:
   - `frontend-ui-engineering`, `design-taste-frontend`, `animate`, `gestures`, `animation-performance`: Smooth 60/120fps interactions, layout-shift-free UI, and native feel.
4. **Superpowers & Resilient Execution**:
   - `brainstorming`: Structured ideation before tackling complex feature work.
   - `systematic-debugging`: Root-cause tracing with reproducible test cases before proposing fixes.
   - `verification-before-completion`: Evidence-first verification before claiming any fix or feature is complete.
   - `dispatching-parallel-agents`: Delegating independent tasks to parallel subagents.

### B. Core MCP Connectors (In `.agents/mcp_config.json` and `.cursor/mcp.json`)
All agents must leverage the registered MCP tools:
- **`codebase-memory`**: Persistent AST dependency graph (`.codebase-memory/graph.db.zst`). Query symbols, relationships, and caller hierarchies across sessions.
- **`fetch`**: Live lookup of official third-party APIs, crates, packages, and RFC documentation.
- **`filesystem`**: Scoped workspace reads/writes with boundary safety.
- **`git`**: Checking status, diffs, branch isolation, and staging clean atomic increments.
- **`magic-ui`**: Component patterns and Tailwind styling catalog for rapid UI development.

### C. Agency Specialists & Department Personas (In `.cursor/skills/agency-agents/` and `.agents/agency-agents/`)
The repository contains 232 specialized domain personas. Whenever an agent or developer tackles a specific domain, they must adopt the corresponding persona:
- **Architecture**: `systems-architect.md`, `backend-architect.md`, `cloud-architect.md`
- **Frontend & UI/UX**: `ui-designer.md`, `frontend-specialist.md`, `accessibility-auditor.md`
- **Security & Infrastructure**: `security-auditor.md`, `devops-engineer.md`, `penetration-tester.md`
- **Quality & Delivery**: `qa-engineer.md`, `test-automator.md`, `release-manager.md`

### D. Codebase Navigation (Graphify)
- Run `graphify query "<question>"` before reading raw files.
- Run `graphify path "<Source>" "<Target>"` for component dependencies.
- Run `graphify explain "<Node>"` for symbol analysis.
- After code changes, run `graphify update .` to keep the graph current.

---

## 2. REA Reverse Engineering Standard (STRICT MANDATE)
- **NEVER SKIP REA**: For any application, library, feature, or protocol investigation (including when open source is available), agents MUST use REA (`rea` CLI 6.8.0 or REA MCP tools).
- **Target Analysis**:
  - For Electron/Desktop targets: unpack and inspect ASAR packages (`app.asar`), trace IPC handlers (`ipcMain.handle`, `ipcRenderer.invoke`), extract preload bridge interfaces, and extract clean CSS/design tokens.
  - For Native Binaries (PE, ELF, Mach-O): inspect exported symbol tables, imported libraries, section headers, string constants, and decompiled routines.
  - For Network & Audio Protocols: inspect request/response schemas, streaming endpoint signatures, and caching mechanisms.
- **Evidence-First Grounding**: All architectural choices, reverse-engineered workflows, and feature improvements must cite concrete extracted evidence from REA.

---

## 3. Multi-Agent Handover & Token Quota Protection
- **Check State First**: Read `HANDOFF.md` and `docs/BUILDUP-STATUS.md` before starting any task.
- **Clear superseded builds**: when a newer AnF build replaces an older one, remove the older build's files from the owner's devices so storage does not fill up. Keep the newest build, the source checkout, user data backups and signing keys. Details: `docs/BUILDER-RUNBOOK.md`, "Clearing superseded builds".
- **Continuous Buildup**: Never discard or overwrite working code from other partner agents. Inspect recent commits on `origin/` and continuation checkpoints.
- **Atomic Commits & Pushes**: Whenever approaching token quota limits, commit working increments with passing tests and push to `origin` immediately, appending details to `HANDOFF.md`.
- **No Build Collisions**: Do not run `cargo build` or `npm run pack` while another agent process is running; native target directories lock.

---

## 4. Core AnF Engineering Rules

1. **Ponytail — Lazy Senior Dev Mode**:
   - Solve the problem with the smallest complete change.
   - Reuse existing components, helpers, and CSS classes before writing new code.
   - No speculative abstractions, boilerplate wrappers, or "for later" features.
   - Never skip security, edge-case validation, tests, or explicit requirements.
2. **Stable Contracts & Pill Catalog**:
   - `NotchBuddy/Sources/App/PillCatalog.swift` is the **single source of truth** for all declared pills (workspace tools, agents, AI providers, services).
   - Every pill ID, color, category, and subtitle lives here.
   - Pill IDs are stable contract values (Keychain, UserDefaults, hook routing): **never rename an existing pill ID**.
3. **App Store View Preservation**:
   - Never restyle views that already ship in `main` (pills, cards, Settings, chat).
   - Existing views stay as they are in the App Store build. Change the visual style of an existing view only when explicitly requested.
   - `design/prototype/notch-buddy.html` and `design/captures/` are references for *new* work only.
4. **Platform Structure**:
   - **macOS Companion**: `NotchBuddy/` — Swift 6, SwiftUI + AppKit. Project generated via `project.yml` with XcodeGen (never edit `.xcodeproj` manually). Character drawn in code (`Canvas` + `TimelineView`), no Rive/Lottie.
   - **Windows / Linux**: `windows/` — Tauri v2 application (Rust in `src-tauri/`, TypeScript/Vite in `src/`, `coucou-hook` in `hook/`).
   - **Android**: `android/` workspace.
   - **Shared Styling**: `windows/src/workspace/anf-design.css`.
5. **Security & Performance**:
   - Secrets live in Keychain, never on disk or in git.
   - 0% CPU consumption when the notch / island is hidden.
   - Never block Claude Code or agent relays: if the app does not answer, the hook must exit immediately.
   - No telemetry. Network calls only to user-configured services.
   - **No Banned Services**: Spotify Connect is strictly prohibited. All music streaming uses decentralized, open-access providers (Audius, Subsonic/Navidrome, Internet Archive).

---

## 5. Quality Gates & Verification

Before reporting work complete or committing to main, verify all applicable gates:
```bash
# Windows Tauri
cd windows && npm run typecheck && npm test

# Contract & Style checks
node scripts/verify-contracts.mjs
node scripts/check-styles.mjs

# Knowledge graph refresh
graphify update .
```
