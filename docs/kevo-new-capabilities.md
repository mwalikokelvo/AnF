# Kevo new capabilities (grok/kevo-weather-news-timezone)

## Summary (Ponytail)
Adds three positive features Kevo lacked: spoken weather (Open-Meteo), world news headlines (BBC RSS), and current time in any city. All use free documented APIs with no keys. Tests cover happy paths with mocks. Integrates into the existing online-lookups pattern. Observable differences from commercial assistants: no personalisation, no multi-day detailed hourly, no alerts; pure public data.

## Features
1. **Weather** — "What's the weather in Paris?" / "Forecast for Berlin"
2. **News** — "What's in the news?" / "Top headlines"
3. **Time in city** — "What time is it in Tokyo?"

## Integration notes
Call the functions from kevo-actions or the voice agent when the intent matches. Respect the existing ONLINE_LOOKUPS_OFF flag. Attribution for Open-Meteo is required in UI.

## Tests
`kevo-weather-news-timezone.test.ts` — run with the existing test runner.
