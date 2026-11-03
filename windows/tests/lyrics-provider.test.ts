import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTitle, primaryArtist, fetchOnlineLyrics, parseSyncedLyrics, activeLyricLine } from '../src/workspace/lyrics-provider.ts';
import { setOnlineLookups } from '../src/workspace/online-lookups.ts';
import { parseLyrics, activeLine, toLrc, baseName, matchLyricsTrack } from '../src/workspace/lyrics.ts';

async function withMockFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response> | Response,
  run: () => Promise<void>,
): Promise<void> {
  const real = globalThis.fetch;
  setOnlineLookups(true);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    impl(String(input), init)) as typeof fetch;
  try {
    await run();
  } finally {
    setOnlineLookups(false);
    globalThis.fetch = real;
  }
}

test('cleanTitle strips video, audio, lyric, and format markers', () => {
  assert.equal(cleanTitle('Midnight City (Official Video)'), 'Midnight City');
  assert.equal(cleanTitle('Starboy [Audio]'), 'Starboy');
  assert.equal(cleanTitle('Blinding Lights (Live Acoustic Version)'), 'Blinding Lights');
  assert.equal(cleanTitle('Something About Us (Remastered 2021)'), 'Something About Us');
  assert.equal(cleanTitle('Stay (feat. Justin Bieber)'), 'Stay');
  assert.equal(cleanTitle('Levitating ft. DaBaby'), 'Levitating');
  assert.equal(cleanTitle('Plain Song Title'), 'Plain Song Title');
});

test('cleanTitle removes labels in every bracket style, trailing labels and upload suffixes', () => {
  assert.equal(cleanTitle('Song [Remastered 2009]'), 'Song');
  assert.equal(cleanTitle('Song 【Official MV】'), 'Song');
  assert.equal(cleanTitle('Song {Lyric Video}'), 'Song');
  assert.equal(cleanTitle('Song (with Friend)'), 'Song');
  assert.equal(cleanTitle('Song (Feat. Somebody) [Official Audio]'), 'Song');
  assert.equal(cleanTitle('Song featuring Somebody Else'), 'Song');
  assert.equal(cleanTitle('Song - Live at the BBC'), 'Song');
  assert.equal(cleanTitle('Song – Radio Edit'), 'Song');
  assert.equal(cleanTitle('Song - Remastered 2011 - Live'), 'Song');
  assert.equal(cleanTitle('Song | Channel Name | 2024'), 'Song');
  assert.equal(cleanTitle('  Song   (HD)  '), 'Song');
});

test('cleanTitle keeps parts that belong to the song title', () => {
  assert.equal(cleanTitle("(Don't Fear) The Reaper"), "(Don't Fear) The Reaper");
  assert.equal(cleanTitle('Live and Let Die'), 'Live and Let Die');
  assert.equal(cleanTitle('Video Killed the Radio Star (Official Video)'), 'Video Killed the Radio Star');
  assert.equal(cleanTitle('Artist - Song Name'), 'Artist - Song Name');
  assert.equal(cleanTitle('Song (Part 2)'), 'Song (Part 2)');
  assert.equal(cleanTitle('Featherweight'), 'Featherweight');
  assert.equal(cleanTitle('Unclosed (Official Video'), 'Unclosed (Official Video');
  assert.equal(cleanTitle('(Official Video)'), '(Official Video)');
  assert.equal(cleanTitle(''), '');
});

test('primaryArtist extracts lead artist from collaborations', () => {
  assert.equal(primaryArtist('The Weeknd feat. Daft Punk'), 'The Weeknd');
  assert.equal(primaryArtist('Calvin Harris & Dua Lipa'), 'Calvin Harris');
  assert.equal(primaryArtist('Marshmello x Bastille'), 'Marshmello');
  assert.equal(primaryArtist('Queen and David Bowie'), 'Queen');
  assert.equal(primaryArtist('Kendrick Lamar, SZA'), 'Kendrick Lamar');
  assert.equal(primaryArtist('Single Artist'), 'Single Artist');
});

