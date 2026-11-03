import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SpotubeStreamService, StreamResolutionError, cacheStreamTrack, PREVIEW_ONLY_MESSAGE, type StreamTrackMetadata } from '../src/workspace/streaming-provider.js';
import { setOnlineLookups } from '../src/workspace/online-lookups.js';

const PREVIEW = 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/v4/clip.m4a';
const itunes = { results: [{ trackId: 7, trackName: 'WIMBO WANGU', artistName: 'JTC ARUSHA', collectionName: 'WIMBO WANGU - Single', trackTimeMillis: 240000, artworkUrl100: 'https://is1-ssl.mzstatic.com/a.jpg', previewUrl: PREVIEW }] };
const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } });

describe('30 s previews are never presented as the full song', () => {
  const realFetch = globalThis.fetch;
  let youtubeUp = false;
  const stub = () => {
    globalThis.fetch = (async (input: any) => {
      const u = new URL(String(input));
      if (u.hostname === 'itunes.apple.com') return json(itunes);
      if (!youtubeUp) return new Response('busy', { status: 503 });
      if (u.pathname.startsWith('/search')) return json({ items: [{ url: '/watch?v=zn1FHSWPaTk', title: 'Full', uploaderName: 'JTC', duration: 240 }] });
      return json({ title: 'Full', uploader: 'JTC', duration: 240, audioStreams: [{ url: 'https://rr1.googlevideo.com/full', mimeType: 'audio/mp4', bitrate: 128000 }] });
    }) as typeof fetch;
  };
  afterEach(() => { setOnlineLookups(false); globalThis.fetch = realFetch; youtubeUp = false; });

  const find = async () => { setOnlineLookups(true); stub(); const s = new SpotubeStreamService(); const [t] = await s.searchTracks('wimbo wangu'); assert.ok(t); return { s, t }; };

  test('iTunes previewUrl is kept as previewUrl, never as the track streamUrl', async () => {
    const { t } = await find();
    assert.equal(t.streamUrl, undefined);
    assert.equal(t.previewUrl, PREVIEW);
  });

  test('no full source found: the stream is flagged as a preview', async () => {
    const { s, t } = await find();
    const r = await s.resolveStream(t);
    assert.ok(r);
    assert.equal(r.streamUrl, PREVIEW);
    assert.equal(r.preview, true);
  });

  test('a full YouTube match wins over the preview and is not flagged', async () => {
    const { s, t } = await find();
    youtubeUp = true;
    const r = await s.resolveStream(t);
    assert.ok(r);
    assert.equal(r.streamUrl, 'https://rr1.googlevideo.com/full');
    assert.ok(!r.preview);
  });

  test('a preview cannot be stored as a library song', async () => {
    const { t } = await find();
    const put: unknown[] = [];
    await assert.rejects(() => cacheStreamTrack({ put: async x => { put.push(x); } }, t, PREVIEW), (e: any) => e instanceof StreamResolutionError && e.code === 'preview-only' && e.message === PREVIEW_ONLY_MESSAGE);
    assert.equal(put.length, 0);
  });

  test('the message names the full-source routes', () => {
    assert.match(PREVIEW_ONLY_MESSAGE, /30 s preview/);
    assert.match(PREVIEW_ONLY_MESSAGE, /YouTube/);
    assert.match(PREVIEW_ONLY_MESSAGE, /direct audio link/i);
    assert.match(PREVIEW_ONLY_MESSAGE, /import/i);
  });

  test('stored tracks from older versions had the preview as streamUrl: it moves to previewUrl', () => {
    const store: Record<string, string> = { 'anf-spotube-cached-tracks': JSON.stringify([{ id: '7', title: 'Old', artist: 'A', source: 'spotube', streamUrl: PREVIEW }, { id: 'yt:zn1FHSWPaTk', title: 'Y', artist: 'B', source: 'youtube', streamUrl: 'https://rr1.googlevideo.com/x' }]) };
    (globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
    try {
      const s = new SpotubeStreamService();
      return Promise.all([s.getTrack('7'), s.getTrack('yt:zn1FHSWPaTk')]).then(([old, yt]) => {
        const o = old as StreamTrackMetadata;
        assert.equal(o.streamUrl, undefined);
        assert.equal(o.previewUrl, PREVIEW);
        assert.equal(yt?.streamUrl, 'https://rr1.googlevideo.com/x');
      });
    } finally { delete (globalThis as any).localStorage; }
  });
});
