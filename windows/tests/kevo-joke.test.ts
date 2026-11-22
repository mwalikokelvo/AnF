import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJoke, isJokeRequest } from '../src/workspace/jarvis/voice/kevo-joke';
import { JarvisVoiceAgent } from '../src/workspace/jarvis/voice/jarvis-voice-agent';

/** Runs `body` with a fake global fetch that answers `joke` and records each request. */
async function withFetch<T>(joke: string, body: (calls: { url: string; init?: RequestInit }[]) => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, json: async () => ({ id: 'x', joke, status: 200 }) };
  }) as typeof fetch;
  try {
    return await body(calls);
  } finally {
    globalThis.fetch = real;
  }
}

describe('Kevo joke', () => {
  it('knows a joke request', () => {
    for (const said of ['tell me a joke', 'Tell me another joke!', 'joke', 'can you please make me laugh?', 'kevo, say something funny', 'tell me a joke please'])
      assert.equal(isJokeRequest(said.toLowerCase()), true, said);
    for (const said of ['that was a joke', 'what is a joke', 'tell me about jokes in history', 'joke book'])
      assert.equal(isJokeRequest(said), false, said);
  });

  it('asks icanhazdadjoke.com for JSON', async () => {
    const sent: { url: string; accept?: string }[] = [];
    const joke = await fetchJoke(async (url, init) => {
      sent.push({ url, accept: init?.headers?.Accept });
      return { ok: true, status: 200, json: async () => ({ joke: ' Why did the scarecrow win? He was outstanding in his field. ' }) };
    });
    assert.deepEqual(sent, [{ url: 'https://icanhazdadjoke.com/', accept: 'application/json' }]);
    assert.equal(joke, 'Why did the scarecrow win? He was outstanding in his field.');
    await assert.rejects(fetchJoke(async () => ({ ok: false, status: 503, json: async () => ({}) })), /answered 503/);
    await assert.rejects(fetchJoke(async () => ({ ok: true, status: 200, json: async () => ({}) })), /no joke/);
    await assert.rejects(fetchJoke(async () => { throw new Error('offline'); }), /joke service did not answer/);
  });

  it('tells a joke whether online lookups are on or off', async () => {
    for (const on of [true, false]) {
      await withFetch('I only know 25 letters of the alphabet. I do not know y.', async (calls) => {
        const agent = new JarvisVoiceAgent({ switchView: () => {}, onlineLookupsEnabled: () => on });
        const res = await agent.processVoiceInput('tell me a joke');
        assert.equal(res.actionName, 'tell_joke', `online lookups ${on ? 'on' : 'off'}`);
        assert.equal(res.speechReply, 'I only know 25 letters of the alphabet. I do not know y.');
        assert.equal(calls.filter((c) => c.url.includes('icanhazdadjoke')).length, 1);
      });
    }
  });

  it('lets the AI tell one when the joke service does not answer', async () => {
    const real = globalThis.fetch;
    let asked = 0;
    globalThis.fetch = (async (url: string) => {
      if (String(url).includes('icanhazdadjoke')) asked++;
      throw new Error('offline');
    }) as typeof fetch;
    try {
      const res = await new JarvisVoiceAgent({ switchView: () => {} }).processVoiceInput('joke');
      assert.equal(asked, 1);
      assert.notEqual(res.actionName, 'tell_joke');
      assert.doesNotMatch(res.speechReply, /joke service/);
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe('Kevo previous track', () => {
  const agent = (calls: string[]) => new JarvisVoiceAgent({ switchView: () => {}, previousTrack: () => calls.push('previous'), nextTrack: () => calls.push('next') });

  it('goes back for a request', async () => {
    for (const said of ['previous song', 'go back a track', 'skip back a track', 'can you go to the previous track?', 'prev track please']) {
      const calls: string[] = [];
      const res = await agent(calls).processVoiceInput(said);
      assert.equal(res.actionName, 'previous_track', said);
      assert.deepEqual(calls, ['previous'], said);
    }
  });

  it('does not go back for a question or a refusal', async () => {
    for (const said of ['what was the last song?', "please don't go back a track", 'was the previous song good?']) {
      const calls: string[] = [];
      const res = await agent(calls).processVoiceInput(said);
      assert.notEqual(res.actionName, 'previous_track', said);
      assert.deepEqual(calls, [], said);
    }
  });
});
