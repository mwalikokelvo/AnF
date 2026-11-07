# AnF Multi-Agent Development Standards

This document establishes operating standards for all autonomous AI coding agents (DeepSeek Harness, Antigravity, Cursor, Claude Code, Codex) working on the AnF codebase.

## 1. REA Reverse Engineering Standard (STRICT MANDATE)
- **NEVER SKIP REA**: For any application, library, feature, or protocol investigation (including when open source is available), agents MUST use REA (`rea` CLI 6.8.0 or REA MCP tools).
- **Target Analysis**:
  - For Electron/Desktop targets: unpack and inspect ASAR packages (`app.asar`), trace IPC handlers (`ipcMain.handle`, `ipcRenderer.invoke`), extract preload bridge interfaces, and extract clean CSS/design tokens.
  - For Native Binaries (PE, ELF, Mach-O): inspect exported symbol tables, imported libraries, section headers, string constants, and decompiled routines.
  - For Network & Audio Protocols: inspect request/response schemas, streaming endpoint signatures, and caching mechanisms.
- **Evidence-First Grounding**: All architectural choices, reverse-engineered workflows, and feature improvements must cite concrete extracted evidence from REA.

## 2. Multi-Agent Handover & Token Quota Protection
- **Check State First**: Read `HANDOFF.md` and `docs/BUILDUP-STATUS.md` before starting any task.
- **Continuous Buildup**: Never discard or overwrite working code from other partner agents. Inspect recent commits on `origin/` and continuation checkpoints.
- **Atomic Commits & Pushes**: Whenever approaching token quota limits, commit working increments with passing tests and push to `origin` immediately, appending details to `HANDOFF.md`.
- **No Build Collisions**: Do not run `cargo build` or `npm run pack` while another agent process is running; native target directories lock.

## 3. Quality Gates (Always Green)
Before any commit or handover, verify all gates in `windows/`:
```bash
npx tsc --noEmit
npm test
npm run test:e2e
node ../scripts/check-release.mjs
```

## 4. Architecture & Security Policies
- **Ponytail Lazy Senior Dev Mode**: Write the smallest complete diff. Reuse existing utilities; avoid unnecessary abstractions.
- **No Banned Services**: Spotify Connect is strictly prohibited (user account was banned). All music streaming uses decentralized, open-access providers (Audius, Subsonic/Navidrome, Internet Archive).
- **Privacy & Offline First**: Zero telemetry. Secrets stored in OS credential store / Keychain. Offline-first local data.
