import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SpotubeStreamService, StreamResolutionError, STREAM_INSTANCES, resetInstanceHealth } from '../src/workspace/streaming-provider.js';
import { setOnlineLookups } from '../src/workspace/online-lookups.js';

const ID = 'b8CMDOzLi9Q';
const URL_ = `https://www.youtube.com/watch?v=${ID}&list=RD${ID}&start_radio=1&pp=0gcJCfwAo7VqN5tD`;
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const okPiped = () => json({ title: 'T', uploader: 'U', duration: 200, audioStreams: [{ url: 'https://rr1.googlevideo.com/a', mimeType: 'audio/mp4', bitrate: 128000 }] });
const hostOf = (u: string) => new URL(u).hostname;

describe('YouTube resolution across public instances', () => {
  const realFetch = globalThis.fetch;
  let calls: string[] = [];
  const stub = (answer: (u: URL, n: number) => Response | Promise<Response>) => {
    calls = [];
    globalThis.fetch = (async (input: any) => { calls.push(String(input)); return answer(new URL(String(input)), calls.length); }) as typeof fetch;
  };
  beforeEach(() => { resetInstanceHealth(); setOnlineLookups(true); });
  afterEach(() => { setOnlineLookups(false); globalThis.fetch = realFetch; resetInstanceHealth(); });
  const fail = (): Promise<StreamResolutionError> => new SpotubeStreamService().resolveDirectUrl(URL_).then(() => { throw Error('expected a failure'); }, e => e);

  test('every instance unreachable: says so, tries all, same message family as before', async () => {
    stub(() => { throw new TypeError('network down'); });
    const e = await fail();
    assert.equal(e.code, 'youtube-unresolved');
    assert.match(e.message, /none of the lookup services answered/i);
    assert.match(e.message, /try again/i);
    assert.equal(calls.length, STREAM_INSTANCES.length);
  });

  test('rate limited or blocked instances (429, bot check) count as unreachable, not as a bad video', async () => {
    stub((_u, n) => n % 2 ? json({ error: 'Too many requests' }, 429) : json({ message: "Sign in to confirm you're not a bot" }, 500));
    assert.equal((await fail()).code, 'youtube-unresolved');
    assert.equal(calls.length, STREAM_INSTANCES.length);
  });

  test('an instance that says the video is unavailable is believed: no further instances are asked', async () => {
    stub(() => json({ error: 'ContentNotAvailableException', message: 'This video is unavailable' }, 500));
    const e = await fail();
    assert.equal(e.code, 'youtube-unavailable');
    assert.match(e.message, /unavailable/i);
    assert.doesNotMatch(e.message, /none of the lookup services/i);
    assert.equal(calls.length, 1);
  });

  test('a 404 is also "unavailable"', async () => {
    stub(() => json({ error: 'not found' }, 404));
    assert.equal((await fail()).code, 'youtube-unavailable');
  });

  test('an instance answers but has no audio stream: not-audio wording after the others fail', async () => {
    stub((_u, n) => n === 1 ? json({ title: 'Live', uploader: 'U', audioStreams: [] }) : new Response('busy', { status: 503 }));
    const e = await fail();
    assert.equal(e.code, 'youtube-no-audio');
    assert.match(e.message, /no playable audio/i);
  });

  test('first instance down, second answers: resolves', async () => {
    stub((_u, n) => n === 1 ? new Response('busy', { status: 503 }) : okPiped());
    const res = await new SpotubeStreamService().resolveDirectUrl(URL_);
    assert.equal(res?.track.id, `yt:${ID}`);
    assert.equal(calls.length, 2);
  });

  test('per-instance failure memory: a failed instance is tried last next time', async () => {
    const first = hostOf(STREAM_INSTANCES[0].url);
    stub(u => hostOf(u.href) === first ? new Response('busy', { status: 503 }) : okPiped());
    const s = new SpotubeStreamService();
    await s.resolveDirectUrl(URL_);
    assert.equal(hostOf(calls[0]), first);
    stub(u => hostOf(u.href) === first ? new Response('busy', { status: 503 }) : okPiped());
    await s.resolveDirectUrl(URL_);
    assert.notEqual(hostOf(calls[0]), first, 'the instance that just failed was tried first again');
    assert.ok(calls.every(c => hostOf(c) !== first), 'the working instance answered, so the failed one was not needed');
  });

  test('a recovered instance goes back to its place', async () => {
    const first = hostOf(STREAM_INSTANCES[0].url);
    stub(u => hostOf(u.href) === first ? new Response('busy', { status: 503 }) : okPiped());
    const s = new SpotubeStreamService();
    await s.resolveDirectUrl(URL_);
    // all others fail now, so the previously failed one is the only candidate left and answers
    stub(u => hostOf(u.href) === first ? okPiped() : new Response('busy', { status: 503 }));
    await s.resolveDirectUrl(URL_);
    stub(() => okPiped());
    await s.resolveDirectUrl(URL_);
    assert.equal(hostOf(calls[0]), first);
  });

  test('a search result that cannot be resolved reports the real cause too', async () => {
    stub(() => json({ message: 'This video is unavailable' }, 500));
    const s = new SpotubeStreamService();
    assert.equal(await s.resolveStream({ id: `yt:${ID}`, title: 'x', artist: 'y', source: 'youtube' }), null);
    const { unresolvedStreamError } = await import('../src/workspace/streaming-provider.js');
    assert.equal((unresolvedStreamError({ id: `yt:${ID}`, title: 'x', source: 'youtube' }) as StreamResolutionError).code, 'youtube-unavailable');
  });
});

describe('the instance list', () => {
  const conf = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  const connect = (key: string) => new Set<string>((conf.app.security[key] as string).split(';').map(d => d.trim().split(/\s+/)).find(d => d[0] === 'connect-src')!.slice(1));

  test('is small, https only, one entry per host, and every host is in connect-src (csp and devCsp)', () => {
    assert.ok(STREAM_INSTANCES.length >= 4 && STREAM_INSTANCES.length <= 8);
    const hosts = STREAM_INSTANCES.map(i => { const u = new URL(i.url); assert.equal(u.protocol, 'https:'); assert.equal(u.pathname, '/'); return u.hostname; });
    assert.equal(new Set(hosts).size, hosts.length);
    for (const key of ['csp', 'devCsp']) for (const i of STREAM_INSTANCES) assert.ok(connect(key).has(i.url), `${key} lacks ${i.url}`);
  });

  test('is pinned: Piped doc list + Invidious official list, no stale hosts', () => {
    assert.deepEqual(STREAM_INSTANCES.map(i => `${i.kind} ${i.url}`), [
      'piped https://pipedapi.kavin.rocks',
      'piped https://pipedapi.leptons.xyz',
      'piped https://piped-api.privacy.com.de',
      'piped https://pipedapi.adminforge.de',
      'invidious https://inv.nadeko.net',
      'invidious https://invidious.nerdvpn.de',
    ]);
    for (const key of ['csp', 'devCsp']) for (const stale of ['https://api.piped.privacy.com.de', 'https://piped-api.lunar.icu']) assert.ok(!connect(key).has(stale), `${key} still allows ${stale}`);
  });
});
