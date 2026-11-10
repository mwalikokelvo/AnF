/**
 * JARVIS Command Desk
 * The assembled command center UI for the AnF workspace.
 * Mounts as section('jarvis', 'JARVIS', commandDesk.root) in main.ts.
 *
 * Layout:
 * ┌─────────────────────────────────────────────┐
 * │  JARVIS  •  Autonomous Command Center        │
 * ├──────────────────┬──────────────────────────┤
 * │  HUD (animated)  │  Agent Cards row         │
 * │                  ├──────────────────────────┤
 * │                  │  Executive Briefing card  │
 * │                  ├──────────────────────────┤
 * │                  │  Quick Actions toolbar    │
 * └──────────────────┴──────────────────────────┘
 */

import { createJarvisHud } from './jarvis-hud';
import { JarvisExecutive } from './jarvis-executive';
import { RevenueConnector } from './connectors/revenue-connector';
import { AdsConnector } from './connectors/ads-connector';
import { startTelemetryPolling } from './connectors/system-connector';
import { TomDeveloperAgent } from './agents/tom-developer';
import { ScoutGrowthAgent } from './agents/scout-growth';
import { SupportOperationsAgent } from './agents/support-agent';
import { JarvisVoiceListener } from './voice/jarvis-voice-listener';
import { JarvisSpeaker } from './voice/jarvis-speaker';
import { JarvisVoiceAgent, type JarvisActionContext } from './voice/jarvis-voice-agent';
import { JARVIS_VOICE_PACK, getSelectedVoiceId, setSelectedVoiceId } from './voice/jarvis-voice-pack';

export interface JarvisCommandDeskOptions {
  onNotify?: (msg: string) => void;
  voiceActionContext?: Partial<JarvisActionContext>;
}

