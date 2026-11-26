# grok/kevo-spotify-weather-controls

## Summary
Adds three positive capabilities to Kevo that were not present:

1. **Weather forecasts** — Voice query for current conditions using free Open-Meteo API (no key required, public docs). Matches Siri/Alexa weather intent behavior: location + spoken summary. Failure mode: network off → graceful “cannot reach weather service”.

2. **Spotify-style music modifiers** — Volume (up/down/mute/set), shuffle toggle, repeat mode (off/one/all). Reverse-engineered from public Spotify Web API (PUT /me/player/volume, /shuffle, /repeat). Observable differences: local state only (no cloud device handoff), no premium gate.

3. **Queue awareness** — “What’s next” and basic add-to-queue intent. Inspired by Spotify queue endpoint.

## Why
Leading assistants (Siri, Alexa, Google) and Spotify expose these as core daily commands. Kevo gains them without proprietary code, using free documented APIs and local state.

## Tests
`windows/tests/kevo-weather-music.test.ts` covers formatting, volume clamping, shuffle/repeat, empty queue.

## REA notes
Public docs + matrix already in docs/REA-COMPETITIVE-MATRIX.md. No binary RE needed for these HTTP/JSON surfaces.

Ponytail: Ship — pure additive, tests green, no main push.
