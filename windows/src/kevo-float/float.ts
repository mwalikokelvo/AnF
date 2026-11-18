/**
 * Kevo float micro-pill and telemetry pill (H.2 & H.3).
 * State 1 (micro-pill): 48 × 28 px.
 * State 2 (telemetry pill): 420 × 110 px.
 * Grows on wake, on hover, and while an action runs.
 * Folds back to State 1 after 4 s of quiet.
 * Changes only on `kevo://state` events (AGENTS.md rule 4).
 * No timers or polling except the single 4 s fold timeout.
 */

export type KevoHudState = 'off' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'alert' | 'sleeping';

export interface KevoStateEvent {
  state: KevoHudState;
  line?: string;
  badge?: string;
  level?: number;
  summary?: string;
}

export interface KevoFloatOptions {
  onResize?: (expanded: boolean) => void;
  foldDelayMs?: number;
}

export interface KevoFloatView {
  root: HTMLElement;
  pill: HTMLElement;
  dot: HTMLElement;
  pulse: HTMLElement;
  avatar: HTMLElement;
  telemetryBody: HTMLElement;
  linesEl: HTMLElement;
  linePrevEl: HTMLElement;
  lineCurrEl: HTMLElement;
  badgeEl: HTMLElement;
  summaryCard: HTMLElement;
  summaryTextEl: HTMLElement;
  summaryCloseBtn: HTMLElement;
  applyState: (event: KevoStateEvent) => void;
  showMessage: (msg: string) => void;
  setSummary: (text: string | null) => void;
  getState: () => KevoHudState;
  isExpanded: () => boolean;
  setHover: (hovering: boolean) => void;
  destroy: () => void;
}

export function isWakeOrActionState(state: KevoHudState): boolean {
  return state === 'listening' || state === 'thinking' || state === 'speaking' || state === 'alert';
}

