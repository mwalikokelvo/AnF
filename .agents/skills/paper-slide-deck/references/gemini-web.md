# Gemini Web Option (browser-based generation)

Read this file only when the user selects the **Gemini Web** generation method — a
no-API-key path that drives the Gemini web UI through a reverse-engineered API from the
`baoyu-danger-gemini-web` skill.

> ⚠️ This is NOT the official API. It may break anytime, has no support, and carries
> possible account risk. The Gemini API path (default, `scripts/generate-slides.py`)
> is preferred whenever a key is available.

## Requirements

- The `baoyu-danger-gemini-web` skill installed (typically
  `.claude/skills/baoyu-danger-gemini-web`)
- Google Chrome with a logged-in Google account
- User consent to the reverse-engineered-API disclaimer below

## Consent check

Read the consent file at:

- Windows: `$APPDATA/baoyu-skills/gemini-web/consent.json`
- macOS: `~/Library/Application Support/baoyu-skills/gemini-web/consent.json`
- Linux: `~/.local/share/baoyu-skills/gemini-web/consent.json`

> Note: the consent directory (`baoyu-skills/gemini-web/`) and the skill directory name
> (`baoyu-danger-gemini-web`) differ — upstream naming, kept as documented. If the file
> is not where this says, look inside the installed skill for its own consent path.

If there is no consent or the version mismatches, display the disclaimer and ask:

```
⚠️ DISCLAIMER: This uses a reverse-engineered Gemini Web API (NOT official).
Risks: May break anytime, no support, possible account risk.
```

## Per-slide invocation

```bash
npx -y bun ${GEMINI_WEB_SKILL_DIR}/scripts/main.ts \
  --promptfiles prompts/01-slide-cover.md \
  --image 01-slide-cover.png \
  --sessionId slides-{topic-slug}-{timestamp}
```

Where `GEMINI_WEB_SKILL_DIR` is the `baoyu-danger-gemini-web` skill directory. Keep one
`sessionId` for the whole deck so slides stay stylistically consistent.

After each slide, record it as AI-generated so the merge gate requires its proofread:

```bash
npx -y bun ${SKILL_DIR}/scripts/proofread.ts --record <slide-deck-dir> 01-slide-cover.png --model gemini-web
```

## Proxy

If the user is on a restricted network, prepend:

```bash
HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890
```
