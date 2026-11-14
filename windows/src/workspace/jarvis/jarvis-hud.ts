/**
 * JARVIS Orbital HUD
 * Futuristic telemetry command center dashboard.
 * Pure DOM + CSS — no canvas required.
 * Inspired by the Cindy Zhu JARVIS video HUD layout.
 */
import type { SystemTelemetry } from './connectors/system-connector';

export interface JarvisHudOptions {
  /** Number of bars in the frequency spectrum panel. Default 32. */
  spectrumBars?: number;
  /** Max log lines shown in TERM_CON panel. Default 24. */
  maxLogLines?: number;
  /** Update interval for spectrum animation (ms). Default 80. */
  animIntervalMs?: number;
}

function injectHudStyles(): void {
  if (document.getElementById('jarvis-hud-styles')) return;
  const style = document.createElement('style');
  style.id = 'jarvis-hud-styles';
  style.textContent = `
    .jarvis-hud {
      --hud-bg: #020d14;
      --hud-border: #0af;
      --hud-glow: rgba(0,170,255,0.18);
      --hud-green: #00ff88;
      --hud-amber: #ffb700;
      --hud-red: #ff3333;
      --hud-text: #7de8ff;
      --hud-dim: rgba(125,232,255,0.5);
      --hud-panel-bg: rgba(2,13,20,0.92);
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr) minmax(0, 1fr);
      grid-template-rows: minmax(150px, 1fr) minmax(150px, 1fr) minmax(110px, auto);
      gap: 8px;
      padding: 10px;
      background: var(--hud-bg);
      color: var(--hud-text);
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      min-height: 480px;
      border-radius: 8px;
      position: relative;
    }
    .jarvis-panel {
      background: var(--hud-panel-bg);
      border: 1px solid var(--hud-border);
      border-radius: 4px;
      padding: 8px;
      box-shadow: 0 0 12px var(--hud-glow), inset 0 0 8px rgba(0,170,255,0.04);
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow: hidden;
    }
    .jarvis-panel-title {
      font-size: 9px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--hud-border);
      border-bottom: 1px solid rgba(0,170,255,0.3);
      padding-bottom: 4px;
      margin-bottom: 4px;
    }
    /* AI CORE panel spans both rows in center */
    .jarvis-panel-ai-core {
      grid-column: 2;
      grid-row: 1 / 3;
      align-items: center;
      justify-content: center;
    }
    /* The log runs along the bottom, so all six panels have a fixed place */
    .jarvis-panel-term { grid-column: 1 / -1; }
    @container (max-width: 640px) {
      .jarvis-hud { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; min-height: 0; }
      .jarvis-panel-ai-core { grid-column: auto; grid-row: auto; }
    }
    /* Core matrix grid */
    .core-matrix-grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 2px;
    }
    .matrix-cell {
      aspect-ratio: 1;
      border-radius: 1px;
      transition: background 0.4s;
    }
    /* Gauge bars */
    .gauge-row { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
    .gauge-label { width: 56px; color: var(--hud-dim); font-size: 10px; }
    .gauge-track { flex: 1; height: 8px; background: rgba(0,170,255,0.1); border: 1px solid rgba(0,170,255,0.25); border-radius: 2px; overflow: hidden; }
    .gauge-fill { height: 100%; border-radius: 2px; transition: width 0.6s; }
    .gauge-fill-cpu { background: linear-gradient(90deg, #0af, #00ff88); }
    .gauge-fill-ram { background: linear-gradient(90deg, #0af, #ffb700); }
    .gauge-fill-bat { background: linear-gradient(90deg, #0af, #00ff88); }
    .gauge-val { width: 36px; text-align: right; font-size: 10px; }
    /* Net flow mini-bars */
    .net-flow-bars { display: flex; align-items: flex-end; gap: 1px; height: 48px; }
    .net-flow-bar { flex: 1; border-radius: 1px 1px 0 0; transition: height 0.3s; }
    /* Spectrum bars */
    .spectrum-bars { display: flex; align-items: flex-end; gap: 1px; height: 64px; }
    .spectrum-bar { flex: 1; border-radius: 1px 1px 0 0; min-height: 2px; transition: height 0.1s; }
    /* Terminal log */
    .term-log { flex: 1; overflow-y: auto; font-size: 9.5px; color: var(--hud-dim); line-height: 1.4; scrollbar-width: none; }
    .term-log::-webkit-scrollbar { display: none; }
    .term-entry { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .term-entry-new { color: var(--hud-green); }
    /* Orbital AI Core */
    .ai-core-orbital {
      position: relative;
      width: 140px;
      height: 140px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 10px auto;
    }
    .orbital-ring {
      position: absolute;
      width: 130px; height: 130px;
      border: 2px solid rgba(0,170,255,0.6);
      border-radius: 50%;
      border-top-color: transparent;
      animation: orbit-spin 3s linear infinite;
    }
    .orbital-ring-2 {
      position: absolute;
      width: 110px; height: 110px;
      border: 1px solid rgba(0,255,136,0.4);
      border-radius: 50%;
      border-bottom-color: transparent;
      animation: orbit-spin 5s linear infinite reverse;
    }
    .orbital-core {
      width: 60px; height: 60px;
      background: radial-gradient(circle, #0af 0%, rgba(0,100,180,0.6) 60%, transparent 100%);
      border-radius: 50%;
      box-shadow: 0 0 24px rgba(0,170,255,0.8), 0 0 48px rgba(0,170,255,0.3);
      animation: core-pulse 2s ease-in-out infinite;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px;
      color: white;
    }
    .jarvis-hud.wake-active .orbital-core {
      animation: core-pulse 0.45s ease-in-out infinite;
      box-shadow: 0 0 40px rgba(0,255,200,1), 0 0 80px rgba(0,170,255,0.7);
    }
    .jarvis-hud.wake-active .orbital-ring {
      animation-duration: 0.8s;
      border-color: rgba(0,255,200,0.85);
    }
    .jarvis-hud.wake-active .orbital-ring-2 {
      animation-duration: 1.2s;
    }
    @keyframes orbit-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes core-pulse {
      0%, 100% { box-shadow: 0 0 24px rgba(0,170,255,0.8), 0 0 48px rgba(0,170,255,0.3); }
      50% { box-shadow: 0 0 36px rgba(0,170,255,1), 0 0 72px rgba(0,170,255,0.5); }
    }
    .ai-core-status {
      text-align: center;
      font-size: 10px;
      color: var(--hud-green);
      letter-spacing: 0.1em;
      margin-top: 6px;
    }
    .ai-core-metric {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      padding: 2px 0;
      border-bottom: 1px solid rgba(0,170,255,0.1);
    }
    /* Pulse message overlay */
    .jarvis-pulse-msg {
      position: absolute;
      bottom: 14px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,170,255,0.15);
      border: 1px solid var(--hud-border);
      color: var(--hud-text);
      font-size: 11px;
      padding: 6px 18px;
      border-radius: 20px;
      max-width: 80%;
      text-align: center;
      opacity: 0;
      transition: opacity 0.4s;
      pointer-events: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .jarvis-pulse-msg.visible { opacity: 1; }
  `;
  document.head.appendChild(style);
}

