/**
 * Kevo Command Desk
 * The assembled command center UI for the AnF workspace.
 * Mounts as section('jarvis', 'Kevo', commandDesk.root) in main.ts.
 *
 * Layout:
 * ┌─────────────────────────────────────────────┐
 * │  Kevo  •  Autonomous Command Center        │
 * ├──────────────────┬──────────────────────────┤
 * │  HUD (animated)  │  Agent Cards row         │
 * │                  ├──────────────────────────┤
 * │                  │  Executive Briefing card  │
 * │                  ├──────────────────────────┤
 * │                  │  Quick Actions toolbar    │
 * └──────────────────┴──────────────────────────┘
 */

import { invoke } from '@tauri-apps/api/core';
import { createJarvisHud, kevoHudReporter, kevoState } from './jarvis-hud';
import { JarvisExecutive } from './jarvis-executive';
import { RevenueConnector } from './connectors/revenue-connector';
import { AdsConnector } from './connectors/ads-connector';
import { TomDeveloperAgent } from './agents/tom-developer';
import { ScoutGrowthAgent } from './agents/scout-growth';
import { SupportOperationsAgent } from './agents/support-agent';
import { JarvisVoiceListener, type VoiceListenerOptions } from './voice/jarvis-voice-listener';
import { KevoEarsListener } from './voice/kevo-ears-listener';
import { JarvisSpeaker, onlineVoicesAllowed, setOnlineVoicesAllowed } from './voice/jarvis-speaker';
import { JarvisVoiceAgent, type JarvisActionContext } from './voice/jarvis-voice-agent';
import { clearJarvisHistory } from './voice/jarvis-memory';
import { isEchoOf, unspokenRest } from './voice/jarvis-voice-agent';
import { JARVIS_VOICE_PACK, getSelectedVoiceId, setSelectedVoiceId } from './voice/jarvis-voice-pack';
import { createKevoLog, type KevoLogStore } from './kevo-log';
import { Bridge } from '../../core/bridge';
import { runKevoSelfTest } from './kevo-selftest';

export interface JarvisCommandDeskOptions {
  onNotify?: (msg: string) => void;
  voiceActionContext?: Partial<JarvisActionContext>;
  hearing?: 'pc' | 'browser';
  /** Kevo's log on this PC; adds "Save log" and "Open log folder" to the voice bar. */
  log?: KevoLogStore;
}

