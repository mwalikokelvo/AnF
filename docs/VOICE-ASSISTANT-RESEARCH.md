# Voice Assistant and Spotify Research Summary (for Kevo)

Research conducted 2026-11-20 using public docs, changelogs and open APIs. No proprietary code copied. Ideas only.

## Leading Voice Assistants Capabilities (public info)

- **Siri AI (iOS 27+)**: Conversational, screen awareness, personal context from messages/email/photos, multi-language, conversation memory across days. Offline on-device for many tasks.
- **Gemini (replaces Google Assistant)**: Strong search, Workspace integration, smart home, conversational. Free with limits.
- **Alexa+**: Best smart home (high success rate), routines, music (Amazon Music/Spotify), shopping, agentic tasks like reservations. Skills marketplace.
- **Copilot**: Windows-first, document summarization, Excel/PPT help, email drafting, voice on PC.
- **Open-source (Mycroft / OVOS)**: Privacy-first, local STT/TTS options, skills for weather, timers, music, news, smart home. Modular, no cloud required by default. Skills via intent files or Adapt. REST API options for control.

Common capabilities Kevo could still expand safely:
- Reliable offline wake-word + STT (Phase 1 in plan).
- Tool-calling with fixed action list (Phase 2).
- Memory across sessions (Phase 3).
- Scheduled briefings/reminders (Phase 4).
- Verified action results (Phase 5).
- Free public APIs gated by user opt-in (weather already partially present via Open-Meteo; similar for news RSS, dictionary, Wikipedia summaries).

## Spotify

Spotify Web API (https://developer.spotify.com/documentation/web-api):
- Search catalog (tracks, artists, albums, playlists) — free with auth.
- Recommendations based on seeds.
- Playback control (play/pause/skip/queue) requires user token + Premium for some.
- Currently playing, top tracks, etc.
- Recent changes (Feb 2026): some batch endpoints removed, search limit reduced to 10.

Ideas for AnF Music Hub / Kevo (using open alternatives as preferred):
- Audius, Internet Archive, LibriVox already used.
- Could add optional Spotify search metadata (no streaming) if user provides token, similar to existing online lookups gate.
- Player control via documented Web API or Web Playback SDK (Premium required).

## Positive addition this run

This research document is added so future branches can reference concrete public capabilities without re-researching. Next safe slices: gated free API features (news headlines from RSS, simple dictionary) once online lookups pattern is stable, or ThingsBook voice library summary.

Never push to main. Claude handles merges.