function makePanel(extraClass = ''): HTMLElement {
  const p = document.createElement('div');
  p.className = 'jarvis-panel' + (extraClass ? ' ' + extraClass : '');
  return p;
}

function makeTitle(text: string): HTMLElement {
  const t = document.createElement('div');
  t.className = 'jarvis-panel-title';
  t.textContent = text;
  return t;
}

function makeGaugeRow(label: string, fillClass: string): { row: HTMLElement; fill: HTMLElement; val: HTMLElement } {
  const row = document.createElement('div');
  row.className = 'gauge-row';
  const lbl = document.createElement('div');
  lbl.className = 'gauge-label';
  lbl.textContent = label;
  const track = document.createElement('div');
  track.className = 'gauge-track';
  const fill = document.createElement('div');
  fill.className = `gauge-fill ${fillClass}`;
  fill.style.width = '0%';
  track.appendChild(fill);
  const val = document.createElement('div');
  val.className = 'gauge-val';
  val.textContent = '0%';
  row.append(lbl, track, val);
  return { row, fill, val };
}

/** Spectrum colors: deep blue → cyan → green across 32 bars */
function barColor(i: number, total: number): string {
  const t = i / total;
  if (t < 0.33) return `hsl(${200 + t * 60}, 100%, 55%)`;
  if (t < 0.66) return `hsl(${220 + t * 40}, 100%, 60%)`;
  return `hsl(${160 + t * 40}, 100%, 55%)`;
}