export function createJarvisCommandDesk(options?: JarvisCommandDeskOptions): {
  root: HTMLElement;
  destroy: () => void;
  listener: JarvisVoiceListener;
  speaker: JarvisSpeaker;
  agent: JarvisVoiceAgent;
} {
  const notify = options?.onNotify ?? ((msg: string) => { console.log('[JARVIS]', msg); });

  // ── Instantiate all subsystems
  const hud = createJarvisHud({ spectrumBars: 32, maxLogLines: 24, animIntervalMs: 80 });
  const executive = new JarvisExecutive();
  const revenue = new RevenueConnector();
  const ads = new AdsConnector();
  const tom = new TomDeveloperAgent();
  const scout = new ScoutGrowthAgent();
  const support = new SupportOperationsAgent();

  // ── Root element
  const root = document.createElement('div');
  root.className = 'jarvis-command-desk';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'JARVIS Command Center');

  // ── Inject desk styles
  injectDeskStyles();

  // ── Header bar
  const header = document.createElement('header');
  header.className = 'jarvis-desk-header';
  header.innerHTML = `
    <div class="jarvis-desk-title">
      <span class="jarvis-logo" aria-hidden="true">⬡</span>
      <div>
        <h2>JARVIS</h2>
        <p>Autonomous Multi-Agent Command Center</p>
      </div>
    </div>
    <div class="jarvis-desk-status">
      <span class="jarvis-online-dot"></span>
      <span>ONLINE</span>
    </div>
  `;

  // ── Main layout: HUD left, panels right
  const mainLayout = document.createElement('div');
  mainLayout.className = 'jarvis-desk-main';

  // HUD column
  const hudCol = document.createElement('div');
  hudCol.className = 'jarvis-desk-hud-col';
  hudCol.appendChild(hud.root);

  // Right column
  const rightCol = document.createElement('div');
  rightCol.className = 'jarvis-desk-right-col';

  // ── Agent cards row
  const agentRow = document.createElement('div');
  agentRow.className = 'jarvis-agent-row';
  agentRow.appendChild(tom.renderStatusCard());
  agentRow.appendChild(scout.renderStatusCard());
  agentRow.appendChild(support.renderStatusCard());

  // ── Briefing panel
  const briefingPanel = document.createElement('div');
  briefingPanel.className = 'jarvis-briefing-panel';
  const briefingContent = executive.renderSummaryCard(); // empty state initially
  briefingPanel.appendChild(briefingContent);

  // ── Quick actions toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'jarvis-toolbar';

  const btnBriefing = makeBtn('📋 Morning Briefing', 'jarvis-btn-primary', async () => {
    btnBriefing.disabled = true;
    btnBriefing.textContent = '⏳ Generating…';
    try {
      const [revenueStats, adsStats, supportBriefing, devBriefing, contentBriefing] = await Promise.all([
        revenue.getStats(),
        ads.getStats(),
        support.generateBriefing(),
        tom.generateBriefing(),
        scout.generateBriefing(),
      ]);
      const briefing = await executive.generateBriefing({}, {
        revenue: revenueStats,
        ads: adsStats,
        support: { greeting: supportBriefing.greeting, summary: supportBriefing.summary, recommendation: supportBriefing.recommendation },
        developer: { greeting: devBriefing.greeting, health: devBriefing.health, recommendation: devBriefing.recommendation },
        content: { greeting: contentBriefing.greeting, metrics: contentBriefing.metrics, recommendation: contentBriefing.recommendation },
      });
      // Replace briefing content
      briefingPanel.replaceChildren(executive.renderSummaryCard(briefing));
      hud.pulseMessage('Briefing complete — ' + briefing.summary);
      notify('JARVIS briefing generated successfully.');
    } catch (err) {
      notify('Briefing error: ' + String(err));
    } finally {
      btnBriefing.disabled = false;
      btnBriefing.textContent = '📋 Morning Briefing';
    }
  });

  const btnAutoTriage = makeBtn('🎧 Auto-Triage Support', '', async () => {
    btnAutoTriage.disabled = true;
    try {
      const count = support.autoTriage();
      hud.pulseMessage(`Support auto-triage: ${count} conversation(s) resolved.`);
      notify(`Auto-triage complete: ${count} resolved.`);
    } finally {
      btnAutoTriage.disabled = false;
    }
  });

  const btnAddTask = makeBtn('🤖 New Dev Task', '', () => {
    const title = prompt('Task title:');
    if (!title?.trim()) return;
    tom.addTask('feature', title.trim(), 'medium');
    hud.pulseMessage(`Tom: task added — "${title}"`);
    notify(`Dev task queued: "${title}"`);
  });

  const btnScoutAngle = makeBtn('📡 Scout Angle', '', () => {
    const angles = scout.suggestAngles(1);
    hud.pulseMessage(`Scout: try "${angles[0]}"`);
    notify(`Scout suggests: ${angles[0]}`);
  });

  // ── Voice Companion Engine Setup
  const speaker = new JarvisSpeaker({
    onStart: () => {
      hud.pulseMessage('JARVIS Speaking...');
    },
    onEnd: () => {
      // resume idle state
    },
  });

  const voiceAgent = new JarvisVoiceAgent({
    switchView: (v) => {
      if (options?.voiceActionContext?.switchView) {
        options.voiceActionContext.switchView(v);
      }
    },
    playMusic: options?.voiceActionContext?.playMusic,
    pauseMusic: options?.voiceActionContext?.pauseMusic,
    nextTrack: options?.voiceActionContext?.nextTrack,
    saveQuickNote: options?.voiceActionContext?.saveQuickNote,
    askAI: options?.voiceActionContext?.askAI,
    triageSupport: () => support.autoTriage(),
    runDevHealth: async () => {
      const h = await tom.checkCodeHealth();
      return `Build status is ${h.buildStatus}. ${h.testsPassing} of ${h.testsTotal} tests passing with zero errors.`;
    },
    getBriefing: async () => {
      const b = await executive.generateBriefing();
      return b.summary;
    },
    notify: (msg) => notify(msg),
  });

  // ── Voice companion status pill & controls
  const voiceBar = document.createElement('div');
  voiceBar.className = 'jarvis-voice-bar';

  const micBtn = document.createElement('button');
  micBtn.className = 'jarvis-mic-btn';
  micBtn.innerHTML = '🎙️ <span class="mic-label">Voice: OFF</span>';
  micBtn.title = 'Toggle Autonomous Voice Companion (Say "Jarvis" or speak commands)';

  const voiceSelect = document.createElement('select');
  voiceSelect.className = 'jarvis-voice-select';
  voiceSelect.title = 'Select Voice Profile from Voice Pack';
  for (const v of JARVIS_VOICE_PACK) {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = `🗣️ ${v.name}`;
    if (v.id === getSelectedVoiceId()) opt.selected = true;
    voiceSelect.appendChild(opt);
  }
  voiceSelect.addEventListener('change', () => {
    setSelectedVoiceId(voiceSelect.value);
    const prof = JARVIS_VOICE_PACK.find(p => p.id === voiceSelect.value);
    hud.pulseMessage(`Voice pack profile set to: ${prof?.name || voiceSelect.value}`);
    notify(`JARVIS voice set to: ${prof?.name}`);
  });

  const speechStatusEl = document.createElement('div');
  speechStatusEl.className = 'jarvis-speech-status';
  speechStatusEl.textContent = 'Say "Hey Jarvis" or tap mic to speak.';

  const listener = new JarvisVoiceListener({
    onListeningStateChange: (listening) => {
      micBtn.classList.toggle('active', listening);
      micBtn.querySelector('.mic-label')!.textContent = listening ? 'Voice: LISTENING' : 'Voice: OFF';
      if (listening) {
        speechStatusEl.textContent = 'Listening... Speak anything to JARVIS';
      }
    },
    onInterimSpeech: (transcript) => {
      speechStatusEl.textContent = `Hearing: "${transcript}"...`;
    },
    onFinalSpeech: async (finalTranscript) => {
      speechStatusEl.textContent = `Processing: "${finalTranscript}"`;
      hud.pulseMessage(`Voice command: "${finalTranscript}"`);
      const result = await voiceAgent.processVoiceInput(finalTranscript);
      speechStatusEl.textContent = `JARVIS: ${result.speechReply}`;
      await speaker.speak(result.speechReply);
    },
    onError: (err) => {
      speechStatusEl.textContent = err;
    },
  });

  micBtn.addEventListener('click', () => {
    if (listener.getListeningState()) {
      listener.stop();
      speechStatusEl.textContent = 'Voice companion standby.';
    } else {
      const ok = listener.start();
      if (!ok) {
        speechStatusEl.textContent = 'Microphone permission or speech recognition unavailable in this window.';
      }
    }
  });

  voiceBar.append(micBtn, voiceSelect, speechStatusEl);

  toolbar.append(btnBriefing, btnAutoTriage, btnAddTask, btnScoutAngle);

  rightCol.append(voiceBar, agentRow, briefingPanel, toolbar);
  mainLayout.append(hudCol, rightCol);
  root.append(header, mainLayout);

  // ── Start telemetry polling and wire to HUD
  const stopPolling = startTelemetryPolling(stats => {
    hud.updateTelemetry(stats);
  }, 2000);

  // Initial pulse
  hud.pulseMessage('JARVIS Command Center online. Good morning, sir.');

  function destroy(): void {
    listener.stop();
    speaker.stop();
    stopPolling();
    hud.destroy();
  }

  return { root, destroy, listener, speaker, agent: voiceAgent };
}

