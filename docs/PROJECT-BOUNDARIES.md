# Project boundaries

## AnF (this repository’s product work)

Reader, Writing, Vault (SQLCipher in the Windows host), local sync, Music Hub, Audio Studio, Android Java/WebView host.

Phase work in `docs/AF-Master-Plan.md` applies to **AnF only**.

## ThingsBook

ThingsBook is a **separate product**. The `_core` tree in this monorepo is not the AnF vault and must not be used as AnF’s storage backend.

Until ThingsBook has its own project space and release line:

- Do not route AnF Phase 3–5 work through `_core`
- Do not treat ThingsBook crypto/session types as AnF vault contracts
- AnF vault contracts live under `docs/contracts/` and `contracts/fixtures/`

This keeps AnF delivery focused and avoids mixed ownership of data formats.
