/**
 * Kevo stage: the orb that shows what Kevo is doing, the last exchange, and a log of what really happened.
 * DOM + CSS only. Every animation is CSS, so nothing runs while the view is hidden.
 * Colours come from the workspace tokens (anf-design.css), so it follows the light, dark and theme-pack looks.
 */

export type KevoState = 'off' | 'idle' | 'listening' | 'thinking' | 'speaking';

export interface JarvisHudOptions {
  /** Max lines kept in the activity list. Default 40. */
  maxLogLines?: number;
}

const STATE_LABEL: Record<KevoState, string> = {
  off: 'Microphone off',
  idle: 'Say “Kevo”',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
};

/** What the orb should show. Speaking wins over thinking, which wins over listening. */
export function kevoState(s: { micOn: boolean; awake: boolean; thinking: boolean; speaking: boolean }): KevoState {
  if (s.speaking) return 'speaking';
  if (s.thinking) return 'thinking';
  if (!s.micOn) return 'off';
  return s.awake ? 'listening' : 'idle';
}

function injectHudStyles(): void {
  if (document.getElementById('jarvis-hud-styles')) return;
  const style = document.createElement('style');
  style.id = 'jarvis-hud-styles';
  style.textContent = `
    .jarvis-hud {
      --kevo: var(--accent, #a3e5cd);
      display: grid;
      grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
      gap: 12px;
      min-width: 0;
    }
    @container (max-width: 760px) { .jarvis-hud { grid-template-columns: minmax(0, 1fr); } }
    .jarvis-panel {
      background: var(--surface, #182a2d);
      border: 1px solid var(--line, #385052);
      border-radius: var(--radius, 16px);
      padding: 16px;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .jarvis-panel-title { margin: 0; font-size: 13px; font-weight: 600; color: var(--muted, #b0c4bd); }

    /* ── Stage */
    .kevo-stage {
      align-items: center;
      text-align: center;
      padding: 28px 16px 20px;
      background:
        radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--kevo) 14%, transparent), transparent 70%),
        var(--surface, #182a2d);
    }
    .kevo-orb {
      position: relative;
      width: 168px; height: 168px;
      display: grid; place-items: center;
      flex: none;
    }
    .kevo-ring, .kevo-arc, .kevo-core { position: absolute; border-radius: 50%; }
    .kevo-ring { inset: 22px; border: 2px solid var(--kevo); opacity: 0; }
    .kevo-arc {
      inset: 8px; opacity: 0;
      background: conic-gradient(from 0deg, transparent 0 62%, var(--kevo) 96%, transparent 100%);
      -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px));
      mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px));
      transition: opacity .3s;
    }
    .kevo-core {
      inset: 30px;
      background: radial-gradient(circle at 35% 28%, color-mix(in srgb, var(--kevo) 55%, #fff), var(--kevo) 46%, color-mix(in srgb, var(--kevo) 55%, #000) 100%);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--kevo) 40%, transparent), 0 10px 36px color-mix(in srgb, var(--kevo) 36%, transparent);
      display: flex; align-items: center; justify-content: center; gap: 5px;
      animation: kevo-breathe 5.5s ease-in-out infinite;
      transition: filter .4s, box-shadow .4s;
    }
    .kevo-bar {
      width: 6px; height: 6px; border-radius: 3px;
      background: var(--accent-ink, #10392e);
    }
    .kevo-state { margin: 6px 0 0; font-size: 20px; font-weight: 600; color: var(--ink, #edf4ef); }
    .kevo-heard, .kevo-reply { margin: 0; max-width: 46ch; overflow-wrap: anywhere; }
    /* A long answer stays readable without pushing the controls off the screen */
    .kevo-reply { max-height: 7.3em; overflow-y: auto; }
    .kevo-heard { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .kevo-heard { font-size: 13px; color: var(--muted, #b0c4bd); min-height: 1.4em; }
    .kevo-reply { font-size: 15px; line-height: 1.45; color: var(--ink, #edf4ef); min-height: 1.45em; }
    .kevo-reply.fresh, .kevo-heard.fresh { animation: kevo-line-in .35s cubic-bezier(.16,1,.3,1); }

    /* Off: a quiet orb */
    .jarvis-hud[data-state=off] .kevo-core { filter: saturate(.25) brightness(.8); animation: none; box-shadow: none; }
    /* Listening: rings travel outwards, bars stir */
    .jarvis-hud[data-state=listening] .kevo-ring { animation: kevo-ripple 1.9s cubic-bezier(.2,.6,.3,1) infinite; }
    .jarvis-hud[data-state=listening] .kevo-ring:nth-child(2) { animation-delay: .63s; }
    .jarvis-hud[data-state=listening] .kevo-ring:nth-child(3) { animation-delay: 1.26s; }
    .jarvis-hud[data-state=listening] .kevo-bar { animation: kevo-bar 1.1s ease-in-out infinite; --peak: 16px; }
    /* Thinking: an arc circles the orb */
    .jarvis-hud[data-state=thinking] .kevo-arc { opacity: 1; animation: kevo-spin 1.05s linear infinite; }
    .jarvis-hud[data-state=thinking] .kevo-core { animation: kevo-breathe 1.6s ease-in-out infinite; }
    /* Speaking: the bars become a voice */
    .jarvis-hud[data-state=speaking] .kevo-bar { animation: kevo-bar .52s ease-in-out infinite; --peak: 44px; }
    .jarvis-hud[data-state=speaking] .kevo-core { animation: kevo-speak 1.04s ease-in-out infinite; }
    .jarvis-hud .kevo-bar:nth-child(1) { animation-delay: -.40s; }
    .jarvis-hud .kevo-bar:nth-child(2) { animation-delay: -.15s; }
    .jarvis-hud .kevo-bar:nth-child(3) { animation-delay: -.30s; }
    .jarvis-hud .kevo-bar:nth-child(4) { animation-delay: -.05s; }
    .jarvis-hud .kevo-bar:nth-child(5) { animation-delay: -.22s; }

    @keyframes kevo-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.045); } }
    @keyframes kevo-speak { 0%,100% { transform: scale(1); } 50% { transform: scale(1.03); box-shadow: 0 0 0 1px color-mix(in srgb, var(--kevo) 40%, transparent), 0 10px 56px color-mix(in srgb, var(--kevo) 60%, transparent); } }
    @keyframes kevo-ripple { 0% { transform: scale(.72); opacity: .7; } 100% { transform: scale(1.36); opacity: 0; } }
    @keyframes kevo-spin { to { transform: rotate(360deg); } }
    @keyframes kevo-bar { 0%,100% { height: 6px; } 50% { height: var(--peak, 16px); } }
    @keyframes kevo-line-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    /* Opening the view: the orb arrives, then the rest follows */
    @keyframes kevo-arrive { from { opacity: 0; transform: scale(.82); } to { opacity: 1; transform: none; } }
    @keyframes kevo-follow { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    .kevo-orb { animation: kevo-arrive .7s cubic-bezier(.16,1,.3,1) both; }
    .kevo-state { animation: kevo-follow .5s .18s cubic-bezier(.16,1,.3,1) both; }
    .kevo-activity { animation: kevo-follow .5s .28s cubic-bezier(.16,1,.3,1) both; }

    /* ── Activity */
    /* The list fills the panel beside the orb and scrolls inside it, so there is one scrollbar, not two */
    .kevo-activity { min-height: 220px; }
    .kevo-log { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; gap: 6px; }
    .kevo-log li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; font-size: 13px; line-height: 1.4; color: var(--ink, #edf4ef); animation: kevo-line-in .3s cubic-bezier(.16,1,.3,1); }
    .kevo-log time { color: var(--muted, #b0c4bd); font-variant-numeric: tabular-nums; }
    .kevo-log span { overflow-wrap: anywhere; }
    .kevo-log-empty { margin: 0; font-size: 13px; color: var(--muted, #b0c4bd); }

    @media (prefers-reduced-motion: reduce) {
      .jarvis-hud *, .jarvis-hud *::before { animation: none !important; transition: none !important; }
      .jarvis-hud[data-state=listening] .kevo-ring:first-child { opacity: .6; transform: scale(1.12); }
      .jarvis-hud[data-state=thinking] .kevo-arc { opacity: 1; }
      .jarvis-hud[data-state=speaking] .kevo-bar:nth-child(odd) { height: 30px; }
      .jarvis-hud[data-state=speaking] .kevo-bar:nth-child(even) { height: 18px; }
    }
  `;
  document.head.appendChild(style);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function createJarvisHud(options?: JarvisHudOptions): {
  root: HTMLElement;
  setState: (state: KevoState) => void;
  setHeard: (text: string) => void;
  setReply: (text: string) => void;
  pulseMessage: (msg: string) => void;
  setWakeActive: (active: boolean) => void;
  destroy: () => void;
} {
  const maxLogLines = options?.maxLogLines ?? 40;
  injectHudStyles();

  const root = el('div', 'jarvis-hud');
  root.dataset.state = 'off';

  // ── Stage: the orb, what it is doing, and the last exchange
  const stage = el('section', 'jarvis-panel kevo-stage');
  stage.setAttribute('aria-label', 'Kevo');
  const orb = el('div', 'kevo-orb');
  orb.setAttribute('aria-hidden', 'true');
  const core = el('div', 'kevo-core');
  for (let i = 0; i < 5; i++) core.appendChild(el('span', 'kevo-bar'));
  orb.append(el('span', 'kevo-ring'), el('span', 'kevo-ring'), el('span', 'kevo-ring'), el('span', 'kevo-arc'), core);
  const stateEl = el('p', 'kevo-state', STATE_LABEL.off);
  stateEl.setAttribute('role', 'status');
  const heardEl = el('p', 'kevo-heard');
  const replyEl = el('p', 'kevo-reply', 'Turn the microphone on, then say “Kevo” and what you need.');
  replyEl.setAttribute('aria-live', 'polite');
  stage.append(orb, stateEl, heardEl, replyEl);

  // ── Activity: what Kevo heard and did, newest first
  const activity = el('section', 'jarvis-panel kevo-activity');
  activity.setAttribute('aria-label', 'Kevo activity');
  const emptyEl = el('p', 'kevo-log-empty', 'What Kevo hears and does will be listed here.');
  const logEl = el('ol', 'kevo-log');
  activity.append(el('h3', 'jarvis-panel-title', 'Activity'), emptyEl, logEl);

  root.append(stage, activity);

  function replay(node: HTMLElement): void {
    node.classList.remove('fresh');
    void node.offsetWidth; // restart the entrance animation
    node.classList.add('fresh');
  }

  function setState(state: KevoState): void {
    if (root.dataset.state === state) return;
    root.dataset.state = state;
    stateEl.textContent = STATE_LABEL[state];
  }

  function setHeard(text: string): void {
    heardEl.textContent = text ? `“${text}”` : '';
    if (text) replay(heardEl);
  }

  function setReply(text: string): void {
    replyEl.textContent = text;
    replay(replyEl);
  }

  /** Adds a line to the activity list. */
  function pulseMessage(msg: string): void {
    if (!msg) return;
    emptyEl.hidden = true;
    const item = document.createElement('li');
    const time = document.createElement('time');
    time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const text = document.createElement('span');
    text.textContent = msg;
    item.append(time, text);
    logEl.prepend(item);
    while (logEl.children.length > maxLogLines) logEl.lastElementChild!.remove();
  }

  let wakeTimer: ReturnType<typeof setTimeout> | null = null;
  function setWakeActive(active: boolean): void {
    root.classList.toggle('wake-active', active);
    // Hearing its name: one pop (not a CSS class, so the arrival animation is not replayed afterwards)
    if (active && orb.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      orb.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 500, easing: 'cubic-bezier(.2,1.6,.4,1)' });
    }
    if (wakeTimer) clearTimeout(wakeTimer);
    wakeTimer = active ? setTimeout(() => root.classList.remove('wake-active'), 600) : null;
  }

  function destroy(): void {
    if (wakeTimer) clearTimeout(wakeTimer);
    root.remove();
  }

  return { root, setState, setHeard, setReply, pulseMessage, setWakeActive, destroy };
}