export function createJarvisHud(options?: JarvisHudOptions): {
  root: HTMLElement;
  updateTelemetry: (stats: SystemTelemetry) => void;
  pulseMessage: (msg: string) => void;
  setWakeActive: (active: boolean) => void;
  destroy: () => void;
} {
  const opts = {
    spectrumBars: options?.spectrumBars ?? 32,
    maxLogLines: options?.maxLogLines ?? 24,
    animIntervalMs: options?.animIntervalMs ?? 80,
  };

  injectHudStyles();

  const root = document.createElement('div');
  root.className = 'jarvis-hud';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'JARVIS Command HUD');

  // ── Panel 1: SYS_STATUS // CORE_MATRIX (top-left)
  const sysPanel = makePanel();
  sysPanel.appendChild(makeTitle('SYS_STATUS // CORE_MATRIX'));
  const matrixGrid = document.createElement('div');
  matrixGrid.className = 'core-matrix-grid';
  const matrixCells: HTMLElement[] = [];
  for (let i = 0; i < 48; i++) {
    const cell = document.createElement('div');
    cell.className = 'matrix-cell';
    cell.style.background = '#00ff88';
    matrixGrid.appendChild(cell);
    matrixCells.push(cell);
  }
  sysPanel.appendChild(matrixGrid);

  // ── Panel 2: AI_CORE // NEURAL_LINK (center, spans 2 rows)
  const aiPanel = makePanel('jarvis-panel-ai-core');
  aiPanel.appendChild(makeTitle('AI_CORE // NEURAL_LINK'));
  const orbital = document.createElement('div');
  orbital.className = 'ai-core-orbital';
  const ring1 = document.createElement('div');
  ring1.className = 'orbital-ring';
  const ring2 = document.createElement('div');
  ring2.className = 'orbital-ring-2';
  const coreEl = document.createElement('div');
  coreEl.className = 'orbital-core';
  coreEl.textContent = '⬡';
  orbital.append(ring1, ring2, coreEl);
  aiPanel.appendChild(orbital);
  const aiStatus = document.createElement('div');
  aiStatus.className = 'ai-core-status';
  aiStatus.textContent = '● CLAUDE · ONLINE · READY';
  aiPanel.appendChild(aiStatus);
  ['LATENCY', 'TOKENS/SEC', 'CONTEXT', 'MODEL'].forEach((k, i) => {
    const row = document.createElement('div');
    row.className = 'ai-core-metric';
    const vals = ['24ms', '847', '12.4k', 'Claude 3.5'];
    row.innerHTML = `<span style="color:var(--hud-dim)">${k}</span><strong>${vals[i]}</strong>`;
    aiPanel.appendChild(row);
  });

  // ── Panel 3: ENV_DYNAMICS // AUX_LOAD (top-right)
  const envPanel = makePanel();
  envPanel.appendChild(makeTitle('ENV_DYNAMICS // AUX_LOAD'));
  const cpuGauge = makeGaugeRow('CPU', 'gauge-fill-cpu');
  const ramGauge = makeGaugeRow('RAM', 'gauge-fill-ram');
  const batGauge = makeGaugeRow('BATTERY', 'gauge-fill-bat');
  envPanel.append(cpuGauge.row, ramGauge.row, batGauge.row);

  // ── Panel 4: NET_FLOW // PROTOCOL_STATS (bottom-left)
  const netPanel = makePanel();
  netPanel.appendChild(makeTitle('NET_FLOW // PROTOCOL_STATS'));
  const netLabels = document.createElement('div');
  netLabels.style.cssText = 'display:flex;gap:12px;font-size:10px;';
  const rxLbl = document.createElement('span');
  rxLbl.innerHTML = '<span style="color:var(--hud-dim)">↓RX</span> <strong id="jrx">0</strong> KB/s';
  const txLbl = document.createElement('span');
  txLbl.innerHTML = '<span style="color:var(--hud-dim)">↑TX</span> <strong id="jtx">0</strong> KB/s';
  netLabels.append(rxLbl, txLbl);
  netPanel.appendChild(netLabels);
  const netFlowContainer = document.createElement('div');
  netFlowContainer.className = 'net-flow-bars';
  const netFlowBarsEls: HTMLElement[] = [];
  for (let i = 0; i < 20; i++) {
    const bar = document.createElement('div');
    bar.className = 'net-flow-bar';
    bar.style.cssText = `height:20%;background:rgba(0,170,255,0.6);`;
    netFlowContainer.appendChild(bar);
    netFlowBarsEls.push(bar);
  }
  netPanel.appendChild(netFlowContainer);

  // ── Panel 5: FREQ_ANALYSIS // HARDWARE_LOAD (bottom-right)
  const freqPanel = makePanel();
  freqPanel.appendChild(makeTitle('FREQ_ANALYSIS // HARDWARE_LOAD'));
  const spectrumContainer = document.createElement('div');
  spectrumContainer.className = 'spectrum-bars';
  const spectrumBarsEls: HTMLElement[] = [];
  for (let i = 0; i < opts.spectrumBars; i++) {
    const bar = document.createElement('div');
    bar.className = 'spectrum-bar';
    bar.style.cssText = `height:5%;background:${barColor(i, opts.spectrumBars)};`;
    spectrumContainer.appendChild(bar);
    spectrumBarsEls.push(bar);
  }
  freqPanel.appendChild(spectrumContainer);

  // ── Panel 6: TERM_CON // DB_QUERY (bottom-center... but we have 3-col grid so place via CSS)
  const termPanel = makePanel('jarvis-panel-term');
  termPanel.appendChild(makeTitle('TERM_CON // DB_QUERY'));
  const termLogEl = document.createElement('div');
  termLogEl.className = 'term-log';
  termPanel.appendChild(termLogEl);

  // Pulse message overlay
  const pulseEl = document.createElement('div');
  pulseEl.className = 'jarvis-pulse-msg';

  // Assemble layout: grid order is top-left, top-center(aiPanel spans), top-right, bottom-left, bottom-center, bottom-right
  // Grid is 3-col 2-row; ai-panel is col-2 row-1/3
  root.append(sysPanel, aiPanel, envPanel, netPanel, freqPanel, termPanel, pulseEl);

  // ── Animation: spectrum + net flow + matrix
  const LOG_PREFIXES = ['[SYS]', '[NET]', '[DB]', '[AI]', '[AUTH]', '[TASK]'];
  const LOG_MSGS = [
    'Connection established', 'Token refresh OK', 'Cache hit ratio 94%',
    'Telemetry snapshot written', 'Model weights validated', 'Health check OK',
    'TLS handshake complete', 'API rate limit nominal', 'Briefing engine ready',
    'Subscriber count updated', 'Revenue delta computed', 'Support triage complete',
  ];

  let animTimer: ReturnType<typeof setTimeout> | null = null;
  let animPaused = typeof document !== 'undefined' && document.hidden;
  let logIdx = 0;
  let netHistory: number[] = new Array(20).fill(20);
  let spectrumPhase = 0;
  let wakeTimer: ReturnType<typeof setTimeout> | null = null;

  const animate = () => {
    if (animPaused) {
      animTimer = setTimeout(animate, opts.animIntervalMs);
      return;
    }
    spectrumPhase += 0.07;
    // Spectrum: sine wave with harmonics for realism
    for (let i = 0; i < spectrumBarsEls.length; i++) {
      const t = i / spectrumBarsEls.length;
      const h = Math.abs(Math.sin(spectrumPhase + t * 4) * 0.6
        + Math.sin(spectrumPhase * 2.3 + t * 7) * 0.3
        + Math.sin(spectrumPhase * 0.7 + t * 2) * 0.1);
      spectrumBarsEls[i].style.height = Math.max(3, Math.round(h * 95)) + '%';
    }
    // Net flow
    netHistory.shift();
    netHistory.push(20 + Math.round(Math.random() * 70));
    const maxNet = Math.max(...netHistory, 1);
    for (let i = 0; i < netFlowBarsEls.length; i++) {
      netFlowBarsEls[i].style.height = Math.round((netHistory[i] / maxNet) * 90) + '%';
    }
    // Matrix cells: randomly flicker 2% of cells per tick
    const flipCount = Math.max(1, Math.round(matrixCells.length * 0.02));
    for (let f = 0; f < flipCount; f++) {
      const idx = Math.floor(Math.random() * matrixCells.length);
      const r = Math.random();
      matrixCells[idx].style.background = r < 0.9 ? '#00ff88' : r < 0.95 ? '#ffb700' : '#ff3333';
    }
    // Periodic log entry (~every 1.5s = ~19 ticks at 80ms)
    logIdx++;
    if (logIdx % 19 === 0) {
      const prefix = LOG_PREFIXES[Math.floor(Math.random() * LOG_PREFIXES.length)];
      const msg = LOG_MSGS[Math.floor(Math.random() * LOG_MSGS.length)];
      const ts = new Date().toISOString().slice(11, 19);
      const entry = document.createElement('p');
      entry.className = 'term-entry term-entry-new';
      entry.textContent = `${ts} ${prefix} ${msg}`;
      termLogEl.appendChild(entry);
      // Trim to maxLogLines
      while (termLogEl.children.length > opts.maxLogLines) {
        termLogEl.removeChild(termLogEl.firstChild!);
        // Fade out the new-entry class after first tick
      }
      termLogEl.scrollTop = termLogEl.scrollHeight;
      // De-highlight after 1 frame
      requestAnimationFrame(() => entry.classList.remove('term-entry-new'));
    }

    animTimer = setTimeout(animate, opts.animIntervalMs);
  };

  const onDocVisibility = () => {
    animPaused = document.hidden;
  };

  // Start animation only in browser environment; pause when tab/window hidden.
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onDocVisibility);
    animTimer = setTimeout(animate, 100);
  }

  // ── updateTelemetry: called by polling loop
  function updateTelemetry(stats: SystemTelemetry): void {
    cpuGauge.fill.style.width = stats.cpuLoadPct + '%';
    cpuGauge.val.textContent = stats.cpuLoadPct + '%';
    cpuGauge.fill.style.background = stats.cpuLoadPct > 80 ? 'linear-gradient(90deg,#f00,#f60)' : '';

    const ramPct = stats.memoryUsedPct;
    ramGauge.fill.style.width = ramPct + '%';
    ramGauge.val.textContent = ramPct + '%';

    if (stats.batteryPct !== null) {
      batGauge.fill.style.width = stats.batteryPct + '%';
      batGauge.val.textContent = stats.batteryPct + '% ' + (stats.isCharging ? '⚡' : '');
    } else {
      batGauge.fill.style.width = '100%';
      batGauge.val.textContent = '—';
    }

    const rxEl = root.querySelector('#jrx') as HTMLElement | null;
    const txEl = root.querySelector('#jtx') as HTMLElement | null;
    if (rxEl) rxEl.textContent = stats.networkRxKbps.toString();
    if (txEl) txEl.textContent = stats.networkTxKbps.toString();
  }

  // ── pulseMessage: flash a message in the bottom overlay bar
  let pulseTimer: ReturnType<typeof setTimeout> | null = null;
  function pulseMessage(msg: string): void {
    pulseEl.textContent = `▶ ${msg}`;
    pulseEl.classList.add('visible');
    if (pulseTimer) clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => pulseEl.classList.remove('visible'), 5000);
  }

  function setWakeActive(active: boolean): void {
    root.classList.toggle('wake-active', active);
    if (wakeTimer) clearTimeout(wakeTimer);
    wakeTimer = null;
    if (active) {
      wakeTimer = setTimeout(() => root.classList.remove('wake-active'), 2500);
    }
  }

  function destroy(): void {
    if (animTimer) clearTimeout(animTimer);
    if (pulseTimer) clearTimeout(pulseTimer);
    if (wakeTimer) clearTimeout(wakeTimer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onDocVisibility);
    }
    root.remove();
  }

  return { root, updateTelemetry, pulseMessage, setWakeActive, destroy };
}
