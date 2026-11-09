import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseM3u, serializeM3u, type M3uEntry } from '../src/workspace/m3u';

test('parseM3u parses extended M3U format with duration, artist, and stream URL', () => {
  const content = `#EXTM3U
#EXTINF:210,Solar Fields - Sol
https://stream.example.com/sol.mp3
#EXTINF:180,Carbon Based Lifeforms - World of Sleepers
https://stream.example.com/sleepers.flac
`;

  const entries = parseM3u(content);
  assert.equal(entries.length, 2);

  assert.equal(entries[0].title, 'Sol');
  assert.equal(entries[0].artist, 'Solar Fields');
  assert.equal(entries[0].duration, 210);
  assert.equal(entries[0].uri, 'https://stream.example.com/sol.mp3');
  assert.equal(entries[0].isStream, true);

  assert.equal(entries[1].title, 'World of Sleepers');
  assert.equal(entries[1].artist, 'Carbon Based Lifeforms');
  assert.equal(entries[1].duration, 180);
  assert.equal(entries[1].uri, 'https://stream.example.com/sleepers.flac');
});

test('parseM3u handles live streams with -1 duration and attributes', () => {
  const content = `#EXTM3U
#EXTINF:-1 tvg-logo="https://somafm.com/logo.png" group-title="Ambient",SomaFM - Drone Zone
https://ice1.somafm.com/dronezone-128-mp3
`;

  const entries = parseM3u(content);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, 'Drone Zone');
  assert.equal(entries[0].artist, 'SomaFM');
  assert.equal(entries[0].duration, 0);
  assert.equal(entries[0].logoUrl, 'https://somafm.com/logo.png');
  assert.equal(entries[0].group, 'Ambient');
  assert.equal(entries[0].isStream, true);
});

test('parseM3u derives title from local file paths when #EXTINF is omitted', () => {
  const content = `C:\\Music\\Album\\01_Intro_Track.mp3\n/home/user/music/Another_Song.opus`;
  const entries = parseM3u(content);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].title, '01 Intro Track');
  assert.equal(entries[0].uri, 'C:\\Music\\Album\\01_Intro_Track.mp3');
  assert.equal(entries[0].isStream, false);
  assert.equal(entries[1].title, 'Another Song');
  assert.equal(entries[1].uri, '/home/user/music/Another_Song.opus');
});

test('serializeM3u generates valid standard #EXTM3U format and roundtrips', () => {
  const input = [
    { title: 'Track One', artist: 'Artist A', duration: 125, uri: 'https://stream.org/1.mp3' },
    { title: 'Live Broadcast', duration: 0, uri: 'https://radio.org/live' },
  ];

  const m3uText = serializeM3u(input);
  assert.match(m3uText, /^#EXTM3U/);
  assert.match(m3uText, /#EXTINF:125,Artist A - Track One/);
  assert.match(m3uText, /#EXTINF:-1,Live Broadcast/);

  const parsed = parseM3u(m3uText);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].title, 'Track One');
  assert.equal(parsed[0].artist, 'Artist A');
  assert.equal(parsed[0].duration, 125);
  assert.equal(parsed[1].title, 'Live Broadcast');
});
