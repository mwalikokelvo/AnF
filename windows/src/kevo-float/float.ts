// Kevo float (HUD H.2): shows the state Rust sends on `kevo://state`. It changes only when an event
// arrives: no timers, no animation-frame loops. The look is CSS keyed on data-state.
import type { KevoState } from '../workspace/jarvis/jarvis-hud';

/** `KevoHudState` in kevo_hud.rs: the orb's names, plus two only Rust sends. */
export type KevoHudState = KevoState | 'alert' | 'sleeping';
/** The `kevo://state` payload. */
export interface KevoHudEvent { state: KevoHudState; line: string; badge: string; level: number }

const LABEL: Record<KevoHudState, string> = {
  off: 'off', idle: 'waiting for “Kevo”', listening: 'listening', thinking: 'thinking',
  speaking: 'speaking', alert: 'needs you', sleeping: 'asleep',
};

/** Puts one event on the pill: its state, and the speech loudness (0–1) as the pulse size. */
export function showState(pill: HTMLElement, event: KevoHudEvent): void {
  const state = event.state in LABEL ? event.state : 'off';
  const level = Number.isFinite(event.level) ? Math.min(1, Math.max(0, event.level)) : 0;
  pill.dataset.state = state;
  pill.style.setProperty('--level', String(state === 'speaking' ? level : 0));
  pill.setAttribute('aria-label', `Kevo: ${LABEL[state]}`);
}
