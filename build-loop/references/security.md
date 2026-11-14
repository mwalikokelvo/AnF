# Security & Hardening

Open this when a change accepts input from anywhere outside the code (forms, URLs, files, IPC, webhooks, plugins, other processes, LLM output), touches auth/permissions, stores sensitive data, adds dependencies, or calls an external service.

## Threat model first (five minutes)

1. **Trust boundaries** — where does untrusted data enter? Requests, form fields, uploads, webhooks, third-party APIs, IPC from a webview, plugin code, files on disk, another process's arguments, and **LLM output**. Trust follows who *wrote* a value, not which channel delivered it.
2. **Assets** — what's worth stealing or breaking? Credentials, personal data, payment data, admin actions, the user's files.
3. **STRIDE each boundary**: Spoofing (authenticate, verify signatures) · Tampering (parameterize, integrity checks, HTTPS) · Repudiation (audit log security events) · Information disclosure (allowlist fields, generic errors) · Denial of service (size caps, timeouts, rate limits) · Elevation of privilege (authorize every request).
4. **Abuse cases next to use cases** — "how would I misuse this?" becomes a test.

Write the boundaries and abuse cases into the spec's Risks.

## Always

- Validate external input at the boundary with a schema (shape, length, enums, formats); downstream code uses only the parsed value.
- Parameterize every query; never build SQL, shell commands, or file paths by string concatenation of input.
- Encode output via the framework's auto-escaping; if raw HTML is unavoidable, sanitize with an allowlist sanitizer.
- Check **authorization** on every request: the user must be allowed on *this* resource, not just logged in.
- Hash passwords with argon2/scrypt/bcrypt (≥12 rounds). Session cookies `httpOnly`, `secure`, `sameSite=lax|strict`, bounded lifetime.
- Security headers on web responses; CSP starts at `default-src 'self'` and only tightens. CORS: explicit origin list, never `*` with credentials.
- Secrets come from the environment or the OS keychain. Commit `.env.example` with placeholders; gitignore real `.env*` and key files; grep the staged diff for keys before committing.
- Uploads: allowlist types, cap size, check content (magic bytes) when it matters — the extension proves nothing.
- Run the package manager's native audit against the lockfile before release.

## Never

- Commit secrets; log passwords, tokens, or full card numbers.
- Trust client-side validation as a security control.
- `eval`, `innerHTML`, or `dangerouslySetInnerHTML` with untrusted data.
- Store auth tokens in `localStorage`.
- Return stack traces or internal errors to users.
- Disable a security check, header, or test to make something work.

## Hand back to the user instead of deciding alone

These are security decisions with consequences the user should own. In autonomous mode, build the safe default, and list the choice in "Decisions made without asking" with the trade-off spelled out: new auth flows or auth logic changes; storing a new category of personal/payment data; new external integrations that receive user data; loosening CORS; new upload handlers; new elevated roles. If no safe default exists, mark the slice BLOCKED rather than guessing.

## Specific traps

- **SSRF** — any user-influenced URL the server fetches (webhooks, "import from URL", link previews): allowlist scheme and host, resolve all DNS records and reject private/loopback/link-local addresses (incl. `169.254.169.254`, IPv6 equivalents), forbid redirects.
- **Destructive operations on derived paths** — before deleting/moving/overwriting a path built from any input: resolve symlinks, require it to sit under an allowlisted root and at least one level below it, and check ownership evidence first. On refusal, log and stop; never fall back to a broader path.
- **Rate limits** — strict on auth endpoints (~10 attempts / 15 min). In-memory counters don't work across multiple instances or serverless; use a shared store.
- **Desktop apps (Tauri/Electron)** — the webview is untrusted relative to the native side: expose the narrowest commands/IPC, validate every argument native-side, scope filesystem and shell permissions (Tauri capabilities/allowlist), keep `nodeIntegration` off and `contextIsolation` on in Electron, never load remote content with native privileges.
- **Plugins / marketplaces** — treat third-party plugin code and themes as untrusted: declared permissions, sandboxing where possible, integrity checks (hash/signature) on download, no silent auto-execution.
- **Supply chain** — before adding a dependency: does the stack already do this? Is it maintained, reasonably popular, correctly spelled (typosquats), licence-compatible? Review the lockfile diff, not just the manifest. Never auto-apply `audit fix --force`.
- **Personal data** — collect only for a stated purpose, keep it out of telemetry, give stores a retention period and a deletion path.

## AI / LLM features

- Model output is untrusted input: never into `eval`, SQL, shell, HTML, or a file path without validation and encoding.
- Prompts can be hijacked by any untrusted text in context (user messages, fetched pages, documents). The system prompt is not a security boundary — enforce permissions in code.
- Keep secrets and other users' data out of the context window; scope tool permissions; validate tool arguments; confirm destructive tool actions; cap tokens, rate, and recursion.

## Active security testing with Strix

Strix (bundled, Apache-2.0) runs AI agents that try real exploits and report proven findings. Pick the skill: `vendor.py --list strix`; read with `python3 scripts/vendor.py strix <skill>/SKILL.md`.

- **White-box, every Feature/Initiative touching a trust boundary:** `find-security-vulnerabilities-in-code` on the repo or the changed paths, then `fix-security-vulnerabilities-with-strix` for what it proves. A fix gets a regression test like any bug.
- **Running app or API:** `web-app-penetration-testing`, `api-security-testing`, `owasp-top-10-testing` — against a local or staging instance with throwaway data, never production.
- **CI:** `ci-security-scanning-with-strix` adds a scan to the pipeline (secrets as CI secrets).
- **Setup:** `pipx install strix-agent` (or `uv tool install strix-agent`); needs Docker, plus `STRIX_LLM` and `LLM_API_KEY` from env. Each scan spends model tokens — scope it to the change, and treat a full-app scan as a metered run under §8.
- **Authorisation:** only targets the user owns or is authorised to test. Third-party domains, shared hosting and anyone else's API are out unless the user shows written authorisation; the managed platform (app.strix.ai) is the user's account and choice.
- Findings go in the report with their evidence; "Strix found nothing" is a label on that scan's scope, not proof the app is secure.

## Verify

- [ ] Trust boundaries named in the spec; each has validation and a test with hostile input
- [ ] Authorization tested for "other user's resource" (expect 403/404)
- [ ] No secrets in the diff (`git diff --cached | grep -iE "key|secret|token|password"` and review hits)
- [ ] Dependency audit run; new dependencies justified in the spec
- [ ] Errors to users are generic; details go to logs only

## Excuses vs. reality

| Excuse | Reality |
|---|---|
| "It's an internal / personal tool" | Internal tools get compromised; personal apps hold personal data. |
| "We'll add security later" | Retrofitting is many times harder than building it in. |
| "The framework handles it" | Only when you use it as designed — check you haven't bypassed it. |
| "Nobody would try that" | Automated scanners try everything, constantly. |
