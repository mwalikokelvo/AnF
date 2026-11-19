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
import { TomDeveloperAgent } from './agents/tom-developer';
import { ScoutGrowthAgent } from './agents/scout-growth';
import { SupportOperationsAgent } from './agents/support-agent';
import { fetchSystemTelemetry } from './connectors/system-connector';
import { JarvisVoiceListener, type VoiceListenerOptions } from './voice/jarvis-voice-listener';
import { KevoEarsListener } from './voice/kevo-ears-listener';
import { JarvisSpeaker, onlineVoicesAllowed, setOnlineVoicesAllowed } from './voice/jarvis-speaker';
import { JarvisVoiceAgent, type JarvisActionContext } from './voice/jarvis-voice-agent';
import { clearJarvisHistory, listFacts, deleteFact, clearFacts, type KevoFact } from './voice/jarvis-memory';
import { listReminders, cancelReminder, clearReminders, getDailyBriefingSchedule, type KevoReminder } from './voice/jarvis-schedule';
import { isEchoOf, unspokenRest } from './voice/jarvis-voice-agent';
import { JARVIS_VOICE_PACK, getSelectedVoiceId, setSelectedVoiceId } from './voice/jarvis-voice-pack';
import { createKevoLog, type KevoLogStore } from './kevo-log';
import { Bridge } from '../../core/bridge';
import { runKevoSelfTest } from './kevo-selftest';
import { loadReadingQueue } from '../article-publishing';

export interface JarvisCommandDeskOptions {
  onNotify?: (msg: string) => void;
  voiceActionContext?: Partial<JarvisActionContext>;
  /** Kevo's log on this PC; adds "Save log" and "Open log folder" to the voice bar. */
  log?: KevoLogStore;
  activeModel?: () => string;
}

export function formatModelDisplayName(modelId?: string): string {
  if (!modelId) return 'DeepSeek V4 Pro 9B';
  const lower = modelId.toLowerCase();
  if (lower.includes('deepseek-v4-pro') || lower.includes('qwen3.5-9b')) return 'DeepSeek V4 Pro 9B';
  if (lower.includes('deepseek')) return 'DeepSeek R1';
  if (lower.includes('kimi')) return 'Kimi Linear';
  if (lower.includes('0.6b') || lower === 'fast') return 'Qwen 0.6B Q8';
  if (lower.includes('1.7b') || lower === 'balanced') return 'Qwen 1.7B Q8';
  if (lower.includes('3b')) return 'Qwen 3B Q4';
  if (lower.includes('7b')) return 'Qwen 7B Q4';
  return modelId;
}

