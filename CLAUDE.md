# AnF — guide for AI coding agents

AnF includes an Android workspace (`android/`) and a Windows/Linux Tauri workspace (`windows/src/workspace/`). Their shared design is in `windows/src/workspace/anf-design.css`; visible branding is AnF, but legacy identifiers and storage/cryptographic names must stay stable for updates. The upstream Coucou companion is a native macOS app (`NotchBuddy/`); `windows/` is the Tauri version for Windows and Linux. Mochi, a small animated character living in the MacBook notch, shows AI coding agent sessions (Claude Code, Gemini CLI, Antigravity and more) and a few integrations, and lets the user approve, answer, chat and drop files from the notch.

## Where things are
- `NotchBuddy/Sources/App/` — all Swift code. `NotchBuddy/Resources/sounds/` — the 28 WAV sounds. `NotchBuddy/project.yml` — XcodeGen project (never edit the `.xcodeproj` by hand).
- `NotchBuddy/Sources/App/PillCatalog.swift` — single source of truth for all declared pills (workspace tools, agents, AI providers, services). Every pill ID, color, category and subtitle lives here.
- `docs/SPEC.md`, `docs/INTEGRATIONS.md` — behaviour, views, states, integrations (in French).
- `design/prototype/notch-buddy.html` — original prototype, the visual source of truth. `design/captures/` — target screenshots.
- `windows/` — the Tauri app for Windows and Linux: Rust in `src-tauri/`, TypeScript in `src/`, the `coucou-hook` relay in `hook/`. `windows/README.md` lists what differs from the Mac.
- `docs/*.html` — the GitHub Pages site (privacy, terms, support, legal notice).

## Build
```
cd NotchBuddy && xcodegen && xcodebuild -scheme NotchBuddy -configuration Debug build
```
Windows and Linux: `cd windows && npm install && npm run tauri dev`

## Rules
- Delivery preference: complete authorized build and verification work without repeated confirmation requests. Report the exact remaining dependency when external access prevents completion.
- Release requests should lead with usable download links and accurate platform/version labels. Distinguish installed verification from compilation and browser fixtures; do not describe a review build as a verified functioning release.
- Keep progress updates concise and carry valid saved work forward. Follow the user's attached delivery/communication guidance using the capabilities actually available in the session.
- Swift 6, SwiftUI + AppKit. No third-party dependencies unless truly unavoidable. The character is drawn in code (`Canvas` + `TimelineView`), no Rive/Lottie/images.
- Secrets live in the Keychain, never on disk or in git.
- No telemetry. Network calls only to services the user configured.
- Never block Claude Code: if the app doesn't answer, the hook exits immediately.
- Never overwrite `~/.claude/settings.json`: dated backup, merge, show the diff, write only after the user confirms.
- Never send an email or approve a Claude Code or Codex permission without an explicit click.
- Performance: 0 % CPU when the island is hidden.
- Keep the bundle identifier `fr.louisraille.NotchBuddy` (Keychain items, preferences and permissions depend on it).
- Never restyle what already ships (pills, cards, Settings, chat…): existing views stay exactly as they are in `main`, which is the App Store build. Change the look of an existing view only when explicitly asked.
- Pill IDs are stable contract values (Keychain, UserDefaults, hook routing): never rename an existing pill ID.
- New views follow the existing app style. `design/prototype/notch-buddy.html` and `design/captures/` are references for new work, not a reason to change existing views.

- Storage: once a newer build is installed and runs, clear the older build's files from the owner's devices (see `docs/BUILDER-RUNBOOK.md`, "Clearing superseded builds"). Keep the newest build, the source checkout, user data backups and signing keys.
- Start here: read `docs/BUILDER-RUNBOOK.md` and `HANDOFF.md` before any work (shared build/test/delivery recipe and state); append your result to `HANDOFF.md` when done.
- Multi-LLM Buildup Protocol: Always inspect existing continuation checkpoints in `continuations/` and recent branch heads (`claude/*`, `codex/*`, `integration/*`) before beginning new work. Identify what previous agents completed, verify their tests and commits, reconcile any pending improvements or fixes, and build continuously forward from that verified state rather than starting over or overwriting previous work.
- REA Policy (MANDATORY FOR ALL AGENTS): NEVER SKIP REA. For any feature, architecture, or app investigation (even when source code is available), run REA tools (`rea` CLI 6.8.0 / REA MCP) to inspect binary structures, Electron ASAR archives, symbol tables, IPC channels, and network protocols. Concrete extracted evidence must ground all architectural decisions and implementations. No agent is permitted to skip REA.

## Skills, Connectors & Agency Roles (MANDATORY FOR ALL BUILDERS)
- **Active Skills**: All assistants must actively apply installed skills in `.agents/skills/` and `.cursor/skills/`:
  - **Anthropic Suite**: `mcp-builder`, `claude-api`, `pdf`, `docx`, `xlsx`, `pptx`, `web-artifacts-builder`, `theme-factory`, `webapp-testing`.
  - **Engineering Lifecycle**: `spec-driven-development`, `api-and-interface-design`, `test-driven-development`, `code-review-and-quality`, `browser-testing-with-devtools`.
  - **UI/UX & Motion**: `frontend-ui-engineering`, `design-taste-frontend`, `animate`, `gestures`.
  - **Superpowers**: `brainstorming`, `systematic-debugging`, `verification-before-completion`, `dispatching-parallel-agents`.
- **MCP Connectors**: Use registered MCP servers in `.agents/mcp_config.json` (`codebase-memory`, `fetch`, `filesystem`, `git`, `magic-ui`). Query `codebase-memory` for persistent symbol/dependency context.
- **Agency Specialists**: Adopt domain specialist personas in `.cursor/skills/agency-agents/` and `.agents/agency-agents/` (e.g. `systems-architect`, `ui-designer`, `security-auditor`, `qa-engineer`) when tackling relevant work.
- **Before specialized work**: check installed skills first. If none fits, search with `skills find <query>`.
- **Working style**: Ponytail mode — the smallest complete change. Reuse first, no speculative abstractions, never skip validation, security, or tests.
- **Subagents**: Solve complex issues by dispatching one subagent per independent problem. The controller reviews the result, runs the tests, and makes the commit. Do not start the app over.
- Keep skills current with `skills update -g`. After a release is built, report the final release back to the primary AnF conversation.
