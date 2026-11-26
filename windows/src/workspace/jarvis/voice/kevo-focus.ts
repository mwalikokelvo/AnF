/**
 * Local focus / Pomodoro timer for Kevo.
 * "start focus", "pomodoro", "start a 25 minute focus".
 * Pure local; no network.
 */

export interface FocusSession {
  id: string;
  startedAt: number;
  durationMs: number;
  label: string;
}

let active: FocusSession | null = null;
const listeners: Array<(s: FocusSession | null) => void> = [];

export function isFocusStart(lower: string): { minutes: number; label: string } | null {
  const m = lower.match(/(?:start|begin)(?: a)? (?:(\d+) minute[s]?)? ?(?:focus|pomodoro|work session)(?: on (.+))?/);
  if (!m && !/^(?:start focus|pomodoro|focus mode)$/.test(lower.trim())) return null;
  const minutes = m?.[1] ? parseInt(m[1], 10) : 25;
  const label = m?.[2]?.trim() || 'focus';
  return { minutes: Math.min(Math.max(minutes, 1), 90), label };
}

export function startFocus(minutes: number, label: string): FocusSession {
  if (active) cancelFocus();
  active = { id: Date.now().toString(36), startedAt: Date.now(), durationMs: minutes * 60_000, label };
  notify();
  return active;
}

export function cancelFocus(): void {
  active = null;
  notify();
}

export function getFocus(): FocusSession | null {
  if (!active) return null;
  if (Date.now() - active.startedAt > active.durationMs) {
    active = null;
    notify();
    return null;
  }
  return active;
}

export function focusStatus(): string {
  const s = getFocus();
  if (!s) return 'No focus session is running.';
  const left = Math.max(0, Math.round((s.durationMs - (Date.now() - s.startedAt)) / 60_000));
  return `Focus on ${s.label} has ${left} minute${left === 1 ? '' : 's'} left.`;
}

function notify() {
  listeners.forEach((l) => l(active));
}

export function onFocusChange(fn: (s: FocusSession | null) => void): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}
