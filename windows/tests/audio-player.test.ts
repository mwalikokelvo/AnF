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
  playPreviousTrack,
  removeTrack,
  type RepeatMode
} from '../src/workspace/audio-queue.js';
import type { AudioTrack } from '../src/workspace/audio-library.js';
import { trackBadge, createVisualizer } from '../src/workspace/music-hub.js';

describe('MKR Music Player Engine & Audio Queue Controls', () => {
  describe('Queue Algorithms & Navigation', () => {
    const queue = ['track-1', 'track-2', 'track-3', 'track-4'];

    test('reconcileQueue keeps valid subset and appends new tracks when flag set', () => {
      const saved = ['track-1', 'deleted-track', 'track-2'];
      const available = ['track-1', 'track-2', 'track-3'];
      assert.deepEqual(reconcileQueue(saved, available, false), ['track-1', 'track-2']);
      assert.deepEqual(reconcileQueue(saved, available, true), ['track-1', 'track-2', 'track-3']);
    });

    test('reconcileQueue deduplicates redundant occurrences', () => {
      const saved = ['a', 'b', 'a', 'c', 'b'];
      const available = ['a', 'b', 'c'];
      assert.deepEqual(reconcileQueue(saved, available, true), ['a', 'b', 'c']);
    });

    test('nextTrack: advances sequentially in repeat "off"', () => {
      assert.equal(nextTrack(queue, 'track-1', 'off', false), 'track-2');
      assert.equal(nextTrack(queue, 'track-3', 'off', false), 'track-4');
      assert.equal(nextTrack(queue, 'track-4', 'off', false), undefined);
    });

    test('nextTrack: wraps to queue start in repeat "all"', () => {
      assert.equal(nextTrack(queue, 'track-4', 'all', false), 'track-1');
    });

    test('nextTrack: repeats current track on automatic transition in repeat "track"', () => {
      assert.equal(nextTrack(queue, 'track-2', 'track', true), 'track-2');
      assert.equal(nextTrack(queue, 'track-2', 'track', false), 'track-3');
    });

    test('previousTrack: returns previous track when index > 0', () => {
      assert.equal(previousTrack(queue, 'track-3', 'off'), 'track-2');
      assert.equal(previousTrack(queue, 'track-2', 'off'), 'track-1');
    });

    test('previousTrack: repeat "off" returns undefined at start of queue', () => {
      assert.equal(previousTrack(queue, 'track-1', 'off'), undefined);
    });

    test('previousTrack: repeat "all" wraps to end of queue at start of queue', () => {
      assert.equal(previousTrack(queue, 'track-1', 'all'), 'track-4');
    });

    test('previousTrack: repeat "track" returns current track at start of queue', () => {
      assert.equal(previousTrack(queue, 'track-1', 'track'), 'track-1');
    });

    test('previousTrack: empty queue returns undefined', () => {
      assert.equal(previousTrack([], 'track-1', 'all'), undefined);
    });

    test('previousTrack: undefined current returns first track', () => {
      assert.equal(previousTrack(queue, undefined, 'off'), 'track-1');
    });
  });

  describe('Queue Helper Operations', () => {
    test('enqueueTrack adds new track and deduplicates existing track', () => {
      const base = ['t1', 't2'];
      assert.deepEqual(enqueueTrack(base, 't3'), ['t1', 't2', 't3']);
      assert.deepEqual(enqueueTrack(base, 't1'), ['t1', 't2']);
    });

    test('playNextTrack inserts target immediately after currently playing track', () => {
      const base = ['t1', 't2', 't3'];
      assert.deepEqual(playNextTrack(base, 't1', 't-next'), ['t1', 't-next', 't2', 't3']);
      assert.deepEqual(playNextTrack(base, 't3', 't-next'), ['t1', 't2', 't3', 't-next']);
      assert.deepEqual(playNextTrack(base, undefined, 't-next'), ['t-next', 't1', 't2', 't3']);
    });

    test('playPreviousTrack inserts target immediately before currently playing track', () => {
      const base = ['t1', 't2', 't3'];
      assert.deepEqual(playPreviousTrack(base, 't2', 't-prev'), ['t1', 't-prev', 't2', 't3']);
      assert.deepEqual(playPreviousTrack(base, 't1', 't-prev'), ['t-prev', 't1', 't2', 't3']);
      assert.deepEqual(playPreviousTrack(base, undefined, 't-prev'), ['t-prev', 't1', 't2', 't3']);
    });

    test('removeTrack removes matching ID safely', () => {
      const base = ['t1', 't2', 't3'];
      assert.deepEqual(removeTrack(base, 't2'), ['t1', 't3']);
      assert.deepEqual(removeTrack(base, 'non-existent'), ['t1', 't2', 't3']);
    });

    test('moveTrack moves item to arbitrary valid index without loss', () => {
      const base = ['a', 'b', 'c', 'd'];
      assert.deepEqual(moveTrack(base, 'a', 2), ['b', 'c', 'a', 'd']);
      assert.deepEqual(moveTrack(base, 'd', 0), ['d', 'a', 'b', 'c']);
    });

    test('shuffled preserves all track identifiers', () => {
      const base = ['1', '2', '3', '4', '5'];
      const mixed = shuffled(base);
      assert.equal(mixed.length, base.length);
      assert.deepEqual(new Set(mixed), new Set(base));
    });
  });

  describe('AudioTrack Interface & Media Attributes', () => {
    test('AudioTrack supports optional streamUrl and coverUrl with local blob', () => {
      const dummyBlob = new Blob(['mock audio data'], { type: 'audio/mpeg' });
      const track: AudioTrack = {
        id: 'track-remote-1',
        title: 'Streaming Song',
        artist: 'Online Artist',
        name: 'Streaming Song',
        blob: dummyBlob,
        created: Date.now(),
        duration: 180,
        streamUrl: 'https://example.com/audio/stream.mp3',
        coverUrl: 'https://example.com/images/cover.jpg',
        kind: 'music'
      };

      assert.equal(track.id, 'track-remote-1');
      assert.equal(track.streamUrl, 'https://example.com/audio/stream.mp3');
      assert.equal(track.coverUrl, 'https://example.com/images/cover.jpg');
      assert.equal(track.kind, 'music');
      assert.ok(track.blob instanceof Blob);
    });
  });

  describe('Spicetify Aesthetics & Visual Controls', () => {
    test('trackBadge identifies sources across YouTube, Spotify, Audiobook, Direct and Local', () => {
      assert.deepEqual(trackBadge({ id: 'yt:dQw4w9WgXcQ', title: 'T', artist: 'A', source: 'youtube' }), { label: 'YouTube', kind: 'youtube' });
      assert.deepEqual(trackBadge({ id: 'ia:moby_dick', title: 'T', artist: 'A', source: 'audiobook' }), { label: 'Audiobook', kind: 'audiobook' });
      assert.deepEqual(trackBadge({ id: 'stream:123', title: 'T', artist: 'A', source: 'spotify' }), { label: 'Spotify', kind: 'spotify' });
      assert.deepEqual(trackBadge({ id: 'custom:url1', title: 'T', artist: 'A', source: 'custom' }), { label: 'Direct', kind: 'custom' });
      assert.deepEqual(trackBadge({ id: 'local-1', title: 'T', artist: 'A', name: 'T', blob: new Blob([]), created: 0 }), { label: 'Local', kind: 'local' });
    });

    test('createVisualizer creates correct number of equalizer bars', () => {
      const vis = createVisualizer(16, 'music-visualizer-test');
      assert.equal(vis.className, 'music-visualizer-test');
      assert.equal(vis.children.length, 16);
      assert.equal((vis.children[0] as HTMLElement).className, 'music-vis-bar');
    });
  });
});
