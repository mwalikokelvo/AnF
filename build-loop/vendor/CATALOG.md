# Bundled skills catalog

Every third-party skill bundled into build-loop, unchanged. Print one with `python3 scripts/vendor.py <source> <path>`; restore originals with `python3 scripts/vendor.py --export <dir> [--source <source>] [--skill <folder>]`. When and how build-loop uses each is in `references/vendored-skills.md`. Licences: `vendor/LICENSES.md`.

## reverse-api-engineer — 1 skills (MIT)

| skill | read | what it does |
|---|---|---|
| `reverse-api-engineer` | `vendor.py reverse-api-engineer reverse-api-engineer/SKILL.md` | Reverse engineer a website's private HTTP API into a typed, runnable client (Python, TypeScript, Go and 7 more) with the reverse-api-engineer CLI. A browser performs… |

## rea — 1 skills (MIT)

| skill | read | what it does |
|---|---|---|
| `reverse-engineer-anything` | `vendor.py rea reverse-engineer-anything/SKILL.md` | Reverse engineer native, managed, Electron/JavaScript, packaged, firmware, and browser targets with REA, and build agent environments (AgentEnv bundles) of web… |

## strix — 9 skills (Apache-2.0)

| skill | read | what it does |
|---|---|---|
| `api-security-testing` | `vendor.py strix api-security-testing/SKILL.md` | Security-test a REST, GraphQL, or gRPC API with Strix — autonomous agents that enumerate endpoints from an OpenAPI/GraphQL schema (or by crawling), then actually… |
| `application-security-testing` | `vendor.py strix application-security-testing/SKILL.md` | Application security testing (AppSec) across a whole product with Strix — decide which asset needs which test (source code, running web app, API, CI pipeline), run it,… |
| `ci-security-scanning-with-strix` | `vendor.py strix ci-security-scanning-with-strix/SKILL.md` | Add security scanning to CI/CD with Strix — GitHub Actions, GitLab CI, or any pipeline — so every pull request gets a diff-scoped AI pentest that blocks vulnerable code… |
| `find-security-vulnerabilities-in-code` | `vendor.py strix find-security-vulnerabilities-in-code/SKILL.md` | Find security vulnerabilities in a codebase or repository with Strix — a white-box AI security review that reads your source, reasons about the actual data flow and… |
| `fix-security-vulnerabilities-with-strix` | `vendor.py strix fix-security-vulnerabilities-with-strix/SKILL.md` | Fix security vulnerabilities found by a Strix pentest (open-source CLI or app.strix.ai cloud) — triage by severity, patch the root cause rather than the symptom, and… |
| `managed-pentesting-with-strix` | `vendor.py strix managed-pentesting-with-strix/SKILL.md` | Run a managed pentest of a web app, API, repository, or local workspace on the app.strix.ai platform with the `strix cloud` CLI or REST API — no local Docker or LLM key… |
| `owasp-top-10-testing` | `vendor.py strix owasp-top-10-testing/SKILL.md` | Test an application against the OWASP Top 10 with Strix — autonomous AI agents that attempt real exploits for each category of the current OWASP Top 10:2025 (broken… |
| `penetration-testing-with-strix` | `vendor.py strix penetration-testing-with-strix/SKILL.md` | Pentest a web app, API, codebase, repository, URL, domain, or IP with Strix — autonomous AI penetration testing that exploits and proves vulnerabilities (OWASP Top 10… |
| `web-app-penetration-testing` | `vendor.py strix web-app-penetration-testing/SKILL.md` | Pentest a web app or website end to end — black-box testing of a live URL, staging environment, or local dev server that finds and exploits real vulnerabilities (auth… |

## fish-audio — 3 skills (MIT)

| skill | read | what it does |
|---|---|---|
| `skills/fish-audio` | `vendor.py fish-audio skills/fish-audio/SKILL.md` | Use the Fish Audio connector to turn text into lifelike speech, find or clone voices, transcribe recordings, produce multi-speaker audiobooks and podcasts in Story… |
| `skills/fish-audio-api` | `vendor.py fish-audio skills/fish-audio-api/SKILL.md` | Write direct HTTP / WebSocket calls to the Fish Audio platform (TTS, ASR, voice design, voice models, wallet, real-time TTS streaming) without depending on the Python… |
| `skills/fish-audio-sdk` | `vendor.py fish-audio skills/fish-audio-sdk/SKILL.md` | Write code with the official Fish Audio SDKs, Python (`fishaudio`, PyPI `fish-audio-sdk`) and JavaScript/TypeScript (`fish-audio`). Use when the user wants… |

## claude-mem — 30 skills (Apache-2.0)

| skill | read | what it does |
|---|---|---|
| `agent-cost-report` | `vendor.py claude-mem agent-cost-report/SKILL.md` | Believable agent cost report for any period, default the last 7 full days PT, not counting today. Measured tokens from Claude Code transcripts priced at OpenRouter list… |
| `babysit` | `vendor.py claude-mem babysit/SKILL.md` | Watch a pull request or review cycle until it is ready to merge. Use when asked to babysit, monitor, or keep checking PR comments, reviews, and CI until all actionable… |
| `backup-setup` | `vendor.py claude-mem backup-setup/SKILL.md` | Set up, check, or restore local claude-mem database snapshots. Use when the user says "set up backups", "back up my memories", "backup status", or "restore my database". |
| `build` | `vendor.py claude-mem build/SKILL.md` | Fully automate a coding task with make-plan, do, and babysit. |
| `build-and-release` | `vendor.py claude-mem build-and-release/SKILL.md` | Fully automate building and releasing a coding task. |
| `ccs-align` | `vendor.py claude-mem ccs-align/SKILL.md` | Run the CCS Align seat's hourly breathing cycle — prove the local claude-mem worker is healthy, pull needle observations through search → timeline → get_observations,… |
| `childhood` | `vendor.py claude-mem childhood/SKILL.md` | Babysit a shipped release after merge, publication, or deployment. Verify published packages, production behavior, installed plugins, and late CI or user reports until… |
| `cloud-sync` | `vendor.py claude-mem cloud-sync/SKILL.md` | Set up or check claude-mem cloud sync with cmem.ai Pro. Use when the user says "set up cloud sync", "sync my memories", "cmem pro", "cloud backup", "sync status", or… |
| `design-is` | `vendor.py claude-mem design-is/SKILL.md` | Audit a design against Dieter Rams' ten "Good design is..." principles, then hand off a /make-plan prompt for one of three outcomes — new design, refine design, or… |
| `do` | `vendor.py claude-mem do/SKILL.md` | Execute a phased implementation plan using subagents. Use when asked to execute, run, or carry out a plan — especially one created by make-plan. |
| `handoff` | `vendor.py claude-mem handoff/SKILL.md` | Generate a HANDOFF.md that captures goal, current state, files touched, failed attempts, and next steps — so a fresh Claude session can continue exactly where this one… |
| `how-it-works` | `vendor.py claude-mem how-it-works/SKILL.md` | Explain how claude-mem captures observations, when memory injection kicks in, and where data lives. Use when the user asks "how does claude-mem work?" or "what is this… |
| `knowledge-agent` | `vendor.py claude-mem knowledge-agent/SKILL.md` | Build and query AI-powered knowledge bases from claude-mem observations. Use when users want to create focused "brains" from their observation history, ask questions… |
| `learn-codebase` | `vendor.py claude-mem learn-codebase/SKILL.md` | Prime a codebase by reading every source file in full. Use when starting work on a new or unfamiliar project, or when the user asks to "learn the codebase", "read the… |
| `make-plan` | `vendor.py claude-mem make-plan/SKILL.md` | Create a detailed, phased implementation plan with documentation discovery. Use when asked to plan a feature, task, or multi-step implementation — especially before… |
| `mem-search` | `vendor.py claude-mem mem-search/SKILL.md` | Smart search (default). Search claude-mem's persistent cross-session memory database in three steps: search, timeline, then selected get_observations. Use when user… |
| `mode-creator` | `vendor.py claude-mem mode-creator/SKILL.md` | Interactively create, install, activate, and verify custom claude-mem modes, including domain-specific observation types, concept tags, optional Telegram alerts, bot… |
| `oh-my-issues` | `vendor.py claude-mem oh-my-issues/SKILL.md` | Cluster a GitHub issue backlog by root cause into a small set of plan-master issues, redirect children with a standardized comment, and bundle architectural-fix PRs… |
| `owner-goals` | `vendor.py claude-mem owner-goals/SKILL.md` | Map what the owner wants from the prompts they typed themselves (prompts an agent wrote are left out), then sort it into focus areas, asks and rules, each with dated… |
| `pathfinder` | `vendor.py claude-mem pathfinder/SKILL.md` | Map a codebase into feature-grouped flowcharts, identify duplicated concerns across features, and propose a unified architecture. Use when asked to "find the ideal… |
| `release` | `vendor.py claude-mem release/SKILL.md` | Fully automate a release with version-bump and childhood. |
| `request-progress` | `vendor.py claude-mem request-progress/SKILL.md` | Group recent conversations into overall requests, review each one's progress from memory, sort each into one of the owner's focus areas, and write the build story, so… |
| `screenpipe` | `vendor.py claude-mem screenpipe/SKILL.md` | Search screen and audio history recorded by Screenpipe and optionally save selected context into claude-mem. Use when the user asks to recall desktop activity, a… |
| `smart-explore` | `vendor.py claude-mem smart-explore/SKILL.md` | Token-optimized structural code search using tree-sitter AST parsing. Use instead of reading full files when you need to understand code structure, find functions, or… |
| `standup` | `vendor.py claude-mem standup/SKILL.md` | Facilitate a read-only standup across git worktrees, branches, or PRs to compare changes and produce one consolidation plan. |
| `timeline-report` | `vendor.py claude-mem timeline-report/SKILL.md` | Generate a "Journey Into [Project]" narrative report analyzing a project's entire development history from claude-mem's timeline. Use when asked for a timeline report,… |
| `version-bump` | `vendor.py claude-mem version-bump/SKILL.md` | Automated semantic versioning and release workflow for Claude Code plugins. Handles version increments across package.json, marketplace.json, plugin.json manifests,… |
| `weekly-digests` | `vendor.py claude-mem weekly-digests/SKILL.md` | Generate a serial week-by-week narrative digest of a project's full claude-mem timeline. Splits the timeline into per-ISO-week files, then runs one consecutive subagent… |
| `what-the` | `vendor.py claude-mem what-the/SKILL.md` | What the? Use when the user wants a plain-English breakdown of something technical — the who, what, where, why, and when. |
| `wowerpoint` | `vendor.py claude-mem wowerpoint/SKILL.md` | Turn one document into a kawaii NotebookLM slide deck. Use for "wowerpoint this", "make a deck about <file>", "turn this report into slides", or any request to render a… |

## anthropic-skills — 15 skills (Apache-2.0 (per-skill LICENSE.txt))

| skill | read | what it does |
|---|---|---|
| `academy-guide` | `vendor.py anthropic-skills academy-guide/SKILL.md` | Stop and check this skill before finishing any reply to a question about how to use Claude or a Claude product — it recommends matching courses, tutorials, and use… |
| `algorithmic-art` | `vendor.py anthropic-skills algorithmic-art/SKILL.md` | Creating algorithmic art using p5.js with seeded randomness and interactive parameter exploration. Use this when users request creating art using code, generative art,… |
| `brand-guidelines` | `vendor.py anthropic-skills brand-guidelines/SKILL.md` | Applies Anthropic's official brand colors and typography to any sort of artifact that may benefit from having Anthropic's look-and-feel. Use it when brand colors or… |
| `canvas-design` | `vendor.py anthropic-skills canvas-design/SKILL.md` | Create beautiful visual art in .png and .pdf documents using design philosophy. You should use this skill when the user asks to create a poster, piece of art, design,… |
| `claude-api` | `vendor.py anthropic-skills claude-api/SKILL.md` | Reference for the Claude API / Anthropic SDK — model ids, pricing, params, streaming, tool use, MCP, agents, caching, token counting, model migration. TRIGGER — read… |
| `discernment-nudge` | `vendor.py anthropic-skills discernment-nudge/SKILL.md` | After you give a substantive answer or draft that the user may act on — advice or recommendations, drafted artifacts such as goals, plans, pitches, proposals, or… |
| `doc-coauthoring` | `vendor.py anthropic-skills doc-coauthoring/SKILL.md` | Guide users through a structured workflow for co-authoring documentation. Use when user wants to write documentation, proposals, technical specs, decision docs, or… |
| `frontend-design` | `vendor.py anthropic-skills frontend-design/SKILL.md` | Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one. Helps with aesthetic direction, typography, and making choices… |
| `internal-comms` | `vendor.py anthropic-skills internal-comms/SKILL.md` | A set of resources to help me write all kinds of internal communications, using the formats that my company likes to use. Claude should use this skill whenever asked to… |
| `mcp-builder` | `vendor.py anthropic-skills mcp-builder/SKILL.md` | Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools. Use when building… |
| `skill-creator` | `vendor.py anthropic-skills skill-creator/SKILL.md` | Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize an existing… |
| `slack-gif-creator` | `vendor.py anthropic-skills slack-gif-creator/SKILL.md` | Knowledge and utilities for creating animated GIFs optimized for Slack. Provides constraints, validation tools, and animation concepts. Use when users request animated… |
| `theme-factory` | `vendor.py anthropic-skills theme-factory/SKILL.md` | Toolkit for styling artifacts with a theme. These artifacts can be slides, docs, reportings, HTML landing pages, etc. There are 10 pre-set themes with colors/fonts that… |
| `web-artifacts-builder` | `vendor.py anthropic-skills web-artifacts-builder/SKILL.md` | Suite of tools for creating elaborate, multi-component claude.ai HTML artifacts using modern frontend web technologies (React, Tailwind CSS, shadcn/ui). Use for complex… |
| `webapp-testing` | `vendor.py anthropic-skills webapp-testing/SKILL.md` | Toolkit for interacting with and testing local web applications using Playwright. Supports verifying frontend functionality, debugging UI behavior, capturing browser… |

