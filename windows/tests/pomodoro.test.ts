import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PomodoroSession,
  type PomodoroConfig,
} from '../src/workspace/pomodoro.js';

test('Pomodoro & Focus Timer Engine', async (t) => {
  await t.test('initializes with default 25-minute focus state', () => {
    const pomo = new PomodoroSession();
    const status = pomo.getStatus();

    assert.equal(status.state, 'idle');
    assert.equal(status.mode, 'focus');
    assert.equal(status.remaining, 25 * 60);
    assert.equal(status.total, 25 * 60);
    assert.equal(status.progress, 0);
  });

  await t.test('starts, pauses, and updates progress upon ticks', () => {
    const pomo = new PomodoroSession({ focusMinutes: 10 });
    pomo.start();

    let status = pomo.getStatus();
    assert.equal(status.state, 'running');

    pomo.tick();
    pomo.tick();

    status = pomo.getStatus();
    assert.equal(status.remaining, 10 * 60 - 2);
    assert.ok(status.progress > 0);

    pomo.pause();
    status = pomo.getStatus();
    assert.equal(status.state, 'paused');
  });

  await t.test('completes focus session and transitions to short break', () => {
    const pomo = new PomodoroSession({
      focusMinutes: 1,
      shortBreakMinutes: 5,
      longBreakInterval: 4,
    });

    pomo.start();
    // Simulate countdown completion
    for (let i = 0; i < 60; i++) {
      pomo.tick();
    }

    const status = pomo.getStatus();
    assert.equal(status.state, 'completed');
    assert.equal(status.completedFocusCount, 1);
    assert.equal(status.mode, 'short-break');
    assert.equal(status.total, 5 * 60);
  });

  await t.test('transitions to long break after configured interval', () => {
    const pomo = new PomodoroSession({
      focusMinutes: 1,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      longBreakInterval: 2,
    });

    // Session 1
    pomo.start();
    for (let i = 0; i < 60; i++) pomo.tick();
    assert.equal(pomo.getStatus().mode, 'short-break');

    // Complete Break 1
    for (let i = 0; i < 300; i++) pomo.tick();
    assert.equal(pomo.getStatus().mode, 'focus');

    // Session 2 (should trigger long break)
    for (let i = 0; i < 60; i++) pomo.tick();
    const status = pomo.getStatus();
    assert.equal(status.completedFocusCount, 2);
    assert.equal(status.mode, 'long-break');
    assert.equal(status.total, 15 * 60);
  });

  await t.test('formatSessionMarkdown produces valid markdown task item', () => {
    const pomo = new PomodoroSession({ focusMinutes: 25 });
    const log = pomo.formatSessionMarkdown('Audio DSP Implementation');

    assert.match(log, /^- \[x\] \*\*Focus Session\*\*: Audio DSP Implementation \(25m\)/);
  });
});
