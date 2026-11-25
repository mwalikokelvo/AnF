import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PaperclipHeartbeat } from '../src/workspace/storage/paperclip-heartbeat';
import { VISUALIZER_THEMES } from '../src/workspace/audio/retro-visualizer';

describe('Paperclip Heartbeat Engine & Retro Visualizer', () => {
  it('registers jobs and runs them on heartbeat ticks', async () => {
    const hb = new PaperclipHeartbeat(1000);
    let jobRan = 0;

    hb.registerJob({
      id: 'test-job',
      name: 'Test Task',
      intervalMinutes: 1,
      run: async () => { jobRan++; }
    });

    const ran1 = await hb.tick(1000);
    assert.equal(ran1, 1);
    assert.equal(jobRan, 1);

    // Second tick within interval should NOT run again
    const ran2 = await hb.tick(1000 + 30_000);
    assert.equal(ran2, 0);
    assert.equal(jobRan, 1);

    // Tick after interval should run
    const ran3 = await hb.tick(1000 + 65_000);
    assert.equal(ran3, 1);
    assert.equal(jobRan, 2);

    const stats = hb.getStats();
    assert.equal(stats.jobsRun, 2);
    assert.equal(stats.tickCount, 3);
  });

  it('safely catches errors without crashing heartbeat loop', async () => {
    const hb = new PaperclipHeartbeat(1000);
    hb.registerJob({
      id: 'failing-job',
      name: 'Broken Task',
      intervalMinutes: 1,
      run: async () => { throw new Error('Simulated failure'); }
    });

    await hb.tick(1000);
    const stats = hb.getStats();
    assert.equal(stats.errors.length, 1);
    assert.equal(stats.errors[0].jobId, 'failing-job');
    assert.ok(stats.errors[0].error.includes('Simulated failure'));
  });

  it('verifies retro visualizer themes are defined', () => {
    assert.ok(VISUALIZER_THEMES['amber-crt']);
    assert.ok(VISUALIZER_THEMES['green-phosphor']);
    assert.equal(VISUALIZER_THEMES['green-phosphor'].waveform, '#33ff33');
  });
});
