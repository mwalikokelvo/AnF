import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileQueue,
  moveTrack,
  shuffled,
  nextTrack,
  previousTrack,
  enqueueTrack,
  playNextTrack,
  removeTrack
} from '../src/workspace/audio-queue.js';

describe('MKR Music Player Engine & Queue Algorithms', () => {
  describe('reconcileQueue', () => {
    test('filters out missing items and preserves valid saved order', () => {
      const saved = ['t1', 't2', 't3'];
      const available = ['t2', 't3', 't4'];
      const result = reconcileQueue(saved, available, false);
      assert.deepEqual(result, ['t2', 't3']);
    });

    test('appends new available items when includeNew is true', () => {
      const saved = ['t1', 't2'];
      const available = ['t2', 't3', 't4'];
      const result = reconcileQueue(saved, available, true);
      assert.deepEqual(result, ['t2', 't3', 't4']);
    });

    test('deduplicates items in queue', () => {
      const saved = ['t1', 't2', 't2', 't1'];
      const available = ['t1', 't2'];
      const result = reconcileQueue(saved, available, true);
      assert.deepEqual(result, ['t1', 't2']);
    });
  });

  describe('nextTrack', () => {
    const q = ['track-1', 'track-2', 'track-3'];

    test('returns next track in sequential order', () => {
      assert.equal(nextTrack(q, 'track-1', 'off', false), 'track-2');
      assert.equal(nextTrack(q, 'track-2', 'off', false), 'track-3');
    });

    test('repeat "off" returns undefined at end of queue', () => {
      assert.equal(nextTrack(q, 'track-3', 'off', false), undefined);
    });

    test('repeat "all" wraps to first track at end of queue', () => {
      assert.equal(nextTrack(q, 'track-3', 'all', false), 'track-1');
    });

    test('repeat "track" returns current track on automatic transition', () => {
      assert.equal(nextTrack(q, 'track-2', 'track', true), 'track-2');
    });

    test('repeat "track" advances to next track on manual skip', () => {
      assert.equal(nextTrack(q, 'track-2', 'track', false), 'track-3');
    });

    test('empty queue returns undefined', () => {
      assert.equal(nextTrack([], 'track-1', 'all', false), undefined);
    });
  });

  describe('previousTrack', () => {
    const q = ['track-1', 'track-2', 'track-3'];

    test('returns preceding track in queue', () => {
      assert.equal(previousTrack(q, 'track-3', 'off'), 'track-2');
      assert.equal(previousTrack(q, 'track-2', 'off'), 'track-1');
    });

    test('repeat "off" returns undefined at start of queue', () => {
      assert.equal(previousTrack(q, 'track-1', 'off'), undefined);
    });

    test('repeat "all" wraps to last track at start of queue', () => {
      assert.equal(previousTrack(q, 'track-1', 'all'), 'track-3');
    });

    test('repeat "track" returns current track at start of queue', () => {
      assert.equal(previousTrack(q, 'track-1', 'track'), 'track-1');
    });

    test('empty queue returns undefined', () => {
      assert.equal(previousTrack([], 'track-1', 'all'), undefined);
    });
  });

  describe('queue mutations', () => {
    test('moveTrack moves element to target index safely', () => {
      const q = ['a', 'b', 'c', 'd'];
      assert.deepEqual(moveTrack(q, 'a', 2), ['b', 'c', 'a', 'd']);
      assert.deepEqual(moveTrack(q, 'd', 0), ['d', 'a', 'b', 'c']);
    });

    test('enqueueTrack appends track to end if not present', () => {
      const q = ['a', 'b'];
      assert.deepEqual(enqueueTrack(q, 'c'), ['a', 'b', 'c']);
      assert.deepEqual(enqueueTrack(q, 'a'), ['a', 'b']);
    });

    test('playNextTrack inserts track immediately after current playing track', () => {
      const q = ['a', 'b', 'c'];
      assert.deepEqual(playNextTrack(q, 'a', 'd'), ['a', 'd', 'b', 'c']);
      assert.deepEqual(playNextTrack(q, 'b', 'd'), ['a', 'b', 'd', 'c']);
      assert.deepEqual(playNextTrack(q, undefined, 'd'), ['d', 'a', 'b', 'c']);
    });

    test('removeTrack removes track by id', () => {
      const q = ['a', 'b', 'c'];
      assert.deepEqual(removeTrack(q, 'b'), ['a', 'c']);
      assert.deepEqual(removeTrack(q, 'missing'), ['a', 'b', 'c']);
    });

    test('shuffled randomizes order while preserving all items', () => {
      const q = ['1', '2', '3', '4', '5'];
      const s = shuffled(q);
      assert.equal(s.length, q.length);
      assert.deepEqual(new Set(s), new Set(q));
    });
  });
});
