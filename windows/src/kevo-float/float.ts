/**
 * Kevo float micro-pill (H.2): a tiny status dot + level pulse.
 * Changes only on `kevo://state` events (AGENTS.md rule 4). No timers, no polling.
 */

export type KevoHudState = 'off' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'alert' | 'sleeping';

export interface KevoStateEvent {
  state: KevoHudState;
  line?: string;
  badge?: string;
  level?: number;
}

export interface KevoFloatView {
  root: HTMLElement;
  pill: HTMLElement;
  dot: HTMLElement;
  pulse: HTMLElement;
  applyState: (event: KevoStateEvent) => void;
  getState: () => KevoHudState;
}

export function createKevoFloat(root: HTMLElement): KevoFloatView {
  let currentState: KevoHudState = 'off';

  const pill = document.createElement('div');
  pill.className = 'pill';
  pill.setAttribute('data-tauri-drag-region', 'true');
  pill.setAttribute('data-state', 'off');

  const dot = document.createElement('span');
  dot.className = 'dot';

  const pulse = document.createElement('span');
  pulse.className = 'pulse';

  pill.append(dot, pulse);
  root.append(pill);

  function applyState(event: KevoStateEvent): void {
    currentState = event.state;
    pill.setAttribute('data-state', event.state);
    root.setAttribute('data-state', event.state);

    if (event.state === 'speaking') {
      const lvl = typeof event.level === 'number' && Number.isFinite(event.level)
        ? Math.max(0, Math.min(1, event.level))
        : 0;
      pulse.style.background = `rgba(163, 229, 205, ${lvl})`;
      pulse.style.transform = `scale(${0.6 + lvl * 0.4})`;
      pulse.style.opacity = String(lvl);
    } else {
      pulse.style.background = 'transparent';
      pulse.style.transform = '';
      pulse.style.opacity = '0';
    }
  }

  return {
    root,
    pill,
    dot,
    pulse,
    applyState,
    getState: () => currentState,
  };
}
