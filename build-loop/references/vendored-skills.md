# Bundled third-party skills — when the loop uses them

`vendor/` holds 59 skills from six projects, unchanged, one Markdown bundle per project (full list: `vendor/CATALOG.md`; licences: `vendor/LICENSES.md`). They are tools the loop picks up at a phase, not separate workflows that replace it.

## How to use one

1. Find it in the table below or in `vendor/CATALOG.md`.
2. Read it: `python3 scripts/vendor.py <source> <skill>/SKILL.md`. Its own `references/` files are read the same way (`--list <source>` shows every path).
3. If it needs its scripts on disk, or the user wants it installed natively: `python3 scripts/vendor.py --export <dir> --source <source> --skill <skill>` (e.g. `<dir>` = `~/.claude/skills`). Export never overwrites unless `--force`.
4. Follow it inside the current phase, then carry on with the loop.

**Precedence:** project rules → build-loop (especially §8, permissions) → the bundled skill. When a bundled skill says "ask the user", treat it as build-loop does: decide and log it under "Decisions made without asking", unless §8 lists the action as one to leave to its owner. A bundled skill never grants a permission §8 withholds (merging to main, publishing, deploying, paid runs at scale, touching real user data).

Installing a tool a bundled skill needs (`uv tool install`, `pipx install`, `npx`) is a reasonable dependency in a sandbox or CI. On the user's own machine, or when it costs money, list the command in the report instead. Prefer package-manager installs over `curl … | bash`.

## By phase

| Phase | Bundled skill | Use it to… |
|---|---|---|
| §1 catch up | `claude-mem standup` | compare other agents' branches/worktrees/PRs and get one consolidation plan (fits multi-agent projects) |
| §1 catch up | `claude-mem learn-codebase`, `pathfinder`, `smart-explore` | learn an unfamiliar repo; map features into flowcharts; AST-level search without reading whole files |
| §1 catch up | `claude-mem mem-search`, `timeline-report` | search past sessions — only when the claude-mem plugin and worker are installed |
| §2–4 spec/plan | `claude-mem make-plan`, `design-is` | phased plan with docs discovery; audit a UI against Rams' principles |
| §2–4 spec/plan | `anthropic-skills doc-coauthoring` | specs, ADRs, proposals written with the user |
| §5 build | `claude-mem do` | execute a phased plan through subagents (staff them from `agents/`) |
| §5 build | `anthropic-skills frontend-design`, `theme-factory`, `web-artifacts-builder`, `canvas-design`, `algorithmic-art` | UI direction and visual work; `brand-guidelines` is Anthropic's own brand — never use it for the user's products |
| §5 build | `anthropic-skills mcp-builder`, `claude-api`, `skill-creator` | build an MCP server, call the Claude API, write or improve a skill |
| §5 build | `fish-audio` (3 skills) | speech, voices, transcription in an app → `references/voice.md` |
| §5 build | `reverse-api-engineer`, `rea` | client for a private API, analysis of a binary/package → `references/reverse-engineering.md` |
| §6 review / §7 verify | `anthropic-skills webapp-testing` | drive a local web app with Playwright, screenshots, console logs |
| §6 review / §7 verify | `strix` (9 skills) | security testing of code, API or running app → `references/security.md` (Strix section) |
| §7 ship | `strix ci-security-scanning-with-strix` | add a security scan to CI |
| §7 ship | `claude-mem babysit` | watch a PR until merge-ready (fix review comments and CI); stop before merging main unless §8 allows |
| §7 ship | `claude-mem childhood`, `version-bump`, `release` | verify a release after publishing; bump versions — the publish step itself follows §8 |
| §10 handoff | `claude-mem handoff` | a fresh-session HANDOFF.md; the project's own handoff format (`references/git-and-ship.md`) wins |
| any | `claude-mem what-the`, `oh-my-issues`, `owner-goals`, `request-progress` | plain-English explanations; cluster an issue backlog; map what the owner wants |
| any | `anthropic-skills internal-comms`, `slack-gif-creator`, `discernment-nudge`, `academy-guide` | status notes and announcements; GIFs; help the user weigh an answer; Claude how-tos |

`claude-mem` skills that manage the claude-mem service itself (`backup-setup`, `cloud-sync`, `mode-creator`, `knowledge-agent`, `ccs-align`, `screenpipe`, `agent-cost-report`, `weekly-digests`, `wowerpoint`, `build`, `build-and-release`, `how-it-works`) need claude-mem installed: `npx claude-mem install` (its installer asks for a sign-in and starts a hosted trial; `--provider` or `CLAUDE_MEM_ONLINE_OPTIN=false` skips that — it's the user's choice, so list the command rather than run it on their machine). `build` and `build-and-release` are claude-mem's own loops — inside build-loop, use its parts (`make-plan`, `do`, `babysit`) instead.

## Not bundled

- `docx`, `pdf`, `pptx`, `xlsx` from anthropics/skills: all rights reserved, and already built into Claude.
- Binary files: 54 fonts used by `canvas-design`, a sample PDF and a `.gz` archive (each bundle's header lists them). `canvas-design` expects them in `./canvas-fonts`; use installed or freely licensed fonts instead.
- FreeLLMAPI is an app, not a skill → `references/ai-providers.md`.
- The Fish Audio connector itself (`https://api.fish.audio/mcp`) and plugin manifests: connect the connector in the app.

## Updating a bundle

Re-clone the upstream repo, re-run the packer the same way (one `vendor/<source>.md`, unchanged file contents between `<!-- vendor-file: path -->` and `<!-- /vendor-file -->` markers, header with commit and licence), regenerate `vendor/CATALOG.md`, and check the round trip: `vendor.py --export` output must match upstream byte for byte. Re-check the skill's limits before uploading (file count, size, description length).
