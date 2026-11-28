# grok/kevo-weather-news-briefing

## What this branch adds and why

Adds three positive features to Kevo (AnF voice assistant) that leading assistants have but Kevo lacked:
1. **Weather queries** using the free, documented Open-Meteo API. Users can ask for current conditions. Inspired by Siri/Alexa/Google but implemented from public docs only.
2. **News headlines** from public RSS feeds. Quick top stories without proprietary services.
3. **Enhanced daily briefing** that combines the above with existing reminders and time. Builds on existing schedule code for better morning utility.

Why: Completes common voice assistant capabilities using only free/open APIs, no proprietary code copied. Tests included. Ready for review and merge by approved partner. Never pushed to main.

Observable differences: Location is explicit or defaulted (no silent GPS), news is unpersonalized public RSS, briefing is shorter than full commercial versions.
