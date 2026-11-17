# AnF — the one rulebook for every assistant

Every developer and AI assistant (Claude Code, Codex, Antigravity, Gemini CLI, Cursor, Jules, Copilot, Hermes, DeepSeek, Grok, OpenCode, Aider) follows this file. `CLAUDE.md`, `GEMINI.md` and `.github/copilot-instructions.md` point here. Owner's engineering handoff of 17 Nov 2026 is folded in.

## 1. Start here

- Read `HANDOFF.md`, `docs/BUILDER-RUNBOOK.md` and `docs/BUILDUP-STATUS.md` before any task; append your result to `HANDOFF.md` when done.
- Check what others already did: continuation checkpoints in `continuations/` and recent branch heads (`claude/*`, `codex/*`, `integration/*`) on `origin`. Verify their tests and build forward from that state. Never discard or overwrite another assistant's working code.
- Kevo: read `docs/KEVO-PLAN.md`, `docs/KEVO-MAP.md` and `docs/kevo-autopilot/TEAM.md` first. Take only an issue assigned to you or an unclaimed `team:any` one. One brief step per pull request; nothing the brief does not name.

## 2. Where things are

- `windows/` — Tauri v2 app for Windows and Linux: Rust in `src-tauri/`, TypeScript/Vite in `src/`, the `coucou-hook` relay in `hook/`. Shared design: `windows/src/workspace/anf-design.css`. `windows/README.md` lists what differs from the Mac.
- `android/` — Android workspace. `crates/anf-vault/` — shared vault domain crate (pure Rust).
- `NotchBuddy/` — upstream macOS Coucou companion (Swift 6, SwiftUI + AppKit; XcodeGen `project.yml`, never edit the `.xcodeproj` by hand). Mochi, the notch character, is drawn in code (`Canvas` + `TimelineView`), no Rive/Lottie/images.
- `NotchBuddy/Sources/App/PillCatalog.swift` — single source of truth for every pill (ID, colour, category, subtitle).
- `docs/SPEC.md`, `docs/INTEGRATIONS.md` (French) — behaviour and integrations. `design/prototype/notch-buddy.html`, `design/captures/` — references for new work only.
- Visible branding is AnF; legacy identifiers and storage/cryptographic names (`coucou.db`, "Coucou SQLCipher vault", bundle id `fr.louisraille.NotchBuddy`) stay stable so updates keep working.

## 3. Branches and merging

- **`main` is locked** (owner, 16 Nov 2026): never push to it, never force-push. Branch, open a pull request, merge only with green checks and a review by an assistant that did not write it. Never merge your own pull request, except the Kevo autopilot under `docs/kevo-autopilot/AUTOPILOT.md`.
- Branch prefixes: `claude/`, `codex/`, `hermes/`, `agy/` (Antigravity/Gemini), `cursor/` or `grok/`, `copilot/`, `jules/`, `integration/`.
- Commit working increments with passing tests and push before you run out of quota; write what is left in `HANDOFF.md`.
- Do not run `cargo build` or `npm run pack` while another assistant's build runs on the same machine: target folders lock.

## 4. Who works where

| Assistant | Prefix | Good for | Hard limit |
|---|---|---|---|
| Hermes (free, local) | `hermes/` | Docs, test scaffolds, simplification scripts, crate-level `cargo check` | Never a full workspace build on the 8 GB PC |
| Antigravity / Gemini | `agy/` | UI components (Kevo float HUD), fixtures, artifact checks | One Rust build on the PC at a time |
| Claude Code | `claude/` | Plans, Rust lifetimes, SQLCipher migrations, UniFFI boundaries, reviews, Kevo autopilot | Hand pre-PR checks to `.claude/agents/verifier.md` |
| Cursor / Grok (cloud) | `cursor/`, `grok/` | Large refactors, full Linux test and benchmark runs | 2 tries per failure |
| Codex (cloud) | `codex/` | Rust, CI, packaging; reviews every pull request | Never merges its own |
| Jules (cloud) | `jules/` | TypeScript, UI, tests, phrase list, scripts | Kevo board issues only |
| Copilot (GitHub) | `copilot/` | Bounded fixes from `.github/ISSUE_TEMPLATE/copilot-task.md` | No open-ended features: named files and a test command |

- **Two strikes**: if a build, test or speed check fails twice on the same thing, stop, leave the branch and write down what failed instead of retrying.
- **Reviews**: Copilot may do a first pass automatically; `@claude` reviews only when mentioned. A review comment never triggers an automatic commit, and bots never answer bots (workflows filter `!endsWith(github.actor, '[bot]')`).

## 5. Engineering rules

