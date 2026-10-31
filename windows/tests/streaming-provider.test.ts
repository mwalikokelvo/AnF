import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SpotubeStreamService, type StreamTrackMetadata } from '../src/workspace/streaming-provider.js';

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
});
