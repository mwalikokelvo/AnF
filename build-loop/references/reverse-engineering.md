# Reverse engineering — private APIs and shipped binaries

Two bundled tools, both MIT:

- **reverse-api-engineer** (`python3 scripts/vendor.py reverse-api-engineer reverse-api-engineer/SKILL.md`) — records a browser session against a website and turns the traffic into a typed, runnable API client (Python, TypeScript, Go and others). Install: `uv tool install reverse-api-engineer` (or `pipx install reverse-api-engineer`); agent mode needs Node.js 20.19+.
- **REA — reverse engineer anything** (`python3 scripts/vendor.py rea reverse-engineer-anything/SKILL.md`, plus its `references/`) — evidence-based analysis of native, .NET, Electron/JavaScript, packaged (APK/IPA/MSIX/DMG/PyInstaller), firmware and browser targets through the REA MCP server or CLI; can also build agent environments of a web app. Engines (Ghidra, JADX, Frida…) are separate installs the skill says how to check.

## When the loop uses them

- Integrating with a service that has no public API, where the user has an account and the service's terms allow automated access — e.g. a client for the user's own school portal, bank export, or supplier dashboard.
- Debugging or interoperating with the user's **own** shipped builds: inspect an installer, APK or Electron bundle from CI to confirm what actually shipped (bundled files, IDs, permissions, versions) — useful evidence for the §7 "built"/"installed" labels.
- Analysing a binary or package the user is authorised to analyse (their own, open-source, or under a written engagement).

## Guardrails — apply every time

1. **Authorisation first.** Only targets the user owns, has an account with, or is explicitly authorised to analyse. Respect the site's terms and rate limits. If it's unclear, mark the slice BLOCKED and say what authorisation is needed.
2. **No bypassing.** Never defeat captchas, bot detection, 2FA, paywalls, licence checks, DRM or encryption. When a site needs a human (captcha, 2FA, unusual login), ask the user to capture that step in manual mode, as the tool's own docs say.
3. **Captures are secrets.** HAR files and session recordings contain cookies, tokens and personal data. Keep them out of git (add to `.gitignore`), never paste them into reports or handoffs, delete them when the client works. Generated clients read credentials from env vars, never hard-coded.
4. **Not in a Replica clean room.** When rebuilding a third-party app (§2a, `references/replica.md`), don't decompile its binaries or wire your clone to its private API. Recon stays on public behaviour, docs and screenshots; this file's tools are only for the user's own code and services they're entitled to use.
5. **Generated code is untrusted input.** Review the generated client like any dependency (`references/security.md`): pin what it calls, validate responses, add tests against recorded fixtures — not against the live site in CI.
6. **Running a target binary** (REA dynamic analysis, Frida) happens in a sandbox or VM, never on the user's main machine without them saying so.

## Labels

Findings from these tools are evidence about the target, not proof your code works. A generated client gets the usual labels: compiled → tested (against fixtures) → smoke-run (one real call with the user's account, if permitted).
