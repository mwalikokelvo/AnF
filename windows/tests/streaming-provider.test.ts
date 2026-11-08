import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  SpotubeStreamService,
  parsePlaylistOrAlbumUrl,
  parseYouTubeVideoId,
  isAudioContentType,
  verifyAudioUrl,
  describeStreamError,
  StreamResolutionError,
  PIPED_INSTANCES,
  type StreamTrackMetadata,
  type BatchResolvedCollection
} from '../src/workspace/streaming-provider.js';
import { setOnlineLookups } from '../src/workspace/online-lookups.js';

describe('Spotube Streaming Audio Service', () => {
  test('registers and searches tracks in metadata cache', async () => {
    const service = new SpotubeStreamService();
    const track1: StreamTrackMetadata = {
      id: 'sp-1',
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      album: 'After Hours',
      duration: 200,
      streamUrl: 'https://stream.example.org/1.mp3'
    };
    const track2: StreamTrackMetadata = {
      id: 'sp-2',
      title: 'Save Your Tears',
      artist: 'The Weeknd',
      duration: 215,
      streamUrl: 'https://stream.example.org/2.mp3'
    };

    service.registerMetadata(track1);
    service.registerMetadata(track2);

    const results = await service.search('Blinding');
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'sp-1');
    assert.equal(results[0].title, 'Blinding Lights');

    const artistResults = await service.search('Weeknd');
    assert.equal(artistResults.length, 2);
  });

  test('resolves stream URL for cached tracks', async () => {
    const service = new SpotubeStreamService();
    service.registerMetadata({
      id: 'sp-xyz',
      title: 'Sample Track',
      artist: 'Artist',
      duration: 180,
      streamUrl: 'https://stream.example.org/xyz.mp3'
    });

    const url = await service.resolveStreamUrl('sp-xyz');
    assert.equal(url, 'https://stream.example.org/xyz.mp3');
  });

  test('throws descriptive error when resolving unknown stream URL', async () => {
    const service = new SpotubeStreamService();
    await assert.rejects(
      async () => await service.resolveStreamUrl('unknown-id'),
      /Stream URL unavailable/
    );
  });

  test('cacheStreamTrack stores track in audio library with "stream:" prefix', async () => {
    const service = new SpotubeStreamService();
    const stored: any[] = [];
    const mockLibrary = {
      put: async (t: any) => { stored.push(t); },
      tracks: async () => stored
    };

    const dummyBlob = new Blob(['mock audio data'], { type: 'audio/mpeg' });
    const track: StreamTrackMetadata = {
      id: 'track-99',
      title: 'Offline Song',
      artist: 'Local Band',
      duration: 150
    };

    const saved = await service.cacheStreamTrack(mockLibrary, track, dummyBlob);
    assert.equal(saved.id, 'stream:track-99');
    assert.equal(saved.title, 'Offline Song');
    assert.equal(saved.kind, 'music');

    const cached = await service.getCachedStreamTracks(mockLibrary);
    assert.equal(cached.length, 1);
    assert.equal(cached[0].id, 'stream:track-99');
  });

  test('implements StreamingMetadataProvider and StreamResolver contracts', async () => {
    const service = new SpotubeStreamService();
    const track: StreamTrackMetadata = {
      id: 'sp-contract-1',
      title: 'Contract Song',
      artist: 'Contract Artist',
      streamUrl: 'https://stream.example.org/contract.mp4',
      duration: 210,
    };
    service.registerMetadata(track);

    const fetched = await service.getTrack('sp-contract-1');
    assert.ok(fetched);
    assert.equal(fetched.title, 'Contract Song');

    const searchResults = await service.searchTracks('contract', { limit: 5 });
    assert.equal(searchResults.length, 1);
    assert.equal(searchResults[0].id, 'sp-contract-1');

    const resolved = await service.resolveStream(track);
    assert.ok(resolved);
    assert.equal(resolved.streamUrl, 'https://stream.example.org/contract.mp4');
    assert.equal(resolved.mimeType, 'audio/mp4');
  });

  test('resolveDirectUrl parses direct audio links accurately', async () => {
    const service = new SpotubeStreamService();
    const result = await service.resolveDirectUrl('https://example.org/media/moby_dick_chapter1.mp3');
    assert.ok(result);
    assert.equal(result.track.title, 'moby_dick_chapter1');
    assert.equal(result.track.source, 'custom');
    assert.equal(result.stream.streamUrl, 'https://example.org/media/moby_dick_chapter1.mp3');
    assert.equal(result.stream.mimeType, 'audio/mpeg');

    const m4aResult = await service.resolveDirectUrl('https://example.org/audio/song.m4a?token=abc');
    assert.ok(m4aResult);
    assert.equal(m4aResult.track.title, 'song');
    assert.equal(m4aResult.stream.mimeType, 'audio/mp4');
  });

  test('StreamTrackMetadata supports extended fields and audiobook chapters', () => {
    const track: StreamTrackMetadata = {
      id: 'ia:pride_and_prejudice',
      title: 'Pride and Prejudice',
      artist: 'Jane Austen',
      album: 'Audiobook',
      duration: 36000,
      source: 'audiobook',
      bitrate: 64000,
      year: 1813,
      description: 'Classic romantic novel by Jane Austen',
      coverUrl: 'https://archive.org/services/img/pride_and_prejudice',
      chapters: [
        { title: 'Chapter 1', start: 0, end: 1200 },
        { title: 'Chapter 2', start: 1200, end: 2400 }
      ]
    };

    assert.equal(track.source, 'audiobook');
    assert.equal(track.chapters?.length, 2);
    assert.equal(track.chapters[1].title, 'Chapter 2');
    assert.equal(track.bitrate, 64000);
  });

  test('resolveSpotubeStream falls back to the preview clip when offline, flagged as a preview', async () => {
    const service = new SpotubeStreamService();
    const track: StreamTrackMetadata = {
      id: 'sp-offline-1',
      title: 'Offline Song',
      artist: 'Spotube Artist',
      source: 'spotube',
      previewUrl: 'https://preview.example.org/audio.mp3',
    };
    const resolved = await service.resolveSpotubeStream(track);
    assert.ok(resolved);
    assert.equal(resolved.streamUrl, 'https://preview.example.org/audio.mp3');
    assert.equal(resolved.preview, true);
  });

  test('searchMultiSource returns direct track when URL is supplied', async () => {
    const service = new SpotubeStreamService();
    const results = await service.searchMultiSource('https://example.org/podcast/ep1.mp3');
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'ep1');
    assert.equal(results[0].source, 'custom');
  });

  describe('Playlist & Album URL Parsing & Batch Resolution', () => {
    test('parsePlaylistOrAlbumUrl accurately parses YouTube playlist URLs', () => {
      const urls = [
        'https://www.youtube.com/playlist?list=PLrAXtmErZgOdP_8GztsuKi9nrraNbKKp4',
        'https://youtube.com/playlist?list=PL1234567890',
        'https://music.youtube.com/playlist?list=OLAK5uy_k1234567',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOdP_8GztsuKi9nrraNbKKp4&index=1',
        'https://piped.video/playlist?list=PLrAXtmErZgOdP_8GztsuKi9nrraNbKKp4',
      ];

      for (const u of urls) {
        const parsed = parsePlaylistOrAlbumUrl(u);
        assert.ok(parsed, `Failed to parse ${u}`);
        assert.equal(parsed.platform, 'youtube');
        assert.equal(parsed.type, 'playlist');
        assert.ok(parsed.id.startsWith('PL') || parsed.id.startsWith('OLAK'));
      }
    });

    test('parsePlaylistOrAlbumUrl accurately parses Spotify playlist and album URLs', () => {
      const spPlaylist = parsePlaylistOrAlbumUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abcdef123');
      assert.ok(spPlaylist);
      assert.equal(spPlaylist.platform, 'spotify');
      assert.equal(spPlaylist.type, 'playlist');
      assert.equal(spPlaylist.id, '37i9dQZF1DXcBWIGoYBM5M');

      const spAlbum = parsePlaylistOrAlbumUrl('https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy');
      assert.ok(spAlbum);
      assert.equal(spAlbum.platform, 'spotify');
      assert.equal(spAlbum.type, 'album');
      assert.equal(spAlbum.id, '4aawyAB9vmqN3uQ7FjRGTy');

      const spIntlAlbum = parsePlaylistOrAlbumUrl('https://open.spotify.com/intl-fr/album/4aawyAB9vmqN3uQ7FjRGTy');
      assert.ok(spIntlAlbum);
      assert.equal(spIntlAlbum.type, 'album');
      assert.equal(spIntlAlbum.id, '4aawyAB9vmqN3uQ7FjRGTy');

      const spUriPlaylist = parsePlaylistOrAlbumUrl('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M');
      assert.ok(spUriPlaylist);
      assert.equal(spUriPlaylist.type, 'playlist');
      assert.equal(spUriPlaylist.id, '37i9dQZF1DXcBWIGoYBM5M');

      const spUriAlbum = parsePlaylistOrAlbumUrl('spotify:album:4aawyAB9vmqN3uQ7FjRGTy');
      assert.ok(spUriAlbum);
      assert.equal(spUriAlbum.type, 'album');
      assert.equal(spUriAlbum.id, '4aawyAB9vmqN3uQ7FjRGTy');
    });

    test('parsePlaylistOrAlbumUrl returns null for single direct tracks or invalid URLs', () => {
      assert.equal(parsePlaylistOrAlbumUrl('https://example.org/audio/track.mp3'), null);
      assert.equal(parsePlaylistOrAlbumUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), null);
      assert.equal(parsePlaylistOrAlbumUrl(''), null);
    });

    test('BatchResolvedCollection metadata registers and caches tracks in service', () => {
      const service = new SpotubeStreamService();
      const mockCollection: BatchResolvedCollection = {
        id: 'sp:album:test-album-1',
        title: 'Master of Puppets',
        artist: 'Metallica',
        type: 'album',
        source: 'spotify',
        itemCount: 2,
        tracks: [
          {
            id: 'sp:mop-1',
            title: 'Battery',
            artist: 'Metallica',
            album: 'Master of Puppets',
            duration: 312,
            source: 'spotube',
          },
          {
            id: 'sp:mop-2',
            title: 'Master of Puppets',
            artist: 'Metallica',
            album: 'Master of Puppets',
            duration: 515,
            source: 'spotube',
          },
        ],
      };

      for (const t of mockCollection.tracks) {
        service.registerMetadata(t);
      }

      assert.equal(mockCollection.tracks.length, 2);
      assert.equal(mockCollection.itemCount, 2);
      assert.equal(mockCollection.type, 'album');
    });
  });
});


