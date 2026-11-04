# Overnight wiring (2026-11-04)

User asleep with full autonomy; design gate waived by explicit "just dive in / all autonomy".

## Intent
Ship the library modules that already exist on main but have no screen: OPDS browse, KOReader progress sync, and a Rust `safe_fetch` image kind so podcast/OPDS covers work under CSP.

## Goals
- Documents: add/remove OPDS catalog URLs, list books, open an acquisition link as a local source when text/html or via existing webpage/file paths when possible.
- Settings + reader: configure kosync server/user/key (key in OS secret store), push on close, pull on open when newer.
- Podcast/OPDS covers: `safe_fetch_image` → blob URL (CSP unchanged).

## Non-goals / anti-goals
- No restyle of shipped Music Hub / Settings / pills.
- No pill ID renames. No merge to `main` from this overnight run (PRs only).
- No production release claims without install+smoke.

## Approaches considered
1. Frontend-only fetch — rejected (CSP connect-src / img-src).
2. Loosen CSP — rejected (security posture).
3. Rust safe_fetch kinds + thin UI panels — chosen; matches existing audio/text pattern.

## Builder calls
- Store OPDS catalog list in localStorage; reuse `opdsFeedsFromText` / queue helpers.
- Add `acquisitionUrl` (+ optional type) on `OpdsBook`.
- KOReader keys: extend `KNOWN_KEYS` with `koreader-userkey`; username + server URL in localStorage (non-secret); mirror n8n pattern.
- Image cap 2 MiB; jpeg/png/webp/gif/avif only.
