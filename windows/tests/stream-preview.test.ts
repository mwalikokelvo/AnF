import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SpotubeStreamService, StreamResolutionError, cacheStreamTrack, PREVIEW_ONLY_MESSAGE, rankFullSongCandidates, type StreamTrackMetadata } from '../src/workspace/streaming-provider.js';
import { setOnlineLookups } from '../src/workspace/online-lookups.js';

const PREVIEW = 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/v4/clip.m4a';
const itunes = { results: [{ trackId: 7, trackName: 'WIMBO WANGU', artistName: 'JTC ARUSHA', collectionName: 'WIMBO WANGU - Single', trackTimeMillis: 240000, artworkUrl100: 'https://is1-ssl.mzstatic.com/a.jpg', previewUrl: PREVIEW }] };
const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } });

describe('full-length matches outrank 30 s clips', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { setOnlineLookups(false); globalThis.fetch = realFetch; });

  test('a 30 s upload is dropped when the song is longer, and the closest full recording is first', () => {
    const ranked = rankFullSongCandidates([
      { id: 'clip', title: 'Song (Preview)', duration: 30 },
      { id: 'live', title: 'Song live', duration: 400 },
      { id: 'full', title: 'Song', duration: 242 },
    ], 240);
    assert.deepEqual(ranked.map(c => c.id), ['full', 'live']);
  });

  test('a dead close match falls through to the next full recording, not the 30 s clip', async () => {
    setOnlineLookups(true);
    globalThis.fetch = (async (input: any) => {
      const u = new URL(String(input));
      if (u.hostname === 'itunes.apple.com') return json(itunes);
      if (u.pathname.startsWith('/search')) return json({ items: [
        { url: '/watch?v=shortclip11', title: 'WIMBO WANGU (Preview)', duration: 30 },
        { url: '/watch?v=closest1111', title: 'WIMBO WANGU', duration: 242 },
        { url: '/watch?v=liveversion', title: 'WIMBO WANGU live', duration: 400 },
      ] });
      if (u.pathname.includes('closest1111')) return new Response('down', { status: 503 });
      if (u.pathname.includes('shortclip11')) return json({ duration: 30, audioStreams: [{ url: 'https://rr1.googlevideo.com/clip30', mimeType: 'audio/mp4', bitrate: 96000 }] });
      return json({ title: 'WIMBO WANGU live', duration: 400, audioStreams: [{ url: 'https://rr1.googlevideo.com/live', mimeType: 'audio/mp4', bitrate: 128000 }] });
    }) as typeof fetch;
    const s = new SpotubeStreamService();
    const [t] = await s.searchTracks('wimbo wangu');
    const r = await s.resolveStream(t);
    assert.ok(r);
    assert.equal(r.streamUrl, 'https://rr1.googlevideo.com/live');
    assert.ok(!r.preview);
    assert.equal(r.duration, 400);
  });

  test('every hit being a clip leaves nothing to play as the song', () => {
    assert.deepEqual(rankFullSongCandidates([{ id: 'clip', title: 'Song', duration: 30 }], 240), []);
  });
});

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

  test('a playable 30 s first hit is skipped when a later result is the full song', async () => {
    setOnlineLookups(true);
    globalThis.fetch = (async (input: any) => {
      const u = new URL(String(input));
      if (u.hostname === 'itunes.apple.com') return json(itunes);
      if (u.pathname.startsWith('/search')) return json({ items: [
        { url: '/watch?v=shortclip11', title: 'WIMBO WANGU (Preview)', uploaderName: 'JTC', duration: 30 },
        { url: '/watch?v=zn1FHSWPaTk', title: 'WIMBO WANGU', uploaderName: 'JTC ARUSHA', duration: 240 },
      ] });
      if (u.pathname.includes('shortclip11')) return json({ title: 'WIMBO WANGU (Preview)', duration: 30, audioStreams: [{ url: 'https://rr1.googlevideo.com/clip30', mimeType: 'audio/mp4', bitrate: 96000 }] });
      return json({ title: 'WIMBO WANGU', uploader: 'JTC ARUSHA', duration: 240, audioStreams: [{ url: 'https://rr1.googlevideo.com/full', mimeType: 'audio/mp4', bitrate: 128000 }] });
    }) as typeof fetch;
    const s = new SpotubeStreamService();
    const [t] = await s.searchTracks('wimbo wangu');
    assert.equal(t.duration, 240);
    const r = await s.resolveStream(t);
    assert.ok(r);
    assert.equal(r.streamUrl, 'https://rr1.googlevideo.com/full');
    assert.ok(!r.preview);
    assert.equal(r.duration, 240);
  });

  test('only a 30 s upload is not played as the song: the catalogue clip stays labelled', async () => {
    setOnlineLookups(true);
    globalThis.fetch = (async (input: any) => {
      const u = new URL(String(input));
      if (u.hostname === 'itunes.apple.com') return json(itunes);
      if (u.pathname.startsWith('/search')) return json({ items: [{ url: '/watch?v=shortclip11', title: 'WIMBO WANGU (Preview)', uploaderName: 'JTC', duration: 30 }] });
      return json({ title: 'WIMBO WANGU (Preview)', duration: 30, audioStreams: [{ url: 'https://rr1.googlevideo.com/clip30', mimeType: 'audio/mp4', bitrate: 96000 }] });
    }) as typeof fetch;
    const s = new SpotubeStreamService();
    const [t] = await s.searchTracks('wimbo wangu');
    const r = await s.resolveStream(t);
    assert.ok(r);
    assert.equal(r.streamUrl, PREVIEW);
    assert.equal(r.preview, true);
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
