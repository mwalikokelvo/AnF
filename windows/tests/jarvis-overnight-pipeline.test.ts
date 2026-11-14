/**
 * Overnight JARVIS pipeline: listener → agent → memory → telemetry gating.
 * DOM/Speech APIs are shimmed so this runs under `npm test` (Node + esbuild).
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JarvisVoiceAgent } from '../src/workspace/jarvis/voice/jarvis-voice-agent';
import { JarvisVoiceListener } from '../src/workspace/jarvis/voice/jarvis-voice-listener';
import { JarvisSpeaker } from '../src/workspace/jarvis/voice/jarvis-speaker';
import {
  appendJarvisTurn,
  clearJarvisHistory,
  formatJarvisHistoryForPrompt,
  getJarvisHistory,
} from '../src/workspace/jarvis/voice/jarvis-memory';
import {
  fetchSystemTelemetry,
  setAudioEngineStatus,
  startTelemetryPolling,
} from '../src/workspace/jarvis/connectors/system-connector';
import { JARVIS_VOICE_PACK, getSelectedVoiceProfile, setSelectedVoiceId } from '../src/workspace/jarvis/voice/jarvis-voice-pack';

type RecHandler = (event: { resultIndex: number; results: Array<Array<{ transcript: string }> & { isFinal: boolean }> }) => void;

class FakeSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onresult: RecHandler | null = null;
  startCalls = 0;
  stopCalls = 0;

  start() {
    this.startCalls += 1;
    this.onstart?.();
  }

  stop() {
    this.stopCalls += 1;
    this.onend?.();
  }

  emitFinal(transcript: string) {
    const row = Object.assign([{ transcript }], { isFinal: true });
    this.onresult?.({ resultIndex: 0, results: [row] });
  }
}

describe('Overnight JARVIS pipeline', () => {
  beforeEach(() => {
    clearJarvisHistory();
  });

  afterEach(() => {
    clearJarvisHistory();
    setSelectedVoiceId('nath-british-calm');
  });

  it('voice pack stays complete and identity cue is a no-op without window', async () => {
    assert.ok(JARVIS_VOICE_PACK.length >= 12);
    setSelectedVoiceId('burt-deep-smooth');
    assert.equal(getSelectedVoiceProfile().id, 'burt-deep-smooth');
    const speaker = new JarvisSpeaker({ identityCue: true });
    // Node has no window — speak must return without throwing.
    await speaker.speak('Good evening, sir.');
    assert.equal(speaker.getIsSpeaking?.() ?? false, false);
  });

  it('listener strips wake words, fires onWakeWord, then forwards the command', async () => {
    const g = globalThis as any;
    const prevWindow = g.window;
    const fake = new FakeSpeechRecognition();
    g.window = {
      SpeechRecognition: function SpeechRecognition() {
        return fake;
      },
    };

    const wakes: string[] = [];
    const finals: string[] = [];
    const listener = new JarvisVoiceListener({
      onWakeWord: (w) => wakes.push(w),
      onFinalSpeech: (t) => finals.push(t),
    });
    assert.equal(listener.isSupported(), true);
    assert.equal(listener.start(), true);
    fake.emitFinal('Hey Jarvis pause the music');
    assert.deepEqual(wakes, ['hey jarvis']);
    assert.deepEqual(finals, ['pause the music']);
    listener.stop();
    assert.ok(fake.stopCalls >= 1);

    g.window = prevWindow;
  });

  it('listener ignores room talk and its own voice, and still answers its name', () => {
    const g = globalThis as any;
    const prevWindow = g.window;
    const fake = new FakeSpeechRecognition();
    g.window = { SpeechRecognition: function SpeechRecognition() { return fake; } };
    const finals: string[] = [];
    const listener = new JarvisVoiceListener({ followUpMs: 0, onFinalSpeech: (t) => finals.push(t) });
    listener.start();
    fake.emitFinal('Hey Google.');
    fake.emitFinal('Are you awake?');
    assert.deepEqual(finals, []);
    listener.setMuted(true);
    fake.emitFinal('Jarvis, it is 9 pm, sir.');
    assert.deepEqual(finals, []);
    listener.setMuted(false);
    fake.emitFinal('Jarvis what time is it');
    assert.deepEqual(finals, ['what time is it']);
    listener.stop();
    g.window = prevWindow;
  });

  it('agent + memory: open question stores turns and includes history in askAI', async () => {
    let seenPrompt = '';
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      askAI: async (prompt) => {
        seenPrompt = prompt;
        return 'Gravity curves spacetime, sir.';
      },
    });
    appendJarvisTurn('user', 'prior context');
    appendJarvisTurn('assistant', 'prior answer');
    const res = await agent.processVoiceInput('Explain gravity briefly');
    assert.equal(res.actionName, 'ai_conversation');
    assert.match(seenPrompt, /prior context/);
    assert.match(seenPrompt, /Explain gravity briefly/);
    const hist = getJarvisHistory();
    assert.ok(hist.some((t) => t.role === 'user' && t.text.includes('Explain gravity')));
    assert.ok(hist.some((t) => t.role === 'assistant' && t.text.includes('Gravity curves')));
    assert.match(formatJarvisHistoryForPrompt(), /JARVIS: Gravity curves/);
  });

  it('command desk intents: music, vault, notes, briefing, time', async () => {
    const calls: string[] = [];
    const agent = new JarvisVoiceAgent({
      switchView: (v) => calls.push(`view:${v}`),
      pauseMusic: () => calls.push('pause'),
      searchVault: async (q) => {
        calls.push(`vault:${q}`);
        return 'Found 2 notes.';
      },
      openQuickCapture: () => calls.push('quick-capture'),
      getBriefing: async () => {
        calls.push('briefing');
        return 'All systems nominal.';
      },
    });

    assert.equal((await agent.processVoiceInput('Jarvis, pause the music')).actionName, 'pause_music');
    assert.equal((await agent.processVoiceInput('search notes for EQ curve')).actionName, 'search_vault');
    assert.equal((await agent.processVoiceInput('Open my notes')).actionName, 'navigate_notes');
    assert.equal((await agent.processVoiceInput('Give me a status report')).actionName, 'briefing');
    assert.equal((await agent.processVoiceInput('What time is it?')).actionName, 'tell_time');
    assert.ok(calls.includes('pause'));
    assert.ok(calls.includes('vault:EQ curve'));
    assert.ok(calls.includes('quick-capture'));
    assert.ok(calls.includes('briefing'));
    assert.ok(calls.includes('view:home'));
  });

  it('event-gated telemetry delivers updates and stop() ends the loop', async () => {
    setAudioEngineStatus('playing');
    const snap = await fetchSystemTelemetry();
    assert.equal(snap.audioEngineStatus, 'playing');
    assert.ok(snap.cpuLoadPct >= 0);

    const updates: number[] = [];
    const stop = startTelemetryPolling((t) => {
      updates.push(t.timestamp);
    }, 50);
    await new Promise((r) => setTimeout(r, 180));
    stop();
    const afterStop = updates.length;
    await new Promise((r) => setTimeout(r, 120));
    assert.ok(afterStop >= 1, 'expected at least one telemetry tick');
    assert.equal(updates.length, afterStop, 'polling must stop after dispose');
    setAudioEngineStatus('idle');
  });
});
