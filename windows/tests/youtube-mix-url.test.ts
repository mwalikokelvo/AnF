import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SpotubeStreamService, parseYouTubeVideoId, parsePlaylistOrAlbumUrl } from '../src/workspace/streaming-provider.js';
import { setOnlineLookups } from '../src/workspace/online-lookups.js';

const ID = 'b8CMDOzLi9Q';
const MIX = `https://www.youtube.com/watch?v=${ID}&list=RD${ID}&start_radio=1&pp=0gcJCfwAo7VqN5tD`;
const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } });

describe('a watch URL with a radio mix list', () => {
  test('the video id is extracted and the mix params are ignored', () => {
    assert.equal(parseYouTubeVideoId(MIX), ID);
    assert.equal(parseYouTubeVideoId(`https://music.youtube.com/watch?v=${ID}&list=RDAMVM${ID}`), ID);
    assert.equal(parseYouTubeVideoId(`https://youtu.be/${ID}?list=RD${ID}&start_radio=1`), ID);
  });

  test('auto-generated mixes (RD...) are not playlist imports; real lists still are', () => {
    assert.equal(parsePlaylistOrAlbumUrl(MIX), null);
    assert.equal(parsePlaylistOrAlbumUrl(`https://www.youtube.com/watch?v=${ID}&list=RDMM`), null);
    assert.equal(parsePlaylistOrAlbumUrl(`https://www.youtube.com/playlist?list=RDEM${ID}`), null);
    assert.equal(parsePlaylistOrAlbumUrl('https://music.youtube.com/playlist?list=RDCLAK5uy_abc123')?.id, 'RDCLAK5uy_abc123');
    assert.equal(parsePlaylistOrAlbumUrl(`https://www.youtube.com/watch?v=${ID}&list=PLrAXtmErZgOdP_8GztsuKi9nrraNbKKp4`)?.id, 'PLrAXtmErZgOdP_8GztsuKi9nrraNbKKp4');
  });

  test('a list= on a non-YouTube host is not a YouTube playlist', () => {
    assert.equal(parsePlaylistOrAlbumUrl('https://example.org/song.mp3?list=PLabc123'), null);
    assert.equal(parsePlaylistOrAlbumUrl('https://youtube.com.evil.test/watch?list=PLabc123'), null);
  });

  describe('searching/pasting it', () => {
    const realFetch = globalThis.fetch;
    afterEach(() => { setOnlineLookups(false); globalThis.fetch = realFetch; });
    test('resolves the single video, never asks an instance for a playlist', async () => {
      setOnlineLookups(true);
      const calls: string[] = [];
      globalThis.fetch = (async (input: any) => {
        calls.push(String(input));
        if (String(input).includes('/playlists/')) return new Response('nope', { status: 500 });
        return json({ title: 'The Song', uploader: 'The Band', duration: 200, audioStreams: [{ url: 'https://rr1.googlevideo.com/a', mimeType: 'audio/mp4', bitrate: 128000 }] });
      }) as typeof fetch;
      const found = await new SpotubeStreamService().searchMultiSource(MIX);
      assert.deepEqual(found.map(t => t.id), [`yt:${ID}`]);
      assert.ok(calls.length > 0 && calls.every(c => !c.includes('/playlists/') && !c.includes('list=')), calls.join(' '));
    });
  });
});