test('parseLyrics handles timestamps, offsets, and rejects malformed values', () => {
  const lrc = '[ti:Song]\n[ar:Someone]\n[00:12.50]First line\n[00:05.00][01:00.00]Chorus\n[00:20.123]<00:20.20>Word <00:21.00>timed\n';
  const l = parseLyrics(lrc);
  assert.equal(l.synced, true);
  assert.deepEqual(l.lines.map(x => x.text), ['Chorus', 'First line', 'Word timed', 'Chorus']);
  assert.deepEqual(l.lines.map(x => x.time), [5, 12.5, 20.123, 60]);

  assert.equal(activeLine(l, 0), -1);
  assert.equal(activeLine(l, 5), 0);
  assert.equal(activeLine(l, 13), 1);
  assert.equal(activeLine(l, 59.9), 2);
  assert.equal(activeLine(l, 600), 3);

  const shifted = parseLyrics('[offset:+500]\n[00:10.00]Late');
  assert.equal(shifted.lines[0].time, 9.5);
  assert.equal(parseLyrics('[offset:-500]\n[00:10.00]Delayed').lines[0].time, 10.5);
  assert.equal(parseLyrics('[offset:+1500]\n[00:01.00]Start').lines[0].time, 0);

  // Reject malformed seconds
  assert.deepEqual(parseLyrics('[00:99]invalid\n[00:02]valid').lines, [{ time: 2, text: 'valid' }]);
  assert.deepEqual(parseLyrics('[00:99][00:03]mixed').lines, [{ time: 3, text: 'mixed' }]);
});

test('cleanTitle stays fast on pathological input', () => {
  const hostile = ' - '.repeat(50000);
  const start = Date.now();
  const out = cleanTitle(hostile);
  assert.ok(Date.now() - start < 500, 'took too long');
  assert.equal(out, hostile.trim());
  const labels = 'Song' + ' - Live'.repeat(20000);
  const t0 = Date.now();
  assert.equal(cleanTitle(labels), labels);
  assert.ok(Date.now() - t0 < 500, 'repeated labels took too long');
  const brackets = cleanTitle('('.repeat(50000));
  assert.equal(brackets.length, 50000);
});

test('cleanTitle removes nested label brackets without a stray character', () => {
  assert.equal(cleanTitle('Song ((Official Video))'), 'Song');
  assert.equal(cleanTitle('Song [(Official Video)]'), 'Song');
});

test('fetchOnlineLyrics returns undefined on network failure without throwing', async () => {
  await withMockFetch(async () => { throw new TypeError('fetch failed'); }, async () => {
    assert.equal(await fetchOnlineLyrics({ title: 'Song', artist: 'Artist', duration: 200 }), undefined);
  });
});

test('fetchOnlineLyrics returns undefined on abort/timeout without throwing', async () => {
  await withMockFetch(async (_url, init) => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    if (init?.signal?.aborted) throw err;
    throw err;
  }, async () => {
    assert.equal(await fetchOnlineLyrics({ title: 'Song', artist: 'Artist' }), undefined);
  });
});

test('fetchOnlineLyrics tolerates unparseable and null JSON bodies', async () => {
  let calls = 0;
  await withMockFetch(async (url) => {
    calls++;
    if (url.includes('/api/get')) return new Response('<html>nope</html>', { status: 200, headers: { 'content-type': 'text/html' } });
    return new Response('null', { status: 200, headers: { 'content-type': 'application/json' } });
  }, async () => {
    assert.equal(await fetchOnlineLyrics({ title: 'Song', artist: 'Artist' }), undefined);
    assert.ok(calls >= 1);
  });

  await withMockFetch(async () => new Response('{', { status: 200 }), async () => {
    assert.equal(await fetchOnlineLyrics({ title: 'Song', artist: 'Artist' }), undefined);
  });
});

test('fetchOnlineLyrics ignores non-array search payloads and sparse entries', async () => {
  await withMockFetch(async (url) => {
    if (url.includes('/api/get')) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ syncedLyrics: 'not-an-array' }), { status: 200 });
  }, async () => {
    assert.equal(await fetchOnlineLyrics({ title: 'Song', artist: 'Artist' }), undefined);
  });

  await withMockFetch(async (url) => {
    if (url.includes('/api/get')) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify([null, { plainLyrics: '  hello  ' }]), { status: 200 });
  }, async () => {
    assert.equal(await fetchOnlineLyrics({ title: 'Song', artist: 'Artist' }), 'hello');
  });
});

