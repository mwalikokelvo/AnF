import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SpotubeStreamService, STREAM_INSTANCES, PIPED_INSTANCES } from '../src/workspace/streaming-provider.js';
import { setOnlineLookups } from '../src/workspace/online-lookups.js';

const ID = 'zn1FHSWPaTk';
const kindOf = (host: string) => STREAM_INSTANCES.find(i => new URL(i.url).hostname === host)?.kind;
const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } });

describe('stream instances speak their own API', () => {
  const realFetch = globalThis.fetch;
  let calls: string[] = [];
  /** Every Piped instance is down; only the Invidious one answers, and only in the Invidious shape. */
  const onlyInvidious = (answer: (path: string, search: URLSearchParams) => Response | undefined) => {
    calls = [];
    globalThis.fetch = (async (input: any) => {
      const u = new URL(String(input));
      calls.push(u.hostname + u.pathname + u.search);
      if (kindOf(u.hostname) !== 'invidious') return new Response('busy', { status: 503 });
      if (!u.pathname.startsWith('/api/v1/')) return new Response('not found', { status: 404 });
      return answer(u.pathname, u.searchParams) ?? new Response('not found', { status: 404 });
    }) as typeof fetch;
  };
  afterEach(() => { setOnlineLookups(false); globalThis.fetch = realFetch; });

  test('the list tags each instance and nadeko is Invidious', () => {
    assert.equal(kindOf('inv.nadeko.net'), 'invidious');
    for (const h of ['pipedapi.kavin.rocks', 'pipedapi.leptons.xyz', 'piped-api.privacy.com.de', 'pipedapi.adminforge.de']) assert.equal(kindOf(h), 'piped', h);
    assert.equal(kindOf('invidious.nerdvpn.de'), 'invidious');
    assert.deepEqual(PIPED_INSTANCES, STREAM_INSTANCES.map(i => i.url));
  });

  test('pasted video: Invidious /api/v1/videos with adaptiveFormats and string bitrates', async () => {
    setOnlineLookups(true);
    onlyInvidious(path => path === `/api/v1/videos/${ID}` ? json({
      title: 'Inv Title', author: 'Inv Artist', lengthSeconds: 187,
      adaptiveFormats: [
        { type: 'video/mp4; codecs="avc1.4d401f"', url: 'https://rr1.googlevideo.com/video', bitrate: '900000' },
        { type: 'audio/mp4; codecs="mp4a.40.2"', url: 'https://rr1.googlevideo.com/low', bitrate: '48000' },
        { type: 'audio/webm; codecs="opus"', url: 'https://rr1.googlevideo.com/high', bitrate: '160000' },
        { type: 'audio/webm; codecs="opus"', url: 'http://rr1.googlevideo.com/insecure', bitrate: '999999' },
      ],
    }) : undefined);
    const res = await new SpotubeStreamService().resolveDirectUrl(`https://youtu.be/${ID}`);
    assert.ok(res);
    assert.equal(res.track.title, 'Inv Title');
    assert.equal(res.track.artist, 'Inv Artist');
    assert.equal(res.track.duration, 187);
    assert.equal(res.stream.streamUrl, 'https://rr1.googlevideo.com/high');
    assert.equal(res.stream.mimeType, 'audio/webm; codecs="opus"');
    assert.equal(res.stream.bitrate, 160000);
    assert.ok(calls.some(c => c.startsWith(`inv.nadeko.net/api/v1/videos/${ID}`)), calls.join(' '));
  });

  test('search: Invidious /api/v1/search?type=video', async () => {
    setOnlineLookups(true);
    onlyInvidious((path, q) => path === '/api/v1/search' && q.get('type') === 'video' ? json([
      { type: 'channel', author: 'Not a video' },
      { type: 'video', videoId: ID, title: 'Inv Song', author: 'Inv Band', lengthSeconds: 201, videoThumbnails: [{ quality: 'medium', url: 'https://i.ytimg.com/vi/zn1FHSWPaTk/mqdefault.jpg' }] },
    ]) : undefined);
    const found = await new SpotubeStreamService().searchYouTube('inv song');
    assert.deepEqual(found.map(t => [t.id, t.title, t.artist, t.duration]), [[`yt:${ID}`, 'Inv Song', 'Inv Band', 201]]);
    assert.equal(found[0].artworkUrl, 'https://i.ytimg.com/vi/zn1FHSWPaTk/mqdefault.jpg');
  });

  test('thumbnails on instance or proxy hosts (blocked by the img-src CSP) fall back to i.ytimg.com', async () => {
    setOnlineLookups(true);
    calls = [];
    globalThis.fetch = (async (input: any) => {
      const u = new URL(String(input));
      if (u.hostname === 'pipedapi.kavin.rocks') return json({ items: [{ url: `/watch?v=${ID}`, title: 'P', thumbnail: 'https://pipedproxy-bom.kavin.rocks/vi/zn1FHSWPaTk/hq.jpg?host=i.ytimg.com' }] });
      return new Response('busy', { status: 503 });
    }) as typeof fetch;
    const [p] = await new SpotubeStreamService().searchYouTube('p');
    assert.equal(p.artworkUrl, `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
    onlyInvidious((path) => path === '/api/v1/search' ? json([{ type: 'video', videoId: ID, title: 'I', videoThumbnails: [{ url: 'https://inv.nadeko.net/vi/zn1FHSWPaTk/maxres.jpg' }] }]) : undefined);
    const [i] = await new SpotubeStreamService().searchYouTube('i');
    assert.equal(i.artworkUrl, `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });

  test('playlist: Invidious /api/v1/playlists', async () => {
    setOnlineLookups(true);
    onlyInvidious(path => path === '/api/v1/playlists/PLabc123' ? json({
      title: 'Inv List', author: 'Inv Curator',
      videos: [{ videoId: ID, title: 'One', author: 'A', lengthSeconds: 90 }, { videoId: 'aaaaaaaaaaa', title: 'Two', author: 'B', lengthSeconds: 95 }],
    }) : undefined);
    const col = await new SpotubeStreamService().resolveYouTubePlaylist('PLabc123');
    assert.ok(col);
    assert.equal(col.title, 'Inv List');
    assert.deepEqual(col.tracks.map(t => t.id), [`yt:${ID}`, 'yt:aaaaaaaaaaa']);
  });

  test('no Invidious host is sent a Piped path and no Piped host an Invidious path', async () => {
    setOnlineLookups(true);
    calls = [];
    globalThis.fetch = (async (input: any) => { const u = new URL(String(input)); calls.push(u.hostname + u.pathname); return new Response('busy', { status: 503 }); }) as typeof fetch;
    const service = new SpotubeStreamService();
    await service.lookupYouTube(ID);
    await service.searchYouTube('x');
    await service.resolveYouTubePlaylist('PLabc123').catch(() => null);
    assert.ok(calls.length > 0);
    for (const c of calls) {
      const [host, ...rest] = c.split('/');
      const path = '/' + rest.join('/');
      if (kindOf(host) === 'invidious') assert.ok(path.startsWith('/api/v1/'), c);
      if (kindOf(host) === 'piped') assert.ok(!path.startsWith('/api/v1/'), c);
    }
  });
});
