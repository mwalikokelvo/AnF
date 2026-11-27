import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { searchLocalTracks, createPlaylistFromSearch, formatPlaylist } from '../src/workspace/jarvis/voice/kevo-local-playlist';

const sample: Parameters<typeof searchLocalTracks>[0] = [
  { id: '1', title: 'Jazz Night', artist: 'Miles', genre: 'jazz', path: '/a.mp3' },
  { id: '2', title: 'Rock Anthem', artist: 'Queen', genre: 'rock', path: '/b.mp3' },
  { id: '3', title: 'Focus Flow', artist: 'Ambient', genre: 'ambient', path: '/c.mp3' },
];

describe('Kevo local playlist', () => {
  it('searches by title, artist or genre', () => {
    assert.equal(searchLocalTracks(sample, 'jazz').length, 1);
    assert.equal(searchLocalTracks(sample, 'queen')[0].title, 'Rock Anthem');
    assert.equal(searchLocalTracks(sample, 'ambient').length, 1);
    assert.equal(searchLocalTracks(sample, '').length, 0);
  });

  it('creates a named playlist from a query', () => {
    const pl = createPlaylistFromSearch('Focus', sample, 'ambient');
    assert.equal(pl.name, 'Focus');
    assert.equal(pl.tracks.length, 1);
    assert.equal(pl.tracks[0].title, 'Focus Flow');
  });

  it('formats the result', () => {
    const pl = createPlaylistFromSearch('Mix', sample, 'a');
    const text = formatPlaylist(pl);
    assert.match(text, /Created playlist "Mix"/);
  });
});