test('parseSyncedLyrics reads [mm:ss.xx] boundaries and the line active at that playback time', () => {
  const parsed = parseSyncedLyrics([
    '[00:00.00]Start',
    '[00:59.99]Just before a minute',
    '[01:00.00]One minute',
    '[01:02.50]Centiseconds',
    '[1:02.5]Same instant',
    '[01:02.500]Same instant milliseconds',
  ].join('\n'));
  assert.equal(parsed.syncType, 'LINE_SYNCED');
  assert.equal(parsed.offsetMs, 0);
  assert.deepEqual(parsed.lines.map(line => [line.time, line.text]), [
    [0, 'Start'],
    [59.99, 'Just before a minute'],
    [60, 'One minute'],
    [62.5, 'Centiseconds'],
    [62.5, 'Same instant'],
    [62.5, 'Same instant milliseconds'],
  ]);

  assert.equal(activeLyricLine(parsed, -0.01), null);
  assert.equal(activeLyricLine(parsed, 0)?.text, 'Start');
  assert.equal(activeLyricLine(parsed, 59.98)?.text, 'Start');
  assert.equal(activeLyricLine(parsed, 59.99)?.text, 'Just before a minute');
  assert.equal(activeLyricLine(parsed, 59.995)?.text, 'Just before a minute');
  assert.equal(activeLyricLine(parsed, 60)?.text, 'One minute');
  assert.equal(activeLyricLine(parsed, 62.5)?.text, 'Same instant milliseconds');
  assert.equal(activeLyricLine(parsed, 62.5)?.time, 62.5);
  assert.equal(activeLyricLine(parsed, 1000)?.text, 'Same instant milliseconds');
  assert.equal(activeLyricLine(parsed, Number.NaN), null);
});

test('parseSyncedLyrics drops malformed timestamp tags', () => {
  const parsed = parseSyncedLyrics([
    '[00:60.00]sixty is not a valid seconds field',
    '[00:99]rolled',
    '[00:02.xx]not numbers',
    '[00:01.00.00]extra fraction',
    '[00:03]ok',
    '[00:99][00:04.25]mixed',
    'plain leftover',
  ].join('\n'));
  assert.equal(parsed.syncType, 'LINE_SYNCED');
  assert.deepEqual(parsed.lines.map(line => [line.time, line.text]), [
    [3, 'ok'],
    [4.25, 'mixed'],
  ]);
});

test('parseSyncedLyrics keeps unsynced plain text with no active line', () => {
  const parsed = parseSyncedLyrics('[ti:Song]\nHello\n[00:99]nope\n\nWorld');
  assert.equal(parsed.syncType, 'UNSYNCED');
  assert.equal(parsed.offsetMs, 0);
  assert.deepEqual(parsed.lines.map(line => line.text), ['Hello', 'nope', 'World']);
  assert.equal(activeLyricLine(parsed, 0), null);
  assert.equal(activeLyricLine(parsed, 10), null);
  assert.equal(activeLyricLine(parseSyncedLyrics(''), 1), null);
});

test('parseSyncedLyrics sorts out-of-order timestamps before choosing the active line', () => {
  const parsed = parseSyncedLyrics('[00:30.00]Third\r\n[00:10.00]First\r\n[00:20.00]Second\r\n[00:10.50][00:40.00]Shared');
  assert.deepEqual(parsed.lines.map(line => [line.time, line.text]), [
    [10, 'First'],
    [10.5, 'Shared'],
    [20, 'Second'],
    [30, 'Third'],
    [40, 'Shared'],
  ]);
  assert.equal(activeLyricLine(parsed, 9.9), null);
  assert.equal(activeLyricLine(parsed, 10)?.text, 'First');
  assert.equal(activeLyricLine(parsed, 10.5)?.time, 10.5);
  assert.equal(activeLyricLine(parsed, 15)?.time, 10.5);
  assert.equal(activeLyricLine(parsed, 20)?.text, 'Second');
  assert.equal(activeLyricLine(parsed, 39)?.text, 'Third');
  assert.equal(activeLyricLine(parsed, 40)?.time, 40);
});

test('fetchOnlineLyrics returns synced lyrics from a valid exact match', async () => {
  await withMockFetch(async (url) => {
    assert.ok(url.includes('/api/get'));
    return new Response(JSON.stringify({ syncedLyrics: '[00:01.00]Hi\n' }), { status: 200 });
  }, async () => {
    assert.equal(await fetchOnlineLyrics({ title: 'Song (Official Video)', artist: 'A & B', duration: 120 }), '[00:01.00]Hi');
  });
});