function makeBtn(label: string, extraClass: string, onClick: () => void | Promise<void>): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'jarvis-btn' + (extraClass ? ' ' + extraClass : '');
  btn.textContent = label;
  btn.addEventListener('click', () => void onClick());
  return btn;
}

function injectDeskStyles(): void {
  if (document.getElementById('jarvis-desk-styles')) return;
  const style = document.createElement('style');
  style.id = 'jarvis-desk-styles';
  style.textContent = `
    .jarvis-command-desk {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      background: #020d14;
      color: #7de8ff;
      font-family: 'Courier New', Courier, monospace;
      min-height: 100%;
      box-sizing: border-box;
    }
    .jarvis-desk-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: rgba(0,170,255,0.08);
      border: 1px solid rgba(0,170,255,0.3);
      border-radius: 6px;
    }
    .jarvis-desk-title {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .jarvis-logo {
      font-size: 28px;
      color: #0af;
      text-shadow: 0 0 12px rgba(0,170,255,0.8);
      animation: core-pulse 2s ease-in-out infinite;
    }
    .jarvis-desk-title h2 {
      margin: 0;
      font-size: 18px;
      font-weight: bold;
      color: #0af;
      letter-spacing: 0.15em;
    }
    .jarvis-desk-title p {
      margin: 2px 0 0;
      font-size: 10px;
      opacity: 0.6;
      letter-spacing: 0.1em;
    }
    .jarvis-desk-status {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: #00ff88;
      letter-spacing: 0.1em;
    }
    .jarvis-online-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #00ff88;
      box-shadow: 0 0 8px #00ff88;
      animation: online-blink 2s ease-in-out infinite;
    }
    @keyframes online-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .jarvis-desk-main {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 10px;
      flex: 1;
    }
    .jarvis-desk-hud-col { display: flex; flex-direction: column; }
    .jarvis-desk-right-col { display: flex; flex-direction: column; gap: 10px; }
    /* Agent cards */
    .jarvis-agent-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
    }
    .jarvis-agent-card {
      background: rgba(0,170,255,0.06);
      border: 1px solid rgba(0,170,255,0.25);
      border-radius: 6px;
      padding: 10px;
      font-size: 11px;
    }
    .agent-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
      border-bottom: 1px solid rgba(0,170,255,0.15);
      padding-bottom: 6px;
    }
    .agent-avatar { font-size: 16px; }
    .agent-name { font-weight: bold; color: #0af; font-size: 12px; }
    .agent-role { font-size: 9px; opacity: 0.5; margin-left: auto; }
    .agent-metric {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
      font-size: 10px;
    }
    .agent-metric span { opacity: 0.6; }
    .status-clean { color: #00ff88; }
    /* Briefing panel */
    .jarvis-briefing-panel {
      background: rgba(0,170,255,0.04);
      border: 1px solid rgba(0,170,255,0.2);
      border-radius: 6px;
      padding: 12px;
      flex: 1;
      overflow-y: auto;
      font-size: 11px;
    }
    .jarvis-dim { opacity: 0.5; font-style: italic; }
    .jarvis-briefing-card h3 { margin: 0 0 8px; }
    /* Voice Bar */
    .jarvis-voice-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      background: rgba(0,170,255,0.08);
      border: 1px solid rgba(0,170,255,0.3);
      border-radius: 6px;
    }
    .jarvis-mic-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 20px;
      border: 1px solid rgba(0,170,255,0.4);
      background: rgba(0,170,255,0.12);
      color: #7de8ff;
      font-family: inherit;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.3s;
    }
    .jarvis-mic-btn.active {
      background: rgba(255,50,50,0.25);
      border-color: #ff4444;
      color: #ffaaaa;
      animation: mic-pulse 1.5s infinite;
    }
    @keyframes mic-pulse {
      0%, 100% { box-shadow: 0 0 4px #ff4444; }
      50% { box-shadow: 0 0 14px #ff4444; }
    }
    .jarvis-voice-select {
      background: #020d14;
      border: 1px solid rgba(0,170,255,0.3);
      color: #7de8ff;
      font-family: inherit;
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 4px;
    }
    .jarvis-speech-status {
      font-size: 10px;
      color: rgba(125,232,255,0.7);
      font-style: italic;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      flex: 1;
    }
    /* Toolbar */
    .jarvis-toolbar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .jarvis-btn {
      padding: 7px 14px;
      background: rgba(0,170,255,0.1);
      border: 1px solid rgba(0,170,255,0.4);
      border-radius: 20px;
      color: #7de8ff;
      font-family: inherit;
      font-size: 11px;
      cursor: pointer;
      transition: background 0.2s, box-shadow 0.2s;
      white-space: nowrap;
    }
    .jarvis-btn:hover {
      background: rgba(0,170,255,0.22);
      box-shadow: 0 0 10px rgba(0,170,255,0.3);
    }
    .jarvis-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .jarvis-btn-primary {
      background: rgba(0,170,255,0.2);
      border-color: #0af;
      color: #fff;
      font-weight: bold;
    }
    .jarvis-btn-primary:hover { background: rgba(0,170,255,0.35); }
  `;
  document.head.appendChild(style);
}
