import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pauseOtherPlayers } from '../src/workspace/music-hub.js';

// Before Music Hub plays a song, audiobook or podcast it pauses Spotube, Android
// background playback and Audio Studio. That pause is best effort: if it fails or
// hangs, playback must still start (it used to block every play silently).
describe('Music Hub starts playback even when another player cannot pause', () => {
  test('a rejected pause does not throw', async () => {
    await assert.doesNotReject(pauseOtherPlayers(async () => { throw new Error('Spotube did not respond.'); }));
  });

  test('a synchronous throw does not throw', async () => {
    await assert.doesNotReject(pauseOtherPlayers(() => { throw new Error('Media bridge not ready'); }));
  });

  test('a pause that never answers is given up after the wait', async () => {
    const started = Date.now();
    await pauseOtherPlayers(() => new Promise<void>(() => {}), 50);
    assert.ok(Date.now() - started < 1000, 'playback must not wait for a hung player');
  });

  test('a working pause still runs before playback', async () => {
    let paused = false;
    await pauseOtherPlayers(async () => { paused = true; });
    assert.equal(paused, true);
  });
});
