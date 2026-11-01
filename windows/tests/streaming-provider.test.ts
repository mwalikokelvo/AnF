import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SpotubeStreamService,
  parsePlaylistOrAlbumUrl,
  type StreamTrackMetadata,
  type BatchResolvedCollection
} from '../src/workspace/streaming-provider.js';

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

  test('resolveSpotubeStream falls back to existing preview stream URL when offline', async () => {
    const service = new SpotubeStreamService();
    const track: StreamTrackMetadata = {
      id: 'sp-offline-1',
      title: 'Offline Song',
      artist: 'Spotube Artist',
      source: 'spotube',
      streamUrl: 'https://preview.example.org/audio.mp3',
    };
    const resolved = await service.resolveSpotubeStream(track);
    assert.ok(resolved);
    assert.equal(resolved.streamUrl, 'https://preview.example.org/audio.mp3');
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

