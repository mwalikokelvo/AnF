# AnF — guide for AI coding agents

AnF includes an Android workspace (`android/`) and a Windows/Linux Tauri workspace (`windows/src/workspace/`). Their shared design is in `windows/src/workspace/anf-design.css`; visible branding is AnF. Both Android application identities and origins, Windows installation records, and legacy storage/cryptographic constants must remain compatible with their actual baselines (see docs/IDENTITY-MIGRATION.md). Changing branding does not authorize changing those identities or signing keys. The upstream Coucou companion is a native macOS app (`NotchBuddy/`); `windows/` is the Tauri version for Windows and Linux. Mochi, a small animated character living in the MacBook notch, shows AI coding agent sessions (Claude Code, Gemini CLI, Antigravity and more) and a few integrations, and lets the user approve, answer, chat and drop files from the notch.

## Where things are
- `NotchBuddy/Sources/App/` — all Swift code. `NotchBuddy/Resources/sounds/` — the 28 WAV sounds. `NotchBuddy/project.yml` — XcodeGen project (never edit the `.xcodeproj` by hand).
- `NotchBuddy/Sources/App/PillCatalog.swift` — single source of truth for all declared pills (workspace tools, agents, AI providers, services). Every pill ID, color, category and subtitle lives here.
- `docs/SPEC.md`, `docs/INTEGRATIONS.md` — behaviour, views, states, integrations (in French).
- `design/prototype/notch-buddy.html` — original prototype, the visual source of truth. `design/captures/` — target screenshots.
- `windows/` — the Tauri app for Windows and Linux: Rust in `src-tauri/`, TypeScript in `src/`, the `anf-hook` relay in `hook/`. `windows/README.md` lists what differs from the Mac.
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

- Start here: read `docs/BUILDER-RUNBOOK.md` and `HANDOFF.md` before any work (shared build/test/delivery recipe and state); append your result to `HANDOFF.md` when done.
- Multi-LLM Buildup Protocol: Always inspect existing continuation checkpoints in `continuations/` and recent branch heads (`claude/*`, `codex/*`, `integration/*`) before beginning new work. Identify what previous agents completed, verify their tests and commits, reconcile any pending improvements or fixes, and build continuously forward from that verified state rather than starting over or overwriting previous work.

## Skills (all assistants)
- Shared skills live in `.agents/skills/` (Superpowers, see `SOURCE.md`) and in each user's `~/.agents/skills/` (Antigravity reads it via `~/.gemini/config/skills.json`).
- Before specialized work (a framework, external service, design system, code review), check installed skills first. If none fits, use `find-skills` (or `skills find <query>`) to search skills.sh, and suggest or install the match.
- Skip the search for routine edits and tasks that installed skills already cover.
- Default working style is Ponytail: the smallest complete change. Reuse first, no speculative abstractions, never skip validation, security or tests for non-trivial logic.
- Solve issues by dispatching one subagent per independent problem. The controller reviews the result, runs the tests, and makes the commit. Do not start the app over.
- Keep skills current with `skills update -g`. After a release is built, report the final release (links, platforms, exact version) back to the primary AnF conversation.
