/**
 * Simple pomodoro / focus timer. "start a pomodoro", "start focus", "focus timer".
 * In-memory for the session; speak status. Extend with schedule later.
 */

let focusUntil = 0;
let focusType: 'work' | 'break' | null = null;

export function isPomodoroRequest(lower: string): boolean {
  const said = lower.replace(/[.!?]+$/, '').trim().replace(/^kevo[\s,]+/, '');
  return /^(?:start(?: a)? (?:pomodoro|focus(?: timer)?)|focus for \d+|pomodoro)$/.test(said);
}

export function startPomodoro(minutes = 25): string {
  focusUntil = Date.now() + minutes * 60 * 1000;
  focusType = 'work';
  return `Focus timer started for ${minutes} minutes.`;
}

export function getFocusStatus(): string {
  if (!focusType || focusUntil <= Date.now()) {
    focusType = null;
    return 'No focus timer is running.';
  }
  const left = Math.ceil((focusUntil - Date.now()) / 60000);
  return `${focusType} timer has ${left} minute${left === 1 ? '' : 's'} left.`;
}

export function cancelFocus(): string {
  focusType = null;
  focusUntil = 0;
  return 'Focus timer cancelled.';
}