export function createJarvisCommandDesk(options?: JarvisCommandDeskOptions): {
  root: HTMLElement;
  destroy: () => void;
  listener: JarvisVoiceListener | KevoEarsListener;
  speaker: JarvisSpeaker;
  agent: JarvisVoiceAgent;
} {
  const notify = options?.onNotify ?? ((msg: string) => { console.log('[Kevo]', msg); });
  const log = createKevoLog(options?.log?.append);

  // ── Instantiate all subsystems
  const hud = createJarvisHud();
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
  root.setAttribute('aria-label', 'Kevo Command Center');

  // ── Inject desk styles
  injectDeskStyles();

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

  const btnBriefing = makeBtn('Morning briefing', 'jarvis-btn-primary', async () => {
    btnBriefing.disabled = true;
    btnBriefing.textContent = 'Writing the briefing…';
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
      notify('Kevo briefing generated successfully.');
    } catch (err) {
      notify('Briefing error: ' + String(err));
    } finally {
      btnBriefing.disabled = false;
      btnBriefing.textContent = 'Morning briefing';
    }
  });

  const btnAutoTriage = makeBtn('Triage support', '', async () => {
    btnAutoTriage.disabled = true;
    try {
      const count = support.autoTriage();
      hud.pulseMessage(`Support auto-triage: ${count} conversation(s) resolved.`);
      notify(`Auto-triage complete: ${count} resolved.`);
    } finally {
      btnAutoTriage.disabled = false;
    }
  });

  const btnAddTask = makeBtn('New dev task', '', () => {
    const title = prompt('Task title:');
    if (!title?.trim()) return;
    tom.addTask('feature', title.trim(), 'medium');
    hud.pulseMessage(`Tom: task added — "${title}"`);
    notify(`Dev task queued: "${title}"`);
  });

  const btnScoutAngle = makeBtn('Suggest an angle', '', () => {
    const angles = scout.suggestAngles(1);
    hud.pulseMessage(`Scout: try "${angles[0]}"`);
    notify(`Scout suggests: ${angles[0]}`);
  });

  // ── Voice Companion Engine Setup
  let unmuteTimer: ReturnType<typeof setTimeout> | undefined;
  let thinking = false;
  let lastReply = '';
  let turn = 0;
  /** Notes when the current request's answer starts being spoken (Kevo's log). */
  let markSpoken: (() => void) | null = null;
  /** Things Kevo has to say on its own (a timer going off) that came while it was busy: said once it is free. */
  const pending: string[] = [];
  function sayPending(): void {
    const text = pending.splice(0).join(' ');
    if (!text) return;
    lastReply = text;
    hud.setReply(text);
    // A timer that went off while this was being said is said next.
    void speaker.speak(text).then(() => { if (pending.length && !thinking && !speaker.getIsSpeaking()) sayPending(); });
  }
  const reportState = kevoHudReporter(invoke);
  /** Shows on the orb, and tells the float HUD, what Kevo is doing right now. */
  const refresh = () => {
    const state = kevoState({
      micOn: listener.getListeningState(), awake: listener.isAwake(), thinking, speaking: speaker.getIsSpeaking(),
    });
    hud.setState(state);
    reportState(state);
  };
  const speaker = new JarvisSpeaker({
    onStart: () => {
      markSpoken?.();
      refresh();
      clearTimeout(unmuteTimer);
      listener.setMuted(true);
    },
    onEnd: () => {
      refresh();
      // A short pause lets the room echo die down; then a follow-up needs no wake word.
      clearTimeout(unmuteTimer);
      unmuteTimer = setTimeout(() => {
        if (speaker.getIsSpeaking() || thinking) return; // a newer request took over
        listener.setMuted(false);
        listener.keepAwake();
      }, 400);
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
    setMusicVolume: options?.voiceActionContext?.setMusicVolume,
    getWeather: options?.voiceActionContext?.getWeather,
    weatherEnabled: options?.voiceActionContext?.weatherEnabled,
    setWeatherEnabled: options?.voiceActionContext?.setWeatherEnabled,
    searchMusic: options?.voiceActionContext?.searchMusic,
    searchVault: options?.voiceActionContext?.searchVault,
    openApp: options?.voiceActionContext?.openApp,
    openQuickCapture: options?.voiceActionContext?.openQuickCapture,
    saveQuickNote: options?.voiceActionContext?.saveQuickNote,
    askAI: options?.voiceActionContext?.askAI,
    searchWeb: options?.voiceActionContext?.searchWeb,
    openUrl: options?.voiceActionContext?.openUrl,
    // "Change your voice": the same as choosing it in the list, without the recording (Kevo answers in the new voice).
    changeVoice: (name) => {
      const short = (v: (typeof JARVIS_VOICE_PACK)[number]) => v.name.replace(/\s*\(.*$/, '').toLowerCase();
      const at = JARVIS_VOICE_PACK.findIndex((v) => v.id === voiceSelect.value);
      const next = name
        ? JARVIS_VOICE_PACK.find((v) => short(v) === name.toLowerCase()) ?? JARVIS_VOICE_PACK.find((v) => name.toLowerCase().includes(short(v)) || v.name.toLowerCase().includes(name.toLowerCase()))
        : JARVIS_VOICE_PACK[(at + 1) % JARVIS_VOICE_PACK.length];
      if (!next) return null;
      voiceSelect.value = next.id;
      setSelectedVoiceId(next.id);
      hud.pulseMessage(`Voice set to ${next.name}`);
      return next.name.replace(/\s*\(.*$/, '');
    },
    voiceNames: () => JARVIS_VOICE_PACK.map((v) => v.name.replace(/\s*\(.*$/, '')),
    // A timer going off: always listed, and said aloud now or, if Kevo is busy, right after the current answer.
    announce: (text) => {
      log('timer_fired', { text });
      hud.pulseMessage(`Kevo: ${text}`);
      pending.push(text);
      if (!thinking && !speaker.getIsSpeaking()) sayPending();
    },
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

  /** Carries out one request, spoken or typed, and answers it. */
  async function handleCommand(request: string, typed = false): Promise<void> {
    // Kevo's own words coming back through the microphone are not a command. Typed text is never an echo.
    if (thinking) return;
    if (!typed && isEchoOf(request, lastReply)) { log('ignored', { text: request, reason: 'own_voice' }); return; }
    const asked = ++turn;
    const heardAt = Date.now();
    let spokenAt = 0;
    markSpoken = () => { spokenAt ||= Date.now(); };
    let actionName = 'none';
    let reply = '';
    // One line per request; a timer that was set shows as actionName "timer_set".
    const record = () => log('request', {
      text: request, typed, actionName, reply: reply.slice(0, 2000), ms: spokenAt ? spokenAt - heardAt : null,
    });
    hud.setHeard(request);
    hud.pulseMessage(`You: ${request}`);
    thinking = true;
    stopBtn.hidden = false;
    // One command at a time: the microphone rests until Kevo has answered.
    clearTimeout(unmuteTimer);
    listener.setMuted(true);
    refresh();
    // An AI answer is shown and spoken sentence by sentence while the rest is still being written.
    let stream: ReturnType<JarvisSpeaker['beginStream']> | null = null;
    let shown = '';
    let complete = false;
    const onPart = (part: string) => {
      if (asked !== turn || complete) return;
      shown = shown ? `${shown} ${part}` : part;
      hud.setReply(shown);
      (stream ??= speaker.beginStream()).push(part);
    };
    try {
      ({ actionName, speechReply: reply } = await voiceAgent.processVoiceInput(request, onPart));
    } catch (err) {
      actionName = 'error';
      reply = 'That did not work: ' + String(err).replace(/^Error:\s*/, '');
    } finally {
      thinking = false;
    }
    if (asked !== turn) {
      // Stopped, or a new conversation was started, while Kevo was working: this answer is not wanted.
      record();
      return;
    }
    lastReply = reply;
    if (reply) {
      hud.setReply(reply);
      hud.pulseMessage(`Kevo: ${reply}`);
    }
    refresh();
    // The whole answer is here. A last sentence whose event has not arrived yet is spoken from the answer itself.
    complete = true;
    const rest = unspokenRest(shown, reply);
    const live = stream as ReturnType<JarvisSpeaker['beginStream']> | null;
    if (live && rest) live.push(rest);
    await (live ? live.end() : speaker.speak(reply));
    record();
    if (asked !== turn) return; // a typed request took over while this one was being spoken
    stopBtn.hidden = true;
    if (pending.length) { sayPending(); return; } // its end gives the microphone back
    // Nothing to say means no speech ever ends: give the microphone back here.
    if (!reply.trim()) { listener.setMuted(false); listener.keepAwake(); refresh(); }
  }

  /** Stops whatever Kevo is doing: the answer being written and the one being spoken. */
  function stopNow(): void {
    turn++;
    thinking = false;
    voiceAgent.abandon();
    options?.voiceActionContext?.cancelAI?.();
    pending.length = 0; // Stop means quiet; a timer that went off is still listed under Activity
    speaker.stop();
    stopBtn.hidden = true;
    clearTimeout(unmuteTimer);
    listener.setMuted(false);
    refresh();
  }
  const stopBtn = makeBtn('Stop', '', () => { log('stop'); stopNow(); });
  stopBtn.hidden = true;

  // Typing works the same as speaking, for when talking is not possible.
  const typeBox = document.createElement('form');
  typeBox.className = 'jarvis-type';
  const typeInput = document.createElement('input');
  typeInput.type = 'text';
  typeInput.placeholder = 'Or type what you need';
  typeInput.setAttribute('aria-label', 'Type a request for Kevo');
  typeInput.maxLength = 500;
  const typeSend = makeBtn('Ask', '', () => {});
  typeSend.type = 'submit';
  typeBox.append(typeInput, typeSend);
  typeBox.addEventListener('submit', (event) => {
    event.preventDefault();
    const request = typeInput.value.trim();
    if (!request || thinking) return;
    typeInput.value = '';
    speaker.stop(); // a new request replaces what Kevo was saying
    void handleCommand(request, true);
  });

  // ── Voice controls
  const voiceBar = document.createElement('div');
  voiceBar.className = 'jarvis-voice-bar';

  const micBtn = document.createElement('button');
  micBtn.type = 'button';
  micBtn.className = 'jarvis-mic-btn';
  micBtn.textContent = 'Turn microphone on';
  micBtn.setAttribute('aria-pressed', 'false');
  micBtn.title = 'Commands need “Kevo”, except right after you turn the microphone on or Kevo replies.';

  const voiceSelect = document.createElement('select');
  voiceSelect.className = 'jarvis-voice-select';
  voiceSelect.setAttribute('aria-label', 'Kevo’s voice');
  for (const v of JARVIS_VOICE_PACK) {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.name;
    if (v.id === getSelectedVoiceId()) opt.selected = true;
    voiceSelect.appendChild(opt);
  }
  voiceSelect.addEventListener('change', () => {
    setSelectedVoiceId(voiceSelect.value);
    const prof = JARVIS_VOICE_PACK.find(p => p.id === voiceSelect.value);
    hud.pulseMessage(`Voice set to ${prof?.name || voiceSelect.value}`);
    // The whole recording, with the microphone resting: a 1-second cue sounded cut off (session 3).
    // Choosing another voice stops this one; Stop stops it too.
    if (prof) { stopBtn.hidden = false; void speaker.playSample(prof.filename).finally(() => { if (!thinking) stopBtn.hidden = true; }); }
  });

  // The built-in recording of the chosen voice, in full.
  const previewBtn = makeBtn('Hear this voice', '', async () => {
    const prof = JARVIS_VOICE_PACK.find(p => p.id === voiceSelect.value);
    if (!prof) return;
    previewBtn.disabled = true;
    try {
      if (!await speaker.playSample(prof.filename)) speechStatusEl.textContent = 'The recording for this voice is missing from this build.';
    } finally {
      previewBtn.disabled = false;
    }
  });

  const speechStatusEl = document.createElement('p');
  speechStatusEl.className = 'jarvis-speech-status';
  speechStatusEl.setAttribute('role', 'status');

  const listenerOptions: VoiceListenerOptions = {
    onAwakeChange: () => refresh(),
    onListeningStateChange: (listening) => {
      log('mic', { on: listening });
      micBtn.classList.toggle('active', listening);
      micBtn.setAttribute('aria-pressed', String(listening));
      micBtn.textContent = listening ? 'Turn microphone off' : 'Turn microphone on';
      if (listening) speechStatusEl.textContent = '';
      refresh();
    },
    onInterimSpeech: (transcript) => {
      if (listener.isAwake()) hud.setHeard(transcript);
    },
    onWakeWord: (word) => {
      log('wake', { word });
      hud.setWakeActive(true);
      // The microphone rests while the tone plays, so the tone is not heard as speech.
      listener.setMuted(true);
      void speaker.playWakeTone().finally(() => {
        if (thinking || speaker.getIsSpeaking()) return; // a command came with the name; its reply gives the microphone back
        listener.setMuted(false);
        listener.keepAwake();
      });
    },
    onFinalSpeech: (finalTranscript) => handleCommand(finalTranscript),
    onBargeIn: () => {
      // Step 1.6: Talking over Kevo stops playback within 300 ms
      if (speaker.getIsSpeaking()) {
        log('barge_in', {});
        speaker.stop();
        listener.setMuted(false);
        listener.keepAwake();
        refresh();
      }
    },
    onIgnored: (text, reason) => log('ignored', { text, reason }),
    onError: (err, code) => {
      log('recognition_error', { code: code ?? null, message: err });
      speechStatusEl.textContent = err;
    },
  };

  const usePcHearing = (options?.hearing ?? (typeof localStorage !== 'undefined' ? (localStorage.getItem('kevo-hearing') ?? 'pc') : 'pc')) !== 'browser';
  const listener: JarvisVoiceListener | KevoEarsListener = usePcHearing && typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    ? new KevoEarsListener(listenerOptions)
    : new JarvisVoiceListener(listenerOptions);

  micBtn.addEventListener('click', () => {
    if (listener.getListeningState()) {
      listener.stop();
      speaker.stop(); // turning the microphone off also stops Kevo talking
    } else if (!listener.start()) {
      speechStatusEl.textContent = 'The microphone or speech recognition is not available in this window. Check the microphone permission in Windows settings.';
    }
  });

  // Microsoft's natural voices are online: replies are sent to Microsoft to be spoken. On by default; this box turns them off.
  const onlineToggle = document.createElement('label');
  onlineToggle.className = 'jarvis-online-voices';
  onlineToggle.title = 'Natural voices sound more human but send each reply to Microsoft to be spoken. Off: only voices installed on this computer.';
  const onlineBox = document.createElement('input');
  onlineBox.type = 'checkbox';
  onlineBox.checked = onlineVoicesAllowed();
  onlineBox.addEventListener('change', () => setOnlineVoicesAllowed(onlineBox.checked));
  onlineToggle.append(onlineBox, ' Natural online voices (replies are sent to Microsoft to be spoken)');

  // Kevo remembers the last few exchanges; this starts over.
  const forgetBtn = makeBtn('New conversation', '', () => {
    stopNow(); // also abandons an answer being written, so it is never saved into the fresh conversation
    clearJarvisHistory();
    voiceAgent.resetConversation();
    lastReply = '';
    hud.setHeard('');
    hud.setReply('Starting fresh. Say “Kevo” and what you need.');
    hud.pulseMessage('New conversation started');
  });

  voiceBar.append(micBtn, stopBtn, voiceSelect, previewBtn, forgetBtn);
  // Kevo's log stays on this PC; Save log puts a copy in Downloads for a test report.
  const store = options?.log;
  if (store) {
    voiceBar.append(
      makeBtn('Save log', '', async () => {
        try { speechStatusEl.textContent = `Kevo's log saved to ${await store.save()}`; }
        catch (err) { speechStatusEl.textContent = `Could not save Kevo's log: ${String(err).replace(/^Error:\s*/, '')}`; }
      }),
      makeBtn('Open log folder', '', async () => {
        try { await store.openFolder(); }
        catch (err) { speechStatusEl.textContent = `Could not open the log folder: ${String(err).replace(/^Error:\s*/, '')}`; }
      }),
    );
  }
  // "Run self-test" button on the Kevo screen (Phase 0 step 0.4b)
  const btnRunSelfTest = makeBtn('Run self-test', '', async () => {
    btnRunSelfTest.disabled = true;
    speechStatusEl.textContent = 'Running self-test...';
    try {
      if (options?.voiceActionContext) options.voiceActionContext.dryRun = true;
      const report = await runKevoSelfTest({
        agent: voiceAgent,
        listener,
        onProgress: (step) => { speechStatusEl.textContent = step; },
      });
      if (options?.voiceActionContext) options.voiceActionContext.dryRun = false;
      speechStatusEl.textContent = `Self-test complete: ${report.result}`;
      hud.pulseMessage(`Self-test complete: ${report.result}`);
    } catch (err) {
      speechStatusEl.textContent = `Self-test error: ${String(err)}`;
    } finally {
      btnRunSelfTest.disabled = false;
    }
  });

  voiceBar.append(btnRunSelfTest, onlineToggle, speechStatusEl);

  // When launched with --kevo-selftest, start listening in dry-run, execute the self-test, and quit
  void Bridge.isKevoSelftest().then(async (selftestActive) => {
    if (selftestActive) {
      if (options?.voiceActionContext) options.voiceActionContext.dryRun = true;
      listener.start();
      try {
        await runKevoSelfTest({
          agent: voiceAgent,
          listener,
          onProgress: (step) => { speechStatusEl.textContent = step; },
        });
      } finally {
        await Bridge.quitApp();
      }
    }
  });

  toolbar.append(btnBriefing, btnAutoTriage, btnAddTask, btnScoutAngle);

  const team = document.createElement('section');
  team.className = 'jarvis-team';
  team.setAttribute('aria-label', 'Team');
  const teamTitle = document.createElement('h3');
  teamTitle.className = 'jarvis-panel-title';
  teamTitle.textContent = 'Team';
  team.append(teamTitle, agentRow, briefingPanel, toolbar);

  // The page already shows "Kevo" as its title, so the desk does not repeat it.
  root.append(hud.root, typeBox, voiceBar, team);

  function destroy(): void {
    listener.stop();
    speaker.stop();
    clearTimeout(unmuteTimer);
    voiceAgent.dispose();
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
    /* Uses the workspace tokens from anf-design.css, so Kevo follows the light, dark and theme-pack looks. */
    .jarvis-command-desk {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
      box-sizing: border-box;
      container-type: inline-size;
      color: var(--ink, #edf4ef);
    }
    .jarvis-type { display: flex; gap: 8px; min-width: 0; }
    .jarvis-type input { flex: 1 1 auto; min-width: 0; }
    .jarvis-voice-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; min-width: 0; }
    .jarvis-voice-select { width: auto; flex: 0 1 auto; min-width: 0; max-width: 100%; }
    .jarvis-online-voices { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted, #b0c4bd); cursor: pointer; min-width: 0; }
    .jarvis-online-voices input { width: auto; flex: none; }
    .jarvis-speech-status { flex: 1 1 100%; margin: 0; font-size: 13px; color: var(--muted, #b0c4bd); min-width: 0; overflow-wrap: anywhere; }
    .jarvis-speech-status:empty { display: none; }

    .jarvis-btn, .jarvis-mic-btn { transition: transform .12s cubic-bezier(.16,1,.3,1); }
    .jarvis-btn:active, .jarvis-mic-btn:active { transform: scale(.97); }
    .jarvis-mic-btn, .jarvis-btn-primary {
      background: var(--accent, #a3e5cd);
      color: var(--accent-ink, #10392e);
      border-color: transparent;
      font-weight: 600;
    }
    .jarvis-mic-btn.active { background: transparent; color: var(--ink, #edf4ef); border-color: var(--line, #385052); }
    .jarvis-btn:disabled { opacity: .55; cursor: default; }

    .jarvis-team { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
    .jarvis-panel-title { margin: 0; font-size: 13px; font-weight: 600; color: var(--muted, #b0c4bd); }
    .jarvis-agent-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
    .jarvis-agent-card, .jarvis-briefing-panel {
      background: var(--surface, #182a2d);
      border: 1px solid var(--line, #385052);
      border-radius: var(--radius, 16px);
      padding: 14px;
      min-width: 0;
      font-size: 13px;
    }
    .agent-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
    .agent-avatar { display: none; }
    .agent-name { font-weight: 600; font-size: 15px; }
    .agent-role { margin-left: auto; font-size: 12px; color: var(--muted, #b0c4bd); }
    .agent-metric { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; }
    .agent-metric span { color: var(--muted, #b0c4bd); }
    .jarvis-dim { color: var(--muted, #b0c4bd); }
    .jarvis-toolbar { display: flex; flex-wrap: wrap; gap: 8px; }
    @media (prefers-reduced-motion: reduce) { .jarvis-btn, .jarvis-mic-btn { transition: none; } }
  `;
  document.head.appendChild(style);
}
