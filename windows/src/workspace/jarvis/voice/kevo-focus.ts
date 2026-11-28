/**
 * Kevo Focus Timer: simple Pomodoro-style sessions.
 * Positive productivity capability.
 */

let focusTimer: ReturnType<typeof setTimeout> | null = null;
let focusEnd: number | null = null;

export function startFocus(minutes: number = 25): string {
  if (focusTimer) clearTimeout(focusTimer);
  const ms = minutes * 60 * 1000;
  focusEnd = Date.now() + ms;
  focusTimer = setTimeout(() => {
    focusTimer = null;
    focusEnd = null;
    // In real, speak "Focus session complete" via speaker
  }, ms);
  return `Focus session started for ${minutes} minutes. Stay present.`;
}

export function getFocusStatus(): string {
  if (!focusEnd) return 'No active focus session.';
  const remaining = Math.max(0, Math.round((focusEnd - Date.now()) / 60000));
  return `Focus session active, ${remaining} minutes remaining.`;
}

export function cancelFocus(): string {
  if (focusTimer) clearTimeout(focusTimer);
  focusTimer = null;
  focusEnd = null;
  return 'Focus session cancelled.';
}
