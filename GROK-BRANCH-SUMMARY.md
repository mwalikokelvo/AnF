# grok/kevo-weather-news-joke

Adds three new Kevo capabilities inspired by leading voice assistants (Siri, Alexa, Google, Copilot, OVOS):

1. **Weather** (kevo-weather.ts): Current conditions for a named place via Open-Meteo + free geocoding (no API key, CC BY 4.0). Whats the weather in Nairobi?"
2. **News headlines** (kevo-news.ts): Latest BBC World RSS headlines. "Whats in the news?
3. **Sunrise/sunset** (kevo-sunrise.ts): Daily sun times for a place via Open-Meteo. When is sunrise in London?

Uses only free, documented, no-key public APIs. Offline-friendly fallbacks where possible. Tests cover pure formatting and code mapping. Full action wiring and phrase-list entries to be completed in review (follows Ponytail: smallest complete pure modules first).

Does not copy any proprietary code. Behaviour derived from public docs and open APIs of leading assistants.
