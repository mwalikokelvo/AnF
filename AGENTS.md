# AnF Multi-Agent Development Standards

This document establishes operating standards for all autonomous AI coding agents (Antigravity, Cursor, Claude Code, Codex, DeepSeek Harness, OpenCode, Gemini CLI, Aider) working on the AnF codebase.

This repository (`AnF`) is configured with shared team agent skills, agency roles, and knowledge graphs in `.agents/` and `.cursor/skills/`. All AI coding assistants operating on this project MUST follow these instructions autonomously.

---

## 1. Autonomous Skill & Agent Execution (No Manual Callout)

**Do NOT wait for the developer to call out specific skills or slash commands.** The agent must automatically identify and apply matching skills and agents from `.agents/` and `.cursor/skills/`:

1. **Architecture & Code Navigation (Graphify)**:
   - For any question regarding code relationships, component structure, call flow, or data pathways, consult the knowledge graph:
     - Run `graphify query "<question>"` (or BFS search) before reading raw files.
     - Run `graphify path "<Source>" "<Target>"` for component relationships.
     - Run `graphify explain "<Node>"` for deep dives on classes/structs.
   - If `graphify-out/wiki/index.md` exists, navigate it before reading raw files.
   - After modifying code files in any session, run `graphify update .` to keep the AST graph current with zero token cost.
2. **Specialized Tasks**:
   - Check `.agents/skills/` and `.agents/agency-agents/` first before starting work on any task:
     - Code review / PR prep → `.agents/skills/code-review-and-quality`
     - Bug fixing / diagnostics → `.agents/skills/systematic-debugging`
     - New features / non-trivial changes → `.agents/skills/test-driven-development` and `.agents/skills/brainstorming`
     - Pre-merge checks → `.agents/skills/verification-before-completion`
     - Frontend / UI changes → `.agents/skills/frontend-ui-engineering`
     - Security / auth / secrets → `.agents/skills/security-and-hardening`
   - If a task matches a skill in `.agents/skills/` or `.cursor/skills/`, execute its procedures immediately without waiting for a prompt like `/skill-name`.

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