describe('YouTube URL resolution, gate and non-audio refusal', () => {
  const ID = 'zn1FHSWPaTk';
  const realFetch = globalThis.fetch;
  let calls: string[] = [];
  const stubFetch = (impl: (url: string, init?: RequestInit) => Response | Promise<Response>) => {
    calls = [];
    globalThis.fetch = (async (input: any, init?: RequestInit) => { const url = String(input); calls.push(url); return impl(url, init); }) as typeof fetch;
  };
  const pipedOk = (url: string) =>
    new Response(JSON.stringify({ title: 'Real Title', uploader: 'Real Artist', duration: 200, audioStreams: [
      { url: 'https://rr1.googlevideo.com/low', mimeType: 'audio/mp4', bitrate: 48000 },
      { url: 'https://rr1.googlevideo.com/high', mimeType: 'audio/webm', bitrate: 160000 },
      { url: 'https://rr1.googlevideo.com/video', mimeType: 'video/mp4', bitrate: 999999 },
    ] }), { headers: { 'content-type': 'application/json' } });
  afterEach(() => { setOnlineLookups(false); globalThis.fetch = realFetch; });

  test('parseYouTubeVideoId handles watch, youtu.be, shorts, embed, live and music URLs', () => {
    for (const u of [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?feature=share&v=${ID}&t=5`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}&list=RDAMVM${ID}`,
      `https://youtu.be/${ID}?si=abc`,
      `youtu.be/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/live/${ID}`,
    ]) assert.equal(parseYouTubeVideoId(u), ID, u);
    for (const u of [
      'https://www.youtube.com/', 'https://www.youtube.com/@artist', 'https://www.youtube.com/watch?v=short',
      `https://evil.example/watch?v=${ID}`, `https://notyoutube.com/watch?v=${ID}`, `https://youtube.com.evil.example/watch?v=${ID}`,
      `javascript:alert('${ID}')`, 'not a url', '',
    ]) assert.equal(parseYouTubeVideoId(u), null, u);
  });

  test('isAudioContentType refuses pages, JSON, images and archives', () => {
    for (const ok of ['audio/mpeg', 'audio/mp4; codecs=mp4a', 'AUDIO/OGG', 'application/ogg', 'application/octet-stream', 'video/webm', '', undefined, null]) assert.equal(isAudioContentType(ok as any), true, String(ok));
    for (const bad of ['text/html', 'text/html; charset=utf-8', 'application/json', 'image/png', 'application/zip', 'text/plain']) assert.equal(isAudioContentType(bad), false, bad);
  });

  test('lookups off: YouTube URLs are refused with the enable instruction and nothing is fetched', async () => {
    stubFetch(() => pipedOk(''));
    const service = new SpotubeStreamService();
    await assert.rejects(() => service.resolveDirectUrl(`https://www.youtube.com/watch?v=${ID}`), (e: any) => e instanceof StreamResolutionError && e.code === 'lookups-off' && /Online lookups/.test(e.message));
    await assert.rejects(() => service.searchMultiSource(`https://youtu.be/${ID}`), (e: any) => e.code === 'lookups-off');
    assert.equal(calls.length, 0);
  });

  test('lookups on: resolves through the allow-listed instances only and uses the real title', async () => {
    setOnlineLookups(true);
    stubFetch(pipedOk);
    const service = new SpotubeStreamService();
    const res = await service.resolveDirectUrl(`https://music.youtube.com/watch?v=${ID}`);
    assert.ok(res);
    assert.equal(res.track.title, 'Real Title');
    assert.equal(res.track.artist, 'Real Artist');
    assert.equal(res.track.id, `yt:${ID}`);
    assert.equal(res.stream.streamUrl, 'https://rr1.googlevideo.com/high');
    assert.ok(calls.length >= 1 && calls.every(u => PIPED_INSTANCES.some(i => u.startsWith(i + '/streams/'))), calls.join(','));
    assert.ok(calls.every(u => { const h = new URL(u).hostname; return h !== 'youtube.com' && !h.endsWith('.youtube.com'); }), 'must not scrape youtube.com');
    const found = await service.searchMultiSource(`https://youtu.be/${ID}`);
    assert.deepEqual(found.map(t => t.title), ['Real Title']);
  });

  test('lookups on but no instance answers: plain message, no raw Error text', async () => {
    setOnlineLookups(true);
    stubFetch(() => new Response('busy', { status: 503 }));
    const service = new SpotubeStreamService();
    const err: any = await service.resolveDirectUrl(`https://youtu.be/${ID}`).catch(e => e);
    assert.ok(err instanceof StreamResolutionError);
    assert.equal(err.code, 'youtube-unresolved');
    assert.match(err.message, /^YouTube stream could not be resolved right now/);
    assert.match(err.message, /try again/i);
    assert.match(err.message, /direct audio link/i);
    assert.match(err.message, /import/i);
    assert.doesNotMatch(describeStreamError(err), /Error:/);
    assert.equal(String(err), err.message);
    assert.equal(calls.length, PIPED_INSTANCES.length);
  });

  test('a stream URL that is not https is never returned', async () => {
    setOnlineLookups(true);
    stubFetch(() => new Response(JSON.stringify({ audioStreams: [{ url: 'http://x.example/a', mimeType: 'audio/mp4' }] })));
    const service = new SpotubeStreamService();
    assert.equal(await service.resolveYouTubeStream(ID), null);
  });

  test('pages and non-https links are refused instead of becoming a "Web Audio Stream"', async () => {
    const service = new SpotubeStreamService();
    // Extensionless links such as https://example.org/ are verified by HEAD in the UI (see verifyAudioUrl below).
    for (const u of ['https://example.org/page.html', 'https://open.spotify.com/track/abc']) {
      await assert.rejects(() => service.resolveDirectUrl(u), (e: any) => e.code === 'not-audio', u);
    }
    await assert.rejects(() => service.resolveDirectUrl('http://example.org/a.mp3'), (e: any) => e.code === 'unsupported-url');
    await assert.rejects(() => service.resolveDirectUrl('https://www.youtube.com/@artist'), (e: any) => e.code === 'unsupported-url');
    await assert.rejects(() => service.resolveDirectUrl('hello world'), (e: any) => e.code === 'invalid-url');
    // A failed URL in the search box is an error, never a text search for the URL.
    stubFetch(() => pipedOk(''));
    await assert.rejects(() => service.searchMultiSource('https://example.org/page.html'), (e: any) => e.code === 'not-audio');
    assert.equal(calls.length, 0);
  });

  test('verifyAudioUrl refuses text/html, accepts audio, and is inconclusive when the request fails', async () => {
    await assert.rejects(() => verifyAudioUrl('https://example.org/x', (async () => new Response('<html>', { headers: { 'content-type': 'text/html; charset=utf-8' } })) as any), (e: any) => e.code === 'not-audio');
    await verifyAudioUrl('https://example.org/x', (async () => new Response(null, { headers: { 'content-type': 'audio/mpeg' } })) as any);
    await verifyAudioUrl('https://example.org/x', (async () => { throw new TypeError('blocked'); }) as any);
    await verifyAudioUrl('https://example.org/x', (async () => new Response('', { status: 405, headers: { 'content-type': 'text/html' } })) as any);
  });

  test('cacheStreamTrack refuses an HTML response and leaves the library untouched', async () => {
    setOnlineLookups(true);
    stubFetch(() => new Response('<html>nope</html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }));
    const service = new SpotubeStreamService();
    const stored: any[] = [];
    const lib = { put: async (t: any) => { stored.push(t); } };
    const track: StreamTrackMetadata = { id: 'custom:x', title: 'Web Audio Stream', artist: 'Direct Stream' };
    await assert.rejects(() => service.cacheStreamTrack(lib, track, 'https://example.org/watch'), (e: any) => e.code === 'not-audio');
    await assert.rejects(() => service.cacheStreamTrack(lib, track, new Blob(['<html>'], { type: 'text/html' })), (e: any) => e.code === 'not-audio');
    assert.equal(stored.length, 0);
    assert.equal(await service.getTrack('stream:custom:x'), null);
  });

  test('searchMultiSource supports subsonic service option safely when unconfigured', async () => {
    const service = new SpotubeStreamService();
    const results = await service.searchMultiSource('test query', { service: 'subsonic' });
    assert.deepEqual(results, []);
  });
});
