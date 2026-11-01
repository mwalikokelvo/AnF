import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTitle, primaryArtist } from '../src/workspace/lyrics-provider.ts';
import { parseLyrics, activeLine, toLrc, baseName, matchLyricsTrack } from '../src/workspace/lyrics.ts';

test('cleanTitle strips video, audio, lyric, and format markers', () => {
  assert.equal(cleanTitle('Midnight City (Official Video)'), 'Midnight City');
  assert.equal(cleanTitle('Starboy [Audio]'), 'Starboy');
  assert.equal(cleanTitle('Blinding Lights (Live Acoustic Version)'), 'Blinding Lights');
  assert.equal(cleanTitle('Something About Us (Remastered 2021)'), 'Something About Us');
  assert.equal(cleanTitle('Stay (feat. Justin Bieber)'), 'Stay');
  assert.equal(cleanTitle('Levitating ft. DaBaby'), 'Levitating');
  assert.equal(cleanTitle('Plain Song Title'), 'Plain Song Title');
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
