# Voice — speech, voices and transcription (Fish Audio)

Bundled from fishaudio/fish-audio-plugin (MIT), three skills:

| Skill | Read with | For |
|---|---|---|
| `skills/fish-audio` | `python3 scripts/vendor.py fish-audio skills/fish-audio/SKILL.md` | using the Fish Audio connector directly: text to speech, finding or cloning voices, transcription, multi-speaker audio |
| `skills/fish-audio-api` | `python3 scripts/vendor.py fish-audio skills/fish-audio-api/SKILL.md` | writing raw HTTP/WebSocket calls (TTS, ASR, voice models, real-time streaming) |
| `skills/fish-audio-sdk` | `python3 scripts/vendor.py fish-audio skills/fish-audio-sdk/SKILL.md` | writing code with the official SDKs (Python `fish-audio-sdk`, JavaScript/TypeScript) |

Each has a `references/` folder; `vendor.py --list fish-audio` shows the paths.

## When the loop uses it

- A feature needs speech output, voice input, transcription or a voice picker → build it with the SDK or API skill.
- A release needs narration, an app-store preview voice-over or audio samples → generate with the connector skill (or an ElevenLabs connector if that's what's connected).

## Rules

- **Voice cloning needs the speaker's consent.** Clone only the user's own voice or a voice whose speaker has given permission; set `confirm_voice_rights` only after the user says so. Never clone a public figure or someone else's voice from found recordings.
- **API keys** come from env vars or the platform's secret store; never in code, logs, or the handoff. In apps, call Fish Audio from a backend or a user-supplied key — never ship a developer key inside a Windows/Android build.
- **Credits are money.** Generation is metered: keep test runs short, mock the API in unit tests, and use recorded fixtures in CI. Large batch generation is a §8 "paid or metered at scale" step — prepare it and list the command.
- The connector itself (`https://api.fish.audio/mcp`) must be connected in the app; if no Fish Audio tools are present, say which connection is missing and continue with the SDK path.
- Spoken output in a UI still needs captions/text equivalents (`references/frontend-ui.md`, accessibility).
