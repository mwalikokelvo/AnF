import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SpotubeStreamService } from '../src/workspace/streaming-provider.js';
import { setOnlineLookups } from '../src/workspace/online-lookups.js';

const realFetch = globalThis.fetch;
afterEach(() => { setOnlineLookups(false); globalThis.fetch = realFetch; });

test('Internet Archive audiobook: resolves to a single mp3 file, never invents chapter starts or falls back to the zip', async () => {
  setOnlineLookups(true);
  globalThis.fetch = (async (input: any) => {
    const u = new URL(String(input));
    if (u.hostname === 'archive.org' && u.pathname === '/metadata/book_one/files') {
      return new Response(JSON.stringify({ result: [{ name: 'book_one_64kb_mp3.zip', format: '64Kbps MP3 ZIP' }, { name: 'book_one_01.mp3', format: 'VBR MP3' }, { name: 'book_one_02.mp3', format: 'VBR MP3' }] }), { headers: { 'content-type': 'application/json' } });
    }
    return new Response('x', { status: 503 });
  }) as typeof fetch;
  const service = new SpotubeStreamService();
  service.registerMetadata({ id: 'ia:book_one', title: 'Book One', artist: 'A', source: 'audiobook', streamUrl: 'https://archive.org/download/book_one/book_one_64kb_mp3.zip' });
  const resolved = await service.resolveInternetArchiveStream('ia:book_one');
  assert.equal(resolved?.streamUrl, 'https://archive.org/download/book_one/book_one_01.mp3');
  assert.equal(resolved?.mimeType, 'audio/mpeg');
  const meta = await service.getTrack('ia:book_one');
  assert.equal(meta?.chapters, undefined, 'files are not positions inside one stream, so no chapter starts');
});

test('Internet Archive audiobook: when the file list is unavailable nothing is resolved (a zip is not audio)', async () => {
  setOnlineLookups(true);
  globalThis.fetch = (async () => new Response('x', { status: 503 })) as typeof fetch;
  const service = new SpotubeStreamService();
  assert.equal(await service.resolveInternetArchiveStream('ia:book_one'), null);
});

test('audiobook search results carry no stream URL (the only one the archive lists up front is a zip)', async () => {
  setOnlineLookups(true);
  globalThis.fetch = (async (input: any) => {
    const u = new URL(String(input));
    if (u.hostname === 'archive.org' && u.pathname === '/advancedsearch.php') {
      return new Response(JSON.stringify({ response: { docs: [{ identifier: 'book_one', title: 'Book One', creator: 'A' }] } }), { headers: { 'content-type': 'application/json' } });
    }
    return new Response('x', { status: 503 });
  }) as typeof fetch;
  const found = await new SpotubeStreamService().searchAudiobooks('book one');
  const ia = found.find(t => t.id === 'ia:book_one');
  assert.ok(ia);
  assert.equal(ia.streamUrl, undefined);
});