1. **Ponytail**: the smallest complete change. Reuse existing components, helpers and CSS classes first. No speculative abstractions, wrappers or "for later" features. Never skip security, edge cases, tests or stated requirements.
2. **Dependencies**: no new C or native libraries that break Linux CI, `windows.yml` or Android builds. Rust networking uses `rustls` (`reqwest` with `rustls-tls`; never `native-tls`). The vault stays on SQLCipher (AES-256) via `rusqlite`'s `bundled-sqlcipher-vendored-openssl`, which compiles its crypto from source on every target; do not change the cipher or key format, which would strand existing vaults.
3. **No telemetry**: no analytics or tracking SDKs, no silent callbacks. Network calls only to services the owner configured. Spotify Connect is banned; music uses open providers (Audius, Subsonic/Navidrome, Internet Archive) and the embedded Spotube integration as built.
4. **Push, not polling**: no `setInterval`, `requestAnimationFrame` state loops or `tokio::time::sleep` loops to watch backend, audio or sync state. Use Tauri events (`app.emit` / `listen`), Tauri Channels for streaming audio and transcription, or file/SQLite write hooks. Animation frames are fine for drawing, not for checking state. 0 % CPU when the island or HUD is hidden.
5. **Replace in place**: no `*_v2` copies, compatibility shims or `#[allow(dead_code)]` kept "for later". Fix broken code where it is, update every caller in the same commit, delete what is unused. `crates/anf-vault` must pass `cargo clippy --all-targets -- -D warnings` (CI checks it); new Rust in `windows/src-tauri` must add no clippy warnings.
6. **Stable contracts**: never rename a pill ID (Keychain, UserDefaults, hook routing). Keep the bundle identifier.
7. **Shipped views stay as they are**: never restyle pills, cards, Settings or chat unless the owner asks. New views follow the existing style.
8. **Secrets** live in the OS credential store (Keychain / Windows Credential Manager), never on disk or in git. Never commit personal voice recordings beyond the pack the owner approved, signing keys or backups.
9. **Never block an agent**: if the app does not answer, the hook exits at once. Never overwrite `~/.claude/settings.json` (dated backup, merge, show the diff, write after the owner confirms). Never send an email or approve a Claude Code or Codex permission without an explicit click.
10. **Typed actions**: Kevo acts through deterministic Rust commands (vault search, notes, audio studio, P2P), not by clicking through the OS accessibility tree. A risky action (send to another device, delete, run a script) waits for Approve/Deny or a spoken "yes"/"cancel".

## 6. Speed budgets

Checked by tests where the code exists; a pull request that touches the path keeps its test green.

| Path | Budget | Test |
|---|---|---|
| Vault FTS5 search, 2,000 projects | < 50 ms p95 | `vault::tests::fts5_search_p95_under_50ms` |
| Tauri IPC command round trip | < 100 ms | not yet measured |
| Kevo wake word, barge-in stop, first audio of local speech | < 300 ms | Kevo Phase 1 self-test (`docs/KEVO-PLAN.md`) |
| Kevo command reply starts / AI answer starts | < 1.5 s / < 5 s | Kevo self-test |

## 7. Skills, tools and specialists

- Use the installed skills in `.agents/skills/` and `.cursor/skills/` without being asked: engineering lifecycle (spec, interface design, test-driven development, code review), UI and motion, systematic debugging, verification before completion, parallel agents. If none fits, `skills find <query>`. Keep them current with `skills update -g`.
- MCP servers in `.agents/mcp_config.json` / `.cursor/mcp.json`: `codebase-memory` (symbol and caller graph), `fetch`, `filesystem`, `git`, `magic-ui`.
- Adopt the matching specialist persona from `.agents/agency-agents/` or `.cursor/skills/agency-agents/` (architecture, UI, security, QA, release).
- Navigation: `graphify query "<question>"`, `graphify path "<A>" "<B>"`, `graphify explain "<node>"` before reading raw files; `graphify update .` after code changes.
- Subagents: one per independent problem. The controller reviews the result, runs the tests and makes the commit.
- **REA (owner's mandate)**: for any app, library, feature or protocol investigation, even with source available, use REA (`rea` CLI 6.8.0 or REA MCP): ASAR archives and IPC handlers for Electron, symbol tables and strings for native binaries, request/response shapes for network and audio protocols. Ground decisions in the extracted evidence.

## 8. Checks before a pull request

```bash
node scripts/check-release.mjs                     # repo root
node scripts/verify-contracts.mjs && node scripts/check-styles.mjs
cd windows && npm ci && npx tsc --noEmit && npm test
cd windows && npm run build && cd src-tauri && cargo test --lib   # Linux needs the apt packages in BUILDER-RUNBOOK.md
cargo clippy --manifest-path crates/anf-vault/Cargo.toml --all-targets -- -D warnings
graphify update .
```

Claude Code hands these to the `verifier` agent. Say exactly what was tested: "compiled", "automated tests", "browser fixture", "audio test" and "installed on the PC" are different claims. `#[cfg(windows)]` code is compiled only by the GitHub `Windows` workflow.

## 9. Delivery

- Complete authorized build and verification work without asking again for confirmation; when outside access blocks it, name the exact missing dependency.
- Release reports lead with working download links and correct platform/version labels. A review build is not a verified release.
- Once a newer build is installed and runs, clear the older build's files from the owner's devices (`docs/BUILDER-RUNBOOK.md`, "Clearing superseded builds"). Keep the newest build, the source checkout, user data backups and signing keys.
- After a release, report it back to the primary AnF conversation.
