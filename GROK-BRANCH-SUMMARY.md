# grok/kevo-weather-dict-recs

**What this branch adds and why**

Three positive new capabilities for Kevo (formerly Jarvis) that leading voice assistants offer and that fit AnF’s private/local-first model:

1. **Weather** — Free Open-Meteo + Nominatim (no API key). "What’s the weather in [city]?" Common missing feature vs Siri/Alexa/Gemini/OVOS.
2. **Enhanced free dictionary** — dictionaryapi.dev for phonetics, examples, richer definitions. Complements existing lookup.
3. **Local music recommendations** — Spotify-inspired (search/recs ideas reverse-engineered from public API docs only) but pure local using listening history + genre/artist/BPM. No proprietary code copied.

All use free/documented APIs or pure local logic. Includes tests. Never pushed to main. Claude or approved partner reviews and merges.

Observable differences from originals: no cloud Spotify audio features, no account linking, fully offline-capable for recs, weather requires network but no key/account.
