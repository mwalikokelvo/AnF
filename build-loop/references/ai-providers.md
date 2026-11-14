# AI providers — calling models from the code you build

Open this when a feature calls an LLM, or when the project runs several LLMs (e.g. multi-agent departments with different providers).

## Claude API

Read the bundled `claude-api` skill first: `python3 scripts/vendor.py anthropic-skills claude-api/SKILL.md` (model IDs, streaming, tool use, prompt caching, MCP, agents, batch). Check model IDs and prices there or in current docs — never from memory. For MCP servers: `vendor.py anthropic-skills mcp-builder/SKILL.md`.

## FreeLLMAPI — free-tier router for development

FreeLLMAPI (github.com/tashfeenahmed/freellmapi, MIT) is a self-hosted app, not a skill: it stacks the free tiers of ~34 providers behind one OpenAI-compatible `/v1` endpoint with a fallback chain. It isn't bundled; install it where it will run.

- **Install:** Docker Compose (`docs/en/install/01-install.md` in the repo; read `install.sh` before running the one-liner), or the Windows `.exe` from its Releases. Then add provider keys on its Keys page, set the fallback chain, and use its unified key with any OpenAI-compatible client (`base_url=http://localhost:3001/v1`).
- **Use it for:** prototyping, local development, cheap eval runs, and testing that an app works against any OpenAI-compatible endpoint.
- **Don't use it for:** production, anything with user data you can't send to many third parties, or a release build's default backend. Its own disclaimer says free tiers are for experimentation; swap in a paid API before shipping.
- **Rules:** one account per provider and follow each provider's terms (the repo's ToS review is in `docs/en/architecture/00-high-level-index.md`); keys stay in its encrypted store or env vars, never in git; quality drops late in the day as daily caps run out, so don't judge a model on an afternoon eval run.

## Design rules for LLM features

- Provider behind one small interface (base URL, model, key from config) so a dev router, Claude, or another provider can be swapped without touching feature code.
- Timeouts, retries with backoff, and a clear user-facing error when every provider fails.
- Log model, latency and token counts — not prompts with personal data (`references/observability.md`).
- Unit tests mock the provider; a few recorded-response tests guard parsing; one opt-in live smoke test.
- Prompt injection, output validation and tool permissions: `references/security.md` → "AI / LLM features".
