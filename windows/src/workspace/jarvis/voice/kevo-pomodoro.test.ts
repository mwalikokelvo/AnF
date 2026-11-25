import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startPomodoro, stopPomodoro, getPomodoroStatus } from './kevo-pomodoro';

describe('kevo-pomodoro', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('starts and reports status', () => {
    const reply = startPomodoro(1, 1);
    expect(reply).toContain('started');
    expect(getPomodoroStatus()).toContain('Focus');
  });

  it('stops a running timer', () => {
    startPomodoro(1, 1);
    const reply = stopPomodoro();
    expect(reply).toContain('stopped');
    expect(getPomodoroStatus()).toContain('No Pomodoro');
  });
});
