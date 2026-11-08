import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreTrackMood,
  generateSmartMix,
  listAvailableMixes,
  exportMixToM3u,
} from '../src/workspace/smart-mix.js';
import type { AudioTrack } from '../src/workspace/audio-library.js';

test('Spotify-Class Smart Mixes & Mood Flow Engine', async (t) => {
  const tracks: AudioTrack[] = [
    {
      id: 't-1',
      title: 'Weightless Ambient',
      artist: 'Marconi Union',
      name: 'weightless.mp3',
      blob: new Blob([]),
      created: 1000,
      duration: 480,
      genre: 'Ambient',
      lyrics: undefined,
    },
    {
      id: 't-2',
      title: 'Hard Rock Anthem',
      artist: 'Guitar Legends',
      name: 'rock.mp3',
      blob: new Blob([]),
      created: 2000,
      duration: 210,
      genre: 'Rock',
      lyrics: '[00:10.00]Yeah rock and roll',
    },
    {
      id: 't-3',
      title: 'Midnight Jazz Club',
      artist: 'Smooth Trio',
      name: 'jazz.flac',
      blob: new Blob([]),
      created: 3000,
      duration: 260,
      genre: 'Jazz',
      lyrics: undefined,
    },
    {
      id: 't-4',
      title: '1984 Cyberpunk City',
      artist: 'Retro Synth',
      name: 'retro.mp3',
      blob: new Blob([]),
      created: 4000,
      duration: 190,
      year: 1984,
      genre: 'Synthwave',
    },
    {
      id: 't-5',
      title: 'Chapter 1: The Fellowship',
      artist: 'J.R.R. Tolkien',
      name: 'lotr.m4b',
      blob: new Blob([]),
      created: 5000,
      duration: 1800,
      kind: 'audiobook',
      chapters: [{ title: 'Intro', start: 0 }],
    },
  ];

  await t.test('scoreTrackMood correctly scores genres and audio characteristics', () => {
    // Focus mood should score ambient track highest
    const focusScore = scoreTrackMood(tracks[0], 'focus');
    assert.ok(focusScore >= 70);

    // Energy mood should score rock track highest
    const energyScore = scoreTrackMood(tracks[1], 'energy');
    assert.ok(energyScore >= 70);

    // Chill mood should score jazz track highest
    const chillScore = scoreTrackMood(tracks[2], 'chill');
    assert.ok(chillScore >= 50);

    // Spoken mood should score audiobook 100
    const spokenScore = scoreTrackMood(tracks[4], 'spoken');
    assert.equal(spokenScore, 100);

    // Decades mood should score 1984 track highest
    const decadesScore = scoreTrackMood(tracks[3], 'decades');
    assert.equal(decadesScore, 80);
  });

  await t.test('generateSmartMix partitions and caps tracks cleanly', () => {
    const focusMix = generateSmartMix(tracks, 'focus');
    assert.equal(focusMix.mood, 'focus');
    assert.equal(focusMix.title, 'Deep Focus Flow');
    assert.ok(focusMix.tracks.length >= 1);
    assert.equal(focusMix.tracks[0].id, 't-1');
    assert.equal(focusMix.totalDurationSeconds, 480);
  });

  await t.test('listAvailableMixes returns non-empty summaries for library', () => {
    const mixes = listAvailableMixes(tracks);
    assert.ok(mixes.length >= 4);
    assert.ok(mixes.some(m => m.mood === 'focus'));
    assert.ok(mixes.some(m => m.mood === 'energy'));
    assert.ok(mixes.some(m => m.mood === 'spoken'));
  });

  await t.test('exportMixToM3u formats valid extended M3U file', () => {
    const mix = generateSmartMix(tracks, 'energy');
    const m3u = exportMixToM3u(mix);
    assert.match(m3u, /^#EXTM3U/);
    assert.match(m3u, /#PLAYLIST:High Energy Cardio/);
    assert.match(m3u, /#EXTINF:210,Guitar Legends - Hard Rock Anthem/);
    assert.match(m3u, /rock\.mp3/);
  });
});