export function formatTtfsBadge(elapsedMs: number, modelName: string): string {
  const sec = (elapsedMs / 1000).toFixed(1);
  return `First sentence: ${sec} s (Model: ${modelName})`;
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
      const [allReminders, dailySched, telemetry] = await Promise.all([
        listReminders().catch(() => []),
        getDailyBriefingSchedule().catch(() => null),
        fetchSystemTelemetry().catch(() => null),
      ]);
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      const remindersToday = (allReminders as KevoReminder[]).filter(
        (r) => r.trigger_at >= startOfDay.getTime() && r.trigger_at <= endOfDay.getTime()
      ).length;

      let pendingReading = 0;
      try {
        pendingReading = loadReadingQueue().length;
      } catch {}

      const vaultNotes = options?.voiceActionContext?.notes?.length ?? 0;

      const briefing = await executive.generateBriefing({}, {
        vault: { totalNotes: vaultNotes, status: 'operational' },
        reading: { pendingItems: pendingReading },
        schedule: {
          remindersToday,
          dailyBriefingScheduled: !!dailySched,
          dailyBriefingTime: dailySched?.message.match(/\(([^)]+)\)/)?.[1],
        },
        system: {
          audioEngineStatus: telemetry?.audioEngineStatus ?? 'idle',
          memoryUsedMb: telemetry?.memoryUsedMb,
        },
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
  interface ActionHistoryEntry {
    time: string;
    request: string;
    actionName: string;
    status: 'success' | 'failure' | 'unverified';
    verified: boolean;
    reason?: string;
    ms: number;
  }
  const actionHistory: ActionHistoryEntry[] = [];
  let renderActionList: () => void = () => {};
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
    getBriefing: async () => {
      const [allReminders, dailySched, telemetry] = await Promise.all([
        listReminders().catch(() => []),
        getDailyBriefingSchedule().catch(() => null),
        fetchSystemTelemetry().catch(() => null),
      ]);
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      const remindersToday = (allReminders as KevoReminder[]).filter(
        (r) => r.trigger_at >= startOfDay.getTime() && r.trigger_at <= endOfDay.getTime()
      ).length;
      let pendingReading = 0;
      try { pendingReading = loadReadingQueue().length; } catch {}
      const b = await executive.generateBriefing({}, {
        vault: { totalNotes: options?.voiceActionContext?.notes?.length ?? 0, status: 'operational' },
        reading: { pendingItems: pendingReading },
        schedule: {
          remindersToday,
          dailyBriefingScheduled: !!dailySched,
          dailyBriefingTime: dailySched?.message.match(/\(([^)]+)\)/)?.[1],
        },
        system: {
          audioEngineStatus: telemetry?.audioEngineStatus ?? 'idle',
          memoryUsedMb: telemetry?.memoryUsedMb,
        },
      });
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
    let firstSentenceAt = 0;

    const recordTtfs = () => {
      if (firstSentenceAt) return;
      firstSentenceAt = Date.now();
      const elapsedMs = firstSentenceAt - heardAt;
      const rawModel = options?.activeModel?.() ?? options?.voiceActionContext?.getActiveModel?.() ?? 'Qwen 1.7B Q8';
      const activeModel = formatModelDisplayName(rawModel);
      log('ttfs', { type: 'ttfs', ms: elapsedMs, model: activeModel, text: request });
      const badge = formatTtfsBadge(elapsedMs, activeModel);
      hud.setBadge(badge);
      if (typeof options?.voiceActionContext?.setFloatBadge === 'function') {
        options.voiceActionContext.setFloatBadge(badge);
      } else {
        try { void invoke('kevo_hud_set_badge', { badge }).catch(() => {}); } catch {}
      }
    };

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
      recordTtfs();
      shown = shown ? `${shown} ${part}` : part;
      hud.setReply(shown);
      (stream ??= speaker.beginStream()).push(part);
    };
    let actionStatus: 'success' | 'failure' | 'unverified' = 'unverified';
    let actionVerified = false;
    let actionReason: string | undefined = undefined;
    try {
      const res = await voiceAgent.processVoiceInput(request, onPart);
      actionName = res.actionName;
      reply = res.speechReply;
      actionStatus = res.status ?? (res.handled ? 'success' : 'failure');
      actionVerified = res.verified ?? (actionStatus === 'success');
      actionReason = res.reason ?? res.error;
    } catch (err: any) {
      actionName = 'error';
      reply = 'That did not work: ' + String(err).replace(/^Error:\s*/, '');
      actionStatus = 'failure';
      actionVerified = false;
      actionReason = 'EXECUTION_FAILED';
    } finally {
      thinking = false;
    }
    if (actionName === 'ai_conversation' && reply && reply.trim()) {
      recordTtfs();
    }
    const elapsed = Date.now() - heardAt;
    actionHistory.unshift({
      time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      request,
      actionName,
      status: actionStatus,
      verified: actionVerified,
      reason: actionReason,
      ms: elapsed,
    });
    renderActionList();
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

  // In the desktop app on PC, Kevo Ears (sherpa-onnx) is the sole hearing pipeline.
  const listener: JarvisVoiceListener | KevoEarsListener = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
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

  // Action Activity & Verification Card (Phase 5 Step 5.4)
  const actionSection = document.createElement('section');
  actionSection.className = 'jarvis-action-card';
  actionSection.setAttribute('aria-label', 'Kevo Action Activity & Verification');

  const actionHeader = document.createElement('div');
  actionHeader.className = 'jarvis-panel-header';
  const actionTitle = document.createElement('h3');
  actionTitle.className = 'jarvis-panel-title';
  actionTitle.textContent = 'Action Activity & Verification';

  const clearActionBtn = makeBtn('Clear activity', 'jarvis-btn-dim', () => {
    actionHistory.length = 0;
    renderActionList();
  });
  actionHeader.append(actionTitle, clearActionBtn);

  const actionListEl = document.createElement('ul');
  actionListEl.className = 'jarvis-action-list';

  renderActionList = function(): void {
    actionListEl.replaceChildren();
    if (actionHistory.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'jarvis-action-empty';
      empty.textContent = 'No actions executed yet. Spoken and typed actions will be verified here in real time.';
      actionListEl.appendChild(empty);
      return;
    }
    for (const item of actionHistory.slice(0, 20)) {
      const li = document.createElement('li');
      li.className = 'jarvis-action-item';

      const badge = document.createElement('span');
      if (item.status === 'success' && item.verified) {
        badge.className = 'jarvis-action-badge jarvis-action-badge-success';
        badge.textContent = '✓ Verified';
      } else if (item.status === 'failure') {
        badge.className = 'jarvis-action-badge jarvis-action-badge-failure';
        badge.textContent = item.reason ? `✗ Failed: ${item.reason}` : '✗ Failed';
      } else {
        badge.className = 'jarvis-action-badge jarvis-action-badge-unverified';
        badge.textContent = '? Unverified';
      }

      const name = document.createElement('span');
      name.className = 'jarvis-action-name';
      name.textContent = item.actionName;

      const req = document.createElement('span');
      req.className = 'jarvis-action-req';
      req.textContent = `"${item.request}"`;
      req.title = item.request;

      const meta = document.createElement('span');
      meta.className = 'jarvis-action-meta';
      meta.textContent = `${item.ms}ms · ${item.time}`;

      li.append(badge, name, req, meta);
      actionListEl.appendChild(li);
    }
  };

  renderActionList();
  actionSection.append(actionHeader, actionListEl);

  // Memory Card (Phase 3 Step 3.4)
  const memorySection = document.createElement('section');
  memorySection.className = 'jarvis-memory-card';
  memorySection.setAttribute('aria-label', 'Kevo Memory');

  const memHeader = document.createElement('div');
  memHeader.className = 'jarvis-panel-header';
  const memTitle = document.createElement('h3');
  memTitle.className = 'jarvis-panel-title';
  memTitle.textContent = 'Remembered Facts';

  const clearMemBtn = makeBtn('Clear all memories', 'jarvis-btn-danger', async () => {
    if (confirm('Forget all remembered facts? This cannot be undone.')) {
      if (options?.voiceActionContext?.clearFacts) await options.voiceActionContext.clearFacts();
      else await clearFacts();
      await renderMemoryList();
      hud.pulseMessage('All remembered facts cleared.');
    }
  });
  memHeader.append(memTitle, clearMemBtn);

  const memListEl = document.createElement('ul');
  memListEl.className = 'jarvis-memory-list';

  async function renderMemoryList(): Promise<void> {
    const facts = (options?.voiceActionContext?.listFacts
      ? await options.voiceActionContext.listFacts()
      : await listFacts()) as KevoFact[];
    memListEl.replaceChildren();
    if (!facts || facts.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'jarvis-memory-empty';
      empty.textContent = 'No remembered facts yet. Say "Remember that..." to teach Kevo a preference.';
      memListEl.appendChild(empty);
      return;
    }
    for (const f of facts) {
      const li = document.createElement('li');
      li.className = 'jarvis-memory-item';

      const tag = document.createElement('span');
      tag.className = 'jarvis-memory-tag';
      tag.textContent = `[${f.category || 'general'}]`;

      const text = document.createElement('span');
      text.className = 'jarvis-memory-text';
      text.textContent = f.fact;

      const delBtn = makeBtn('Delete', 'jarvis-memory-del-btn', async () => {
        if (options?.voiceActionContext?.deleteFact) await options.voiceActionContext.deleteFact(f.id);
        else await deleteFact(f.id);
        await renderMemoryList();
      });

      li.append(tag, text, delBtn);
      memListEl.appendChild(li);
    }
  }

  void renderMemoryList();
  memorySection.append(memHeader, memListEl);

  // Schedule Card (Phase 4 Step 4.5)
  const scheduleSection = document.createElement('section');
  scheduleSection.className = 'jarvis-schedule-card';
  scheduleSection.setAttribute('aria-label', 'Kevo Reminders & Schedule');

  const schedHeader = document.createElement('div');
  schedHeader.className = 'jarvis-panel-header';
  const schedTitle = document.createElement('h3');
  schedTitle.className = 'jarvis-panel-title';
  schedTitle.textContent = 'Reminders & Schedule';

  const clearSchedBtn = makeBtn('Clear all reminders', 'jarvis-btn-danger', async () => {
    if (confirm('Clear all scheduled reminders? This cannot be undone.')) {
      if (options?.voiceActionContext?.clearReminders) await options.voiceActionContext.clearReminders();
      else await clearReminders();
      await renderScheduleList();
      hud.pulseMessage('All reminders cleared.');
    }
  });
  schedHeader.append(schedTitle, clearSchedBtn);

  const schedListEl = document.createElement('ul');
  schedListEl.className = 'jarvis-schedule-list';

  function formatCountdown(targetMs: number): string {
    const diff = targetMs - Date.now();
    if (diff <= 0) return 'Due now';
    const mins = Math.round(diff / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hours < 24) return `in ${hours}h ${remMins}m`;
    const days = Math.floor(hours / 24);
    return `in ${days}d`;
  }

  async function renderScheduleList(): Promise<void> {
    const reminders = (options?.voiceActionContext?.listReminders
      ? await options.voiceActionContext.listReminders()
      : await listReminders()) as KevoReminder[];
    schedListEl.replaceChildren();
    if (!reminders || reminders.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'jarvis-schedule-empty';
      empty.textContent = 'No upcoming reminders. Say "Remind me to..." or "Schedule daily briefing at 8 AM".';
      schedListEl.appendChild(empty);
      return;
    }
    for (const r of reminders) {
      const li = document.createElement('li');
      li.className = 'jarvis-schedule-item';

      const tag = document.createElement('span');
      tag.className = 'jarvis-schedule-tag';
      tag.textContent = `[${r.recurring || 'reminder'}]`;

      const text = document.createElement('span');
      text.className = 'jarvis-schedule-text';
      text.textContent = r.message;

      const time = document.createElement('span');
      time.className = 'jarvis-schedule-time';
      time.textContent = formatCountdown(r.trigger_at);

      const delBtn = makeBtn('Cancel', 'jarvis-schedule-del-btn', async () => {
        if (options?.voiceActionContext?.cancelReminder) await options.voiceActionContext.cancelReminder(r.id);
        else await cancelReminder(r.id);
        await renderScheduleList();
      });

      li.append(tag, text, time, delBtn);
      schedListEl.appendChild(li);
    }
  }

  void renderScheduleList();
  scheduleSection.append(schedHeader, schedListEl);

  const team = document.createElement('section');
  team.className = 'jarvis-team';
  team.setAttribute('aria-label', 'Team');
  const teamTitle = document.createElement('h3');
  teamTitle.className = 'jarvis-panel-title';
  teamTitle.textContent = 'Team';
  team.append(teamTitle, agentRow, briefingPanel, toolbar);

  // The page already shows "Kevo" as its title, so the desk does not repeat it.
  root.append(hud.root, typeBox, voiceBar, actionSection, memorySection, scheduleSection, team);

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
    .jarvis-memory-card { background: var(--surface, #1e2522); border: 1px solid var(--border, #2a3530); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .jarvis-panel-header { display: flex; justify-content: space-between; align-items: center; }
    .jarvis-memory-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .jarvis-memory-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--bg, #141a18); border-radius: 6px; font-size: 13px; }
    .jarvis-memory-tag { color: var(--accent, #a3e5cd); font-weight: 600; font-size: 11px; text-transform: uppercase; }
    .jarvis-memory-text { flex: 1 1 auto; overflow-wrap: anywhere; }
    .jarvis-memory-del-btn { background: transparent; border: 1px solid var(--border, #2a3530); font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer; color: var(--muted, #b0c4bd); }
    .jarvis-memory-del-btn:hover { color: #f87171; border-color: #f87171; }
    .jarvis-memory-empty { color: var(--muted, #b0c4bd); font-size: 13px; font-style: italic; }
    .jarvis-schedule-card { background: var(--surface, #1e2522); border: 1px solid var(--border, #2a3530); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .jarvis-schedule-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .jarvis-schedule-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--bg, #141a18); border-radius: 6px; font-size: 13px; }
    .jarvis-schedule-tag { color: var(--accent, #a3e5cd); font-weight: 600; font-size: 11px; text-transform: uppercase; }
    .jarvis-schedule-text { flex: 1 1 auto; overflow-wrap: anywhere; }
    .jarvis-schedule-time { font-size: 11px; color: var(--muted, #b0c4bd); margin-right: 4px; }
    .jarvis-schedule-del-btn { background: transparent; border: 1px solid var(--border, #2a3530); font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer; color: var(--muted, #b0c4bd); }
    .jarvis-schedule-del-btn:hover { color: #f87171; border-color: #f87171; }
    .jarvis-schedule-empty { color: var(--muted, #b0c4bd); font-size: 13px; font-style: italic; }
    .jarvis-action-card { background: var(--surface, #1e2522); border: 1px solid var(--border, #2a3530); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .jarvis-action-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .jarvis-action-item { display: flex; align-items: center; gap: 10px; padding: 6px 10px; background: var(--bg, #141a18); border-radius: 6px; font-size: 13px; }
    .jarvis-action-badge { font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; white-space: nowrap; }
    .jarvis-action-badge-success { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
    .jarvis-action-badge-failure { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
    .jarvis-action-badge-unverified { background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.3); }
    .jarvis-action-name { color: var(--accent, #a3e5cd); font-weight: 600; font-size: 12px; }
    .jarvis-action-req { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink, #edf4ef); font-size: 13px; }
    .jarvis-action-meta { font-size: 11px; color: var(--muted, #b0c4bd); white-space: nowrap; }
    .jarvis-action-empty { color: var(--muted, #b0c4bd); font-size: 13px; font-style: italic; }
    .jarvis-btn-dim { background: transparent; border: 1px solid var(--border, #2a3530); font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer; color: var(--muted, #b0c4bd); }
    .jarvis-btn-dim:hover { color: var(--ink, #edf4ef); border-color: var(--muted, #b0c4bd); }
    .jarvis-btn-danger { color: #f87171; }
    @media (prefers-reduced-motion: reduce) { .jarvis-btn, .jarvis-mic-btn { transition: none; } }
  `;
  document.head.appendChild(style);
}
