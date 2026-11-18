# Kevo joke capability

Added on branch `grok/kevo-joke-capability`.

## What it adds

A free, no-key joke skill for Kevo using [JokeAPI](https://v2.jokeapi.dev/) in **safe-mode** only.

- `windows/src/workspace/jarvis/voice/kevo-jokes.ts` — fetches a single safe joke.
- Unit test for the formatter.

## How to wire it (next step)

In `jarvis-voice-agent.ts` `quickAnswer`, add:

```ts
if (/\b(tell me a joke|make me laugh|say something funny|joke)\b/.test(lower)) {
  const joke = await fetchSafeJoke();
  return done('tell_joke', formatJokeReply(joke));
}
```

(The function is async, so call it from `handle` rather than the sync `quickAnswer` if preferred.)

## Why

Leading assistants (Alexa, Google, Siri, Mycroft/OVOS) all have a joke skill. This uses a documented free public API, never copies proprietary code, and stays offline-capable once a joke is cached (future improvement).

## Safety

Always `safe-mode` + blacklist flags. No proprietary code copied. Never push to main.
