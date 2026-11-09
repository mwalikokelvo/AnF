import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  audiusStreamUrl,
  parseAudiusTracks,
  searchAudius,
  trendingAudius,
  type AudiusTrack,
} from '../src/workspace/audius';

describe('Audius Music Service Integration', () => {
  test('audiusStreamUrl generates standard Discovery stream endpoint', () => {
    const url = audiusStreamUrl('test-track-123');
    assert.equal(url, 'https://discoveryprovider.audius.co/v1/tracks/test-track-123/stream?app_name=AnF');
  });

  test('parseAudiusTracks handles valid track objects correctly', () => {
    const raw = [
      {
        id: 'AK3w5q0',
        title: 'Cyberpunk Bass',
        user: { name: 'Producer One', handle: 'prod1' },
        duration: 215,
        artwork: { '480x480': 'https://example.org/art-480.jpg', '150x150': 'https://example.org/art-150.jpg' },
        genre: 'Electronic',
      },
    ];

    const tracks = parseAudiusTracks(raw);
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].id, 'AK3w5q0');
    assert.equal(tracks[0].title, 'Cyberpunk Bass');
    assert.equal(tracks[0].artist, 'Producer One');
    assert.equal(tracks[0].duration, 215);
    assert.equal(tracks[0].artworkUrl, 'https://example.org/art-480.jpg');
    assert.equal(tracks[0].genre, 'Electronic');
    assert.equal(tracks[0].streamUrl, 'https://discoveryprovider.audius.co/v1/tracks/AK3w5q0/stream?app_name=AnF');
  });

  test('parseAudiusTracks handles missing or null metadata gracefully', () => {
    const raw = [
      null,
      {},
      { id: 'track-2' },
      { id: 'track-3', title: '', user: null, duration: null },
    ];

    const tracks = parseAudiusTracks(raw);
    assert.equal(tracks.length, 2);
    assert.equal(tracks[0].id, 'track-2');
    assert.equal(tracks[0].title, 'Untitled Track');
    assert.equal(tracks[0].artist, 'Unknown Artist');
    assert.equal(tracks[0].duration, 0);
  });

  test('searchAudius queries Discovery endpoint with encoded query', async () => {
    let capturedUrl = '';
    const mockFetch = async (url: RequestInfo | URL) => {
      capturedUrl = String(url);
      return {
        ok: true,
        json: async () => ({
          data: [
            { id: 'q1', title: 'Song Found', user: { name: 'Search Artist' }, duration: 180 },
          ],
        }),
      } as Response;
    };

    const results = await searchAudius('synth wave', 10, mockFetch as any);
    assert.match(capturedUrl, /tracks\/search\?query=synth%20wave&app_name=AnF&limit=10/);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'Song Found');
  });

  test('trendingAudius queries Discovery trending endpoint', async () => {
    let capturedUrl = '';
    const mockFetch = async (url: RequestInfo | URL) => {
      capturedUrl = String(url);
      return {
        ok: true,
        json: async () => ({
          data: [
            { id: 't1', title: 'Top Hit', user: { handle: 'tophit' }, duration: 200 },
          ],
        }),
      } as Response;
    };

    const results = await trendingAudius(15, mockFetch as any);
    assert.match(capturedUrl, /tracks\/trending\?app_name=AnF&limit=15/);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'Top Hit');
  });

  test('searchAudius handles empty queries without calling network', async () => {
    let called = false;
    const mockFetch = async () => {
      called = true;
      return {} as Response;
    };

    const results = await searchAudius('   ', 10, mockFetch as any);
    assert.equal(called, false);
    assert.equal(results.length, 0);
  });

  test('searchAudius and trendingAudius configure timeout signal and failover across nodes', async () => {
    const attemptedNodes: string[] = [];
    let signalCaptured: any = null;
    const mockFetch = async (url: RequestInfo | URL, init?: RequestInit) => {
      attemptedNodes.push(String(url));
      signalCaptured = init?.signal;
      if (String(url).includes('discoveryprovider.audius.co')) {
        return { ok: false, status: 503 } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          data: [{ id: 'alt-1', title: 'Backup Node Track', user: { name: 'Backup' }, duration: 120 }],
        }),
      } as Response;
    };

    const tracks = await trendingAudius(10, mockFetch as any);
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].title, 'Backup Node Track');
    assert.equal(attemptedNodes.length, 2);
    assert.ok(signalCaptured, 'AbortSignal timeout should be provided');
  });

  test('trendingAudius throws clean error when all nodes fail without hanging', async () => {
    const mockFetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    await assert.rejects(trendingAudius(10, mockFetch as any), /Failed to fetch|All Audius discovery nodes failed/);
  });
});
