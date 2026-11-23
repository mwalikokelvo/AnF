# grok/kevo-new-voice-features

Adds three new positive capabilities to Kevo (formerly Jarvis) that leading voice assistants support and AnF did not yet have on main:

1. **Translation** (`kevo-translate.ts`): Translate text using the free/open LibreTranslate public API. Inspired by Siri/Google Assistant/Alexa translation skills and open-source Mycroft/OVOS. Self-hostable for privacy. Observable differences from commercial: rate limits on public instance, no premium voices, requires network (or local instance).

2. **World Time** (`kevo-world-time.ts`): Offline "what time is it in Tokyo" for common cities. Inspired by Siri/Alexa world clock. Uses simple offset map (no DST handling yet — difference from commercial which use full timezone DB).

3. **Random choices** (`kevo-random.ts`): Coin flip, random number, pick from list. Offline. Matches "flip a coin" / "pick a number" in Siri/Alexa/Google. Pure local Math.random.

## Why
These extend Kevo's instant commands without proprietary code, using free/documented APIs or pure offline logic. Spotify research informed music control ideas already present (play/pause/next/prev); these add non-music knowledge and utility features common across platforms.

## Integration
Wire into `kevo-actions.ts` KEVO_ACTIONS array (pattern of wikipedia_summary, define_word). Add intent parsing in voice agent. Tests in `windows/tests/kevo-new-capabilities.test.ts`.

## Research notes
- Leading assistants: time/date/timers (present), weather/news (branches exist), translation, world clock, random, music search/playback/playlist (partial via Music Hub + Spotube opt-in).
- Spotify: catalog search, metadata, playlist CRUD, playback control (auth + Premium for full). Ideas only; no proprietary code copied.
- OVOS/Mycroft: modular skills, offline-first, privacy-focused — aligns with AnF.

Claude or approved partner reviews and merges to main. Never push to main from this branch.
