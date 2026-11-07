import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isBrokenStreamEntry,
  findBrokenStreamEntries,
  pruneIdsFromPlaylistOrders,
} from '../src/workspace/streaming-provider.js';

const bad = (over: Record<string, unknown> = {}) => ({
  id: 'stream:custom:abc',
  title: 'Web Audio Stream',
  artist: 'Direct Stream',
  format: 'text/html; charset=utf-8',
  blob: { type: 'text/html' },
  ...over,
});

describe('broken stream entry detection', () => {
  test('matches the HTML placeholder entry', () => {
    assert.equal(isBrokenStreamEntry(bad()), true);
    assert.equal(isBrokenStreamEntry(bad({ blob: { type: '' }, format: 'application/json' })), true);
  });

  test('never matches legitimate or merely similar entries', () => {
    assert.equal(isBrokenStreamEntry(bad({ blob: { type: 'audio/mpeg' }, format: 'audio/mpeg' })), false, 'real audio with the same title');
    assert.equal(isBrokenStreamEntry(bad({ blob: { type: 'application/octet-stream' }, format: undefined })), false);
    assert.equal(isBrokenStreamEntry(bad({ blob: { type: '' }, format: undefined })), false, 'no recorded type');
    assert.equal(isBrokenStreamEntry(bad({ title: 'Web Audio Stream 2' })), false);
    assert.equal(isBrokenStreamEntry(bad({ title: 'web audio stream' })), false);
    assert.equal(isBrokenStreamEntry(bad({ artist: 'Some Artist' })), false);
    assert.equal(isBrokenStreamEntry(bad({ title: 'Podcast about HTML', artist: 'Host' })), false);
    assert.equal(isBrokenStreamEntry({ title: 'Song', artist: 'A', blob: { type: 'text/html' } }), false);
    assert.equal(isBrokenStreamEntry({}), false);
    assert.equal(isBrokenStreamEntry(bad({ title: undefined })), false);
  });

  test('findBrokenStreamEntries returns only the bad ones and does not mutate', () => {
    const list = [
      bad({ id: 'a' }),
      { id: 'b', title: 'Song', artist: 'X', format: 'audio/flac', blob: { type: 'audio/flac' } },
      bad({ id: 'c', blob: { type: 'audio/mp4' }, format: 'audio/mp4' }),
      bad({ id: 'd', blob: { type: 'text/plain' }, format: 'text/plain' }),
    ];
    const copy = [...list];
    assert.deepEqual(findBrokenStreamEntries(list).map(t => t.id), ['a', 'd']);
    assert.deepEqual(list, copy);
  });

  test('pruneIdsFromPlaylistOrders removes ids from playlist orders only', () => {
    const playlists = [
      { id: 'p1', name: 'A', order: ['a', 'b', 'c'] },
      { id: 'p2', name: 'B', order: ['x', 'y'] },
      { id: 'p3', name: 'C', order: ['b'] },
    ];
    const copy = playlists.map(p => ({ ...p, order: [...p.order] }));
    const ids = new Set(['a', 'b', 'missing']);
    assert.deepEqual(pruneIdsFromPlaylistOrders(playlists, ids), [
      { id: 'p1', name: 'A', order: ['c'] },
      { id: 'p3', name: 'C', order: [] },
    ]);
    assert.deepEqual(playlists, copy);
  });
});
