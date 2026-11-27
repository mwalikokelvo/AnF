# grok/kevo-weather-news-radio

## What this branch adds

Three new positive capabilities for Kevo (AnF voice assistant), reverse-engineered from public behavior of leading assistants (Siri, Alexa, Google/Gemini, OVOS/Mycroft weather & news skills, Spotify Radio semantics) using free/documented APIs and open patterns. No proprietary code copied.

1. **Weather** (`get_weather`): Current conditions + tomorrow forecast via Open-Meteo (no key). Trigger: “what’s the weather”, “weather in Paris”. Side effects: none (read-only). Failure: location not found or service down.
2. **News** (`get_news`): Top tech headlines from Hacker News Firebase API (no key). Trigger: “what’s the news”, “top stories”. Outputs spoken list of titles.
3. **Music Radio** (`music_radio`): Builds a local-library “radio” queue of similar tracks (same artist/genre preference), matching Spotify-style artist radio observable behavior (seed → ranked similar → play queue). Integration hook left for full music hub wiring.

## Why

Kevo already had timers, music basic controls, unit convert, translate, trivia, etc. These fill common gaps (weather is #1 request for voice assistants; news briefing; smarter music discovery without leaving the local library).

## Tests

`windows/tests/kevo-weather-news-radio.test.ts` covers radio ranking, weather formatting, news formatting.

## Remaining differences vs originals

- Weather: no hyper-local (uses Open-Meteo models), no severe alerts, Celsius default.
- News: tech-focused HN only (no general news aggregator key); no audio podcast-style.
- Radio: simple lexical/genre scoring, not embedding-based like Spotify; no streaming external tracks; shuffle is light; full library injection is stubbed in the action (expects music hub context).

Never pushed to main. Ready for review/PR by approved partner.
