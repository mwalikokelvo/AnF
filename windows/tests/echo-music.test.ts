import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EchoLyricsOrchestrator,
  parseLrcTimestamps,
  type TrackLyricsQuery,
} from '../src/workspace/echo-lyrics-orchestrator';

import {
  EchoMusicDnaService,
  type MusicDnaRecord,
} from '../src/workspace/echo-music-dna';

import {
  rankMusicFlowCandidates,
  filterMusicFlowCandidates,
  trackKeyOf,
  DEFAULT_MUSIC_FLOW_CONFIG,
  type MusicFlowItem,
} from '../src/workspace/music-flow';

import { EchoCanvasService } from '../src/workspace/echo-canvas';

describe('Echo Music Subsystem & REA Reverse-Engineered Architecture', () => {

  describe('Multi-Provider Lyrics Parsing & Orchestration', () => {
    it('parseLrcTimestamps parses multi-timestamp lines and sorts chronologically', () => {
      const rawLrc = `
[ti:Echo Reverie]
[ar:Echo Artist]
[offset:500]
[00:10.00]First line of lyrics
[00:25.50][00:05.00]Repeated chorus hook
[00:40.00]Closing outro
      `.trim();

      const parsed = parseLrcTimestamps(rawLrc);
      assert.equal(parsed.syncType, 'LINE_SYNCED');
      assert.equal(parsed.offsetMs, 500);
      assert.equal(parsed.lines.length, 4);

      // Verify chronological sorting with offset:
      // 00:05.00 + 0.5s offset = 5.5s
      assert.equal(parsed.lines[0].time, 5.5);
      assert.equal(parsed.lines[0].text, 'Repeated chorus hook');

      // 00:10.00 + 0.5s = 10.5s
      assert.equal(parsed.lines[1].time, 10.5);
      assert.equal(parsed.lines[1].text, 'First line of lyrics');

      // 00:25.50 + 0.5s = 26.0s
      assert.equal(parsed.lines[2].time, 26.0);
      assert.equal(parsed.lines[2].text, 'Repeated chorus hook');

      // 00:40.00 + 0.5s = 40.5s
      assert.equal(parsed.lines[3].time, 40.5);
      assert.equal(parsed.lines[3].text, 'Closing outro');
    });

    it('EchoLyricsOrchestrator generates normalized cache keys', () => {
      const orchestrator = new EchoLyricsOrchestrator();
      const key1 = orchestrator.getCacheKey({
        title: 'Starboy (Official Music Video) [4K]',
        artist: 'The Weeknd feat. Daft Punk',
      });
      const key2 = orchestrator.getCacheKey({
        title: 'Starboy',
        artist: 'The Weeknd',
      });
      assert.equal(key1, key2);
      assert.equal(key1, 'starboy::the weeknd');
    });

    it('TTML to LRC parser converts subtitle XML into timestamped LRC lines', () => {
      const orchestrator = new EchoLyricsOrchestrator() as any;
      const ttml = `
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p begin="00:12.34" end="00:15.00">Welcome to the soundscape</p>
      <p begin="00:18.50" end="00:22.00">Echoing across the night</p>
    </div>
  </body>
</tt>
      `.trim();

      const lrc = orchestrator.ttmlToLrc(ttml);
      assert.ok(lrc.includes('[00:12.34] Welcome to the soundscape'));
      assert.ok(lrc.includes('[00:18.50] Echoing across the night'));

      const parsed = parseLrcTimestamps(lrc);
      assert.equal(parsed.lines.length, 2);
      assert.equal(parsed.lines[0].time, 12.34);
      assert.equal(parsed.lines[0].text, 'Welcome to the soundscape');
    });
  });

  describe('Music DNA Backstory & Annotations Engine', () => {
    it('getCacheKey strips promotional tags and normalizes artist', () => {
      const dnaService = new EchoMusicDnaService();
      const key = dnaService.getCacheKey('Midnight City (Remastered 2024)', 'M83 feat. Friends');
      assert.equal(key, 'midnight city::m83');
    });

    it('fetchMusicDna returns structured fallback record when offline', async () => {
      const dnaService = new EchoMusicDnaService();
      // Emulate offline
      const origNavigator = globalThis.navigator;
      try {
        Object.defineProperty(globalThis, 'navigator', {
          value: { onLine: false },
          configurable: true,
        });

        const record = await dnaService.fetchMusicDna({
          title: 'Comfortably Numb',
          artist: 'Pink Floyd',
          album: 'The Wall',
        });

        assert.equal(record.songTitle, 'Comfortably Numb');
        assert.equal(record.artistName, 'Pink Floyd');
        assert.equal(record.albumName, 'The Wall');
        assert.equal(record.source, 'offline');
        assert.ok(record.meaning.includes('Offline'));
      } finally {
        Object.defineProperty(globalThis, 'navigator', {
          value: origNavigator,
          configurable: true,
        });
      }
    });
  });

  describe('Music Flow Candidate Filtering & Ranking Engine', () => {
    const candidates: MusicFlowItem[] = [
      { id: '1', title: 'Song A1', artist: 'Artist One', source: 'HISTORY' },
      { id: '2', title: 'Song A2', artist: 'Artist One', source: 'LIKED' },
      { id: '3', title: 'Song B1', artist: 'Artist Two', source: 'QUICK_PICKS' },
      { id: '4', title: 'Song B2', artist: 'Artist Two', source: 'CATALOG' },
      { id: '5', title: 'Song C1', artist: 'Artist Three', source: 'OFFLINE' },
      { id: '6', title: 'Song D1', artist: 'Artist Four', source: 'HISTORY' },
    ];

    it('filterMusicFlowCandidates deduplicates by ID and track key', () => {
      const dupCandidates: MusicFlowItem[] = [
        { id: '1', title: 'Song A', artist: 'Artist X', source: 'CATALOG' },
        { id: '1', title: 'Song A Duplicate ID', artist: 'Artist X', source: 'CATALOG' },
        { id: '2', title: 'Song A (Audio)', artist: 'Artist X', source: 'CATALOG' },
        { id: '3', title: 'Song B', artist: 'Artist Y', source: 'CATALOG' },
      ];

      const filtered = filterMusicFlowCandidates(dupCandidates);
      assert.equal(filtered.length, 2);
      assert.equal(filtered[0].id, '1');
      assert.equal(filtered[1].id, '3');
    });

    it('rankMusicFlowCandidates enforces artist spacing rule (spacing = 2)', () => {
      // Multiple tracks from Artist One and Artist Two
      const ranked = rankMusicFlowCandidates(candidates, [], new Set(), new Set(), {
        ...DEFAULT_MUSIC_FLOW_CONFIG,
        artistSpacing: 2,
      });

      // Verify that no two consecutive items share the same primary artist
      for (let i = 0; i < ranked.length - 1; i++) {
        const curArtist = ranked[i].artist.toLowerCase();
        const nextArtist = ranked[i + 1].artist.toLowerCase();
        assert.notEqual(curArtist, nextArtist, `Artist ${curArtist} was placed consecutively at ${i} and ${i+1}`);
      }
    });

    it('rankMusicFlowCandidates boosts liked artists and penalizes less-liked artists', () => {
      const likedArtists = new Set(['artist four']);
      const lessLikeArtists = new Set(['artist one']);

      const ranked = rankMusicFlowCandidates(candidates, [], likedArtists, lessLikeArtists);
      // Artist Four (Song D1) has likedArtistBoost (+1.0) on top of HISTORY (0.6) = 1.6
      // It should rank higher than Song A1 (Artist One penalized by 2.5)
      const d1Index = ranked.findIndex(r => r.id === '6');
      const a1Index = ranked.findIndex(r => r.id === '1');
      assert.ok(d1Index < a1Index, 'Liked artist should rank before penalized artist');
    });
  });

  describe('Echo Canvas Ambient Artwork Provider', () => {
    it('getCanvasUrl matches track and artist accurately', async () => {
      const canvasService = new EchoCanvasService();
      // Inject mock manifest
      (canvasService as any).manifestCache = [
        { song: 'Blinding Lights', artist: 'The Weeknd', url: 'https://canvas.echomusic.fun/blinding_lights.mp4' },
        { song: 'Midnight City', artist: 'M83', url: 'https://canvas.echomusic.fun/midnight_city.mp4' },
      ];
      (canvasService as any).cacheExpiresAt = Date.now() + 60000;

      const url = await canvasService.getCanvasUrl('Blinding Lights (Official Audio)', 'The Weeknd');
      assert.equal(url, 'https://canvas.echomusic.fun/blinding_lights.mp4');

      const noMatch = await canvasService.getCanvasUrl('Unknown Track XYZ', 'Unknown Artist');
      assert.equal(noMatch, null);
    });
  });

});