export function createKevoFloat(root: HTMLElement, options?: KevoFloatOptions): KevoFloatView {
  let currentState: KevoHudState = 'off';
  let expanded = false;
  let isHovered = false;
  let foldTimer: ReturnType<typeof setTimeout> | null = null;
  const foldDelayMs = options?.foldDelayMs ?? 4000;

  let prevLine = '';
  let currLine = '';

  const pill = document.createElement('div');
  pill.className = 'pill';
  pill.setAttribute('data-tauri-drag-region', 'true');
  pill.setAttribute('data-state', 'off');
  pill.setAttribute('data-expanded', 'false');

  // ── Micro-pill container (State 1)
  const micro = document.createElement('div');
  micro.className = 'micro';

  const dot = document.createElement('span');
  dot.className = 'dot';

  const pulse = document.createElement('span');
  pulse.className = 'pulse';

  micro.append(dot, pulse);

  // ── Telemetry container (State 2)
  const telemetryBody = document.createElement('div');
  telemetryBody.className = 'telemetry-body';

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.setAttribute('aria-hidden', 'true');

  const orb = document.createElement('div');
  orb.className = 'kevo-orb';

  const ring1 = document.createElement('span');
  ring1.className = 'kevo-ring';
  const ring2 = document.createElement('span');
  ring2.className = 'kevo-ring';
  const ring3 = document.createElement('span');
  ring3.className = 'kevo-ring';
  const arc = document.createElement('span');
  arc.className = 'kevo-arc';

  const core = document.createElement('div');
  core.className = 'kevo-core';
  for (let i = 0; i < 5; i++) {
    const bar = document.createElement('span');
    bar.className = 'kevo-bar';
    core.appendChild(bar);
  }

  orb.append(ring1, ring2, ring3, arc, core);
  avatar.appendChild(orb);

  const telemetryContent = document.createElement('div');
  telemetryContent.className = 'telemetry-content';

  const linesEl = document.createElement('div');
  linesEl.className = 'lines';

  const linePrevEl = document.createElement('div');
  linePrevEl.className = 'line line-prev';

  const lineCurrEl = document.createElement('div');
  lineCurrEl.className = 'line line-curr';

  linesEl.append(linePrevEl, lineCurrEl);

  const badgeRow = document.createElement('div');
  badgeRow.className = 'badge-row';

  const badgeEl = document.createElement('span');
  badgeEl.className = 'badge';

  badgeRow.appendChild(badgeEl);
  telemetryContent.append(linesEl, badgeRow);
  telemetryBody.append(avatar, telemetryContent);

  // ── Summary card (State 2 / H.6)
  const summaryCard = document.createElement('div');
  summaryCard.className = 'summary-card';
  summaryCard.setAttribute('data-expanded', 'false');
  summaryCard.style.display = 'none';

  const summaryBody = document.createElement('div');
  summaryBody.className = 'summary-body';

  const summaryTextEl = document.createElement('p');
  summaryTextEl.className = 'summary-text';

  summaryBody.appendChild(summaryTextEl);

  const summaryActions = document.createElement('div');
  summaryActions.className = 'summary-actions';

  const summaryCloseBtn = document.createElement('button');
  summaryCloseBtn.className = 'summary-close-btn';
  summaryCloseBtn.setAttribute('aria-label', 'Close');
  summaryCloseBtn.textContent = '✕';

  summaryActions.appendChild(summaryCloseBtn);
  summaryCard.append(summaryBody, summaryActions);

  summaryTextEl.addEventListener('click', () => {
    summaryCard.setAttribute('data-expanded', 'true');
  });

  summaryCloseBtn.addEventListener('click', (e) => {
    if (e && typeof (e as { stopPropagation?: () => void }).stopPropagation === 'function') {
      (e as { stopPropagation: () => void }).stopPropagation();
    }
    setSummary(null);
  });

  pill.append(micro, telemetryBody);
  root.append(pill, summaryCard);

  function clearFoldTimer(): void {
    if (foldTimer !== null) {
      clearTimeout(foldTimer);
      foldTimer = null;
    }
  }

  function setExpanded(nextExpanded: boolean): void {
    if (expanded === nextExpanded) return;
    expanded = nextExpanded;
    pill.setAttribute('data-expanded', String(expanded));
    root.setAttribute('data-expanded', String(expanded));
    options?.onResize?.(expanded);
  }

  function scheduleFold(): void {
    clearFoldTimer();
    foldTimer = setTimeout(() => {
      foldTimer = null;
      setExpanded(false);
    }, foldDelayMs);
  }

  function evaluateExpansion(): void {
    const active = isWakeOrActionState(currentState);
    if (active || isHovered) {
      clearFoldTimer();
      setExpanded(true);
    } else {
      // Quiet condition: idle, sleeping, or off without hover.
      if (expanded) {
        scheduleFold();
      } else {
        clearFoldTimer();
      }
    }
  }

  function setHover(hovering: boolean): void {
    if (isHovered === hovering) return;
    isHovered = hovering;
    evaluateExpansion();
  }

  pill.addEventListener('mouseenter', () => setHover(true));
  pill.addEventListener('mouseleave', () => setHover(false));

  function applyState(event: KevoStateEvent): void {
    currentState = event.state;
    pill.setAttribute('data-state', event.state);
    root.setAttribute('data-state', event.state);

    // Update lines text
    if (typeof event.line === 'string') {
      const newLine = event.line.trim();
      if (newLine && newLine !== currLine) {
        prevLine = currLine;
        currLine = newLine;
        linePrevEl.textContent = prevLine;
        lineCurrEl.textContent = currLine;
      }
    }

    // Update badge text
    if (typeof event.badge === 'string') {
      badgeEl.textContent = event.badge.trim();
      badgeRow.style.display = badgeEl.textContent ? '' : 'none';
    }

    // Update level pulse (speaking state)
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

    // Update summary text if present
    if (typeof event.summary === 'string') {
      setSummary(event.summary);
    }

    evaluateExpansion();
  }

  function setSummary(text: string | null): void {
    if (!text || !text.trim()) {
      summaryCard.style.display = 'none';
      summaryCard.setAttribute('data-expanded', 'false');
      summaryTextEl.textContent = '';
      return;
    }
    summaryTextEl.textContent = text.trim();
    summaryCard.setAttribute('data-expanded', 'false');
    summaryCard.style.display = 'flex';
  }

  function showMessage(msg: string): void {
    currLine = msg;
    lineCurrEl.textContent = currLine;
    clearFoldTimer();
    setExpanded(true);
    scheduleFold();
  }

  function destroy(): void {
    clearFoldTimer();
    pill.remove();
    summaryCard.remove();
  }

  return {
    root,
    pill,
    dot,
    pulse,
    avatar,
    telemetryBody,
    linesEl,
    linePrevEl,
    lineCurrEl,
    badgeEl,
    summaryCard,
    summaryTextEl,
    summaryCloseBtn,
    applyState,
    showMessage,
    setSummary,
    getState: () => currentState,
    isExpanded: () => expanded,
    setHover,
    destroy,
  };
}
