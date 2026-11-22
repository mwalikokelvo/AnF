/**
 * Kevo Self-Test unit tests (Phase 0 steps 0.4b and 0.5).
 * Verifies that:
 * 1. Self-test runs request clips in dry-run mode and records timings, heard text, and dispatched actions.
 * 2. Wake, look-alike and background clips record counts only (wakes, false wakes), never heard text.
 * 3. The five Phase 0 checks execute as self-test scripts (Phase 0 step 0.5).
 * 4. Results are formatted with home paths sanitized to `~`.
 * 5. "Run Kevo test builds and Kevo's self-test automatically" defaults to false.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runKevoSelfTest,
  runFivePhase0Checks,
  runHudSelfTestChecks,
  pcm16WavToFloat32,
  type KevoSelfTestReport,
} from '../src/workspace/jarvis/kevo-selftest';
import { JarvisVoiceAgent } from '../src/workspace/jarvis/voice/jarvis-voice-agent';
import { JarvisVoiceListener } from '../src/workspace/jarvis/voice/jarvis-voice-listener';
import { KevoEarsListener } from '../src/workspace/jarvis/voice/kevo-ears-listener';
import { DEFAULT_SETTINGS } from '../src/core/state';
import { Bridge } from '../src/core/bridge';

describe('Kevo Self-Test (Phase 0 steps 0.4b & 0.5)', () => {
  it('DEFAULT_SETTINGS sets kevoAutoTest to false by default', () => {
    assert.strictEqual(DEFAULT_SETTINGS.kevoAutoTest, false);
  });

  it('runs self-test with simulated clips, records counts for wake/lookalike, and details for requests', async () => {
    let appOpened = false;
    const actionContext = {
      switchView: () => {},
      dryRun: true,
      openApp: async (name: string) => {
        appOpened = true;
        return name;
      },
      announce: () => {},
    };

    const agent = new JarvisVoiceAgent(actionContext);
    const listener = new JarvisVoiceListener();

    // Mock Bridge calls
    const mockManifest = JSON.stringify({
      version: 1,
      clips: [
        {
          id: 'wake-01',
          file: 'wake-01.wav',
          kind: 'wake',
          voice: 'ljspeech',
          words: 'Hey Kevo',
          seconds: 1.2,
          expect: { wake: true },
        },
        {
          id: 'lookalike-01',
          file: 'lookalike-01.wav',
          kind: 'lookalike',
          voice: 'ljspeech',
          words: 'Cave',
          seconds: 1.0,
          expect: { wake: false },
        },
        {
          id: 'req-time-01',
          file: 'req-time-01.wav',
          kind: 'request',
          voice: 'ljspeech',
          words: 'Kevo, what time is it?',
          seconds: 2.0,
          expect: { action: 'tell_time' },
          check: 'several_in_a_row',
        },
        {
          id: 'req-open-01',
          file: 'req-open-01.wav',
          kind: 'request',
          voice: 'ljspeech',
          words: 'Kevo, open Brave browser',
          seconds: 2.5,
          expect: { action: 'open_app' },
          check: 'open_app',
        },
      ],
    });

    let savedResultJson = '';
    Bridge.kevoSelftestGetClips = async () => mockManifest;
    Bridge.systemStats = async () => ({ os: 'Windows_NT', cpuCores: 8 });
    Bridge.kevoGraphicsCard = async () => 'Intel UHD Graphics 620';
    Bridge.kevoSelftestSaveResult = async (json: string) => {
      savedResultJson = json;
      return '~/AnF-Kevo/selftest-0.1.58.json';
    };

    // Play clip stub simulates microphone hearing the words
    const playClipAudio = async (filename: string) => {
      if (filename === 'wake-01.wav') {
        listener.onWakeWord?.('Hey Kevo');
      } else if (filename === 'lookalike-01.wav') {
        // Lookalike: do not fire wake
      } else if (filename.includes('timer')) {
        listener.onFinalSpeech?.('set a timer for ten seconds');
      } else if (filename.includes('time')) {
        listener.onFinalSpeech?.('what time is it');
      } else if (filename.includes('help')) {
        listener.onFinalSpeech?.('what can you do');
      } else if (filename.includes('open-brave') || filename === 'req-open-01.wav') {
        listener.onFinalSpeech?.('open Brave browser');
      }
    };

    const progressSteps: string[] = [];
    const report = await runKevoSelfTest({
      agent,
      listener,
      playClipAudio,
      appVersion: '0.1.58',
      sleepMs: async () => {}, // instant sleep in test
      simulateTimerFire: true,
      onProgress: (step) => progressSteps.push(step),
    });

    assert.strictEqual(report.result, 'pass');
    assert.strictEqual(report.version, '0.1.58');
    assert.strictEqual(report.graphicsCard, 'Intel UHD Graphics 620');
    assert.strictEqual(report.systemStats?.cpuCores, 8);

    // Wake and lookalike counts only
    assert.strictEqual(report.wakeClips.total, 1);
    assert.strictEqual(report.wakeClips.wakes, 1);
    assert.strictEqual(report.wakeClips.rate, 1.0);
    assert.strictEqual(report.lookalikeClips.total, 1);
    assert.strictEqual(report.lookalikeClips.falseWakes, 0);

    // Verify no heard text for wake or lookalike clips
    const repAny = report as any;
    assert.strictEqual(repAny.wakeClips.heard, undefined);
    assert.strictEqual(repAny.lookalikeClips.heard, undefined);

    // Requests detail
    assert.strictEqual(report.requests.length, 2);
    assert.strictEqual(report.requests[0].id, 'req-time-01');
    assert.strictEqual(report.requests[0].action, 'tell_time');
    assert.strictEqual(report.requests[0].heard, 'what time is it');
    assert.match(report.requests[0].reply, /It is|It's/);

    assert.strictEqual(report.requests[1].id, 'req-open-01');
    assert.strictEqual(report.requests[1].action, 'open_app');
    assert.strictEqual(report.requests[1].heard, 'open Brave browser');
    assert.match(report.requests[1].reply, /Opening Brave/);

    // In dryRun mode, real openApp callback was NOT called
    assert.strictEqual(appOpened, false);

    // Phase 0 checks executed
    assert.ok(report.phase0Checks.length === 5);
    for (const c of report.phase0Checks) {
      assert.strictEqual(c.passed, true, `Check ${c.check} failed: ${c.details}`);
    }

    // Result was saved
    assert.ok(savedResultJson.length > 0);
    const parsedSaved = JSON.parse(savedResultJson);
    assert.strictEqual(parsedSaved.result, 'pass');
    assert.strictEqual(parsedSaved.phase0Checks.length, 5);

    // Phase 1 step 1.5 idle CPU reported
    assert.strictEqual(typeof report.idleCpuPercent60s, 'number');
    assert.strictEqual(typeof parsedSaved.idleCpuPercent60s, 'number');

    // Phase 1 step 1.6 barge-in stop delay reported
    assert.strictEqual(typeof report.bargeInStopDelayMs, 'number');
    assert.strictEqual(typeof parsedSaved.bargeInStopDelayMs, 'number');
    assert.ok(report.bargeInStopDelayMs <= 300);

    // HUD track checks executed (H.8)
    assert.ok(report.hudChecks);
    assert.strictEqual(typeof report.hudChecks.stateChangeDelayMs, 'number');
    assert.strictEqual(typeof report.hudChecks.idleCpuPercent60s, 'number');
    assert.strictEqual(typeof report.hudChecks.approvalClickMs, 'number');
    assert.strictEqual(typeof report.hudChecks.approvalVoiceYesMs, 'number');
    assert.strictEqual(typeof report.hudChecks.approvalVoiceCancelMs, 'number');
    assert.strictEqual(typeof report.hudChecks.droppedFileSearchRank, 'number');
    assert.strictEqual(parsedSaved.hudChecks.droppedFileSearchRank, 1);
  });

  it('runs the five Phase 0 checks independently and reports structured pass results', async () => {
    let timerCallback: ((msg: string) => void) | undefined;
    const actionContext = {
      switchView: () => {},
      dryRun: true,
      openApp: async (name: string) => name,
      announce: (msg: string) => timerCallback?.(msg),
    };

    const agent = new JarvisVoiceAgent(actionContext);
    const listener = new JarvisVoiceListener();

    const playClipAudio = async (filename: string) => {
      if (filename.includes('timer')) {
        listener.onFinalSpeech?.('Set a timer for ten seconds');
      } else if (filename.includes('time')) {
        listener.onFinalSpeech?.('Kevo, what time is it?');
      } else if (filename.includes('help')) {
        listener.onFinalSpeech?.('What can you do?');
      } else if (filename.includes('open-brave')) {
        listener.onFinalSpeech?.('Kevo, open Brave browser');
      } else if (filename.includes('black-holes')) {
        listener.onFinalSpeech?.('Kevo, tell me about black holes');
      }
    };

    const checks = await runFivePhase0Checks({
      agent,
      listener,
      playClipAudio,
      simulateTimerFire: true,
      sleepMs: async () => {},
    });

    assert.strictEqual(checks.length, 5);
    const checksByName = Object.fromEntries(checks.map((c) => [c.check, c]));

    assert.strictEqual(checksByName.several_in_a_row.passed, true);
    assert.strictEqual(checksByName.open_app.passed, true);
    assert.strictEqual(checksByName.timer.passed, true);
    assert.strictEqual(checksByName.typed_request.passed, true);
    assert.strictEqual(checksByName.stop.passed, true);
  });

  it('runs HUD self-test checks independently (H.8) and returns numbers only', async () => {
    let approvalAnswered = false;
    let pendingApprovalActive = false;

    const actionContext = {
      switchView: () => {},
      dryRun: true,
      pendingApproval: () =>
        pendingApprovalActive
          ? {
              id: 99,
              action: 'test_action',
              summary: 'Test summary',
            }
          : null,
      answerApproval: (_id: any, approved: boolean) => {
        approvalAnswered = approved;
      },
    };

    const agent = new JarvisVoiceAgent(actionContext);
    const listener = new JarvisVoiceListener();

    let stateReported = '';
    Bridge.kevoHudSet = async (state: string) => {
      stateReported = state;
    };
    Bridge.kevoHudAnswer = async () => {};

    const hudResults = await runHudSelfTestChecks({
      agent,
      listener,
      onStateChangeMeasure: async () => 18,
      onIdleCpuMeasure: async () => 0.0,
      onApprovalClickMeasure: async () => 24,
      onApprovalVoiceYesMeasure: async () => 45,
      onApprovalVoiceCancelMeasure: async () => 52,
      onDropFileSearchMeasure: async () => 1,
    });

    assert.strictEqual(hudResults.stateChangeDelayMs, 18);
    assert.strictEqual(hudResults.idleCpuPercent60s, 0.0);
    assert.strictEqual(hudResults.approvalClickMs, 24);
    assert.strictEqual(hudResults.approvalVoiceYesMs, 45);
    assert.strictEqual(hudResults.approvalVoiceCancelMs, 52);
    assert.strictEqual(hudResults.droppedFileSearchRank, 1);

    // Verify all fields are strictly numbers
    for (const [key, value] of Object.entries(hudResults)) {
      assert.strictEqual(typeof value, 'number', `Field ${key} must be a number`);
    }
  });

  it('enforces Phase 1 Step 1.5 wake rate (>=19/20) and false-wake (<=1) thresholds with background speech', async () => {
    const actionContext = {
      switchView: () => {},
      dryRun: true,
      openApp: async (name: string) => name,
      announce: () => {},
    };

    const agent = new JarvisVoiceAgent(actionContext);
    const listener = new JarvisVoiceListener();

    // 20 wake clips, 10 look-alike clips, 1 background clip
    const clips: any[] = [];
    for (let i = 1; i <= 20; i++) {
      clips.push({
        id: `wake-${i}`,
        file: `wake-${i}.wav`,
        kind: 'wake',
        voice: 'ljspeech',
        words: 'Hey Kevo',
        seconds: 1.0,
        expect: { wake: true },
      });
    }
    for (let i = 1; i <= 10; i++) {
      clips.push({
        id: `lookalike-${i}`,
        file: `lookalike-${i}.wav`,
        kind: 'lookalike',
        voice: 'ljspeech',
        words: 'Cave',
        seconds: 1.0,
        expect: { wake: false },
      });
    }
    clips.push({
      id: 'bg-01',
      file: 'bg-01.wav',
      kind: 'background',
      voice: 'ljspeech',
      words: 'ambient background text',
      seconds: 600.0,
      expect: { wake: false },
    });

    Bridge.kevoSelftestGetClips = async () => JSON.stringify({ version: 1, clips });
    Bridge.systemStats = async () => ({ os: 'Windows_NT', cpuCores: 8 });
    Bridge.kevoGraphicsCard = async () => 'Intel UHD Graphics';
    Bridge.kevoSelftestSaveResult = async () => '~/AnF-Kevo/selftest-0.1.60.json';

    // Scenario A: 19 wakes out of 20, 1 false wake in look-alike, 0 in background -> PASS
    let wakeCount = 0;
    const playClipAudioPass = async (filename: string) => {
      if (filename.startsWith('wake-')) {
        wakeCount++;
        if (wakeCount <= 19) {
          listener.onWakeWord?.('Hey Kevo');
        }
      } else if (filename === 'lookalike-1.wav') {
        listener.onWakeWord?.('Cave'); // 1 false wake
      }
    };

    const passReport = await runKevoSelfTest({
      agent,
      listener,
      playClipAudio: playClipAudioPass,
      appVersion: '0.1.60',
      sleepMs: async () => {},
      simulateTimerFire: true,
      onIdleCpuMeasure: async () => 0.5,
      onOwnVoiceMeasure: async () => true,
      onBargeInMeasure: async () => 140,
    });

    assert.strictEqual(passReport.wakeClips.total, 20);
    assert.strictEqual(passReport.wakeClips.wakes, 19);
    assert.strictEqual(passReport.wakeClips.rate, 0.95);
    assert.strictEqual(passReport.lookalikeClips.falseWakes, 1);
    assert.strictEqual(passReport.backgroundClips?.falseWakes, 0);
    assert.strictEqual(passReport.backgroundClips?.durationSeconds, 600);
    assert.strictEqual(passReport.idleCpuPercent60s, 0.5);
    // Background clips record counts only, never heard text
    assert.strictEqual((passReport.backgroundClips as any).heard, undefined);
    assert.strictEqual(passReport.result, 'pass');

    // Scenario B: 18 wakes out of 20 (<19) -> FAIL
    wakeCount = 0;
    const playClipAudioLowWake = async (filename: string) => {
      if (filename.startsWith('wake-')) {
        wakeCount++;
        if (wakeCount <= 18) {
          listener.onWakeWord?.('Hey Kevo');
        }
      }
    };

    const lowWakeReport = await runKevoSelfTest({
      agent,
      listener,
      playClipAudio: playClipAudioLowWake,
      appVersion: '0.1.60',
      sleepMs: async () => {},
      simulateTimerFire: true,
      onIdleCpuMeasure: async () => 0.2,
      onOwnVoiceMeasure: async () => true,
      onBargeInMeasure: async () => 140,
    });

    assert.strictEqual(lowWakeReport.wakeClips.wakes, 18);
    assert.strictEqual(lowWakeReport.result, 'fail');

    // Scenario C: 2 false wakes (>1) -> FAIL
    wakeCount = 0;
    const playClipAudioHighFalseWake = async (filename: string) => {
      if (filename.startsWith('wake-')) {
        listener.onWakeWord?.('Hey Kevo');
      } else if (filename === 'lookalike-1.wav' || filename === 'lookalike-2.wav') {
        listener.onWakeWord?.('False wake');
      }
    };

    const highFalseWakeReport = await runKevoSelfTest({
      agent,
      listener,
      playClipAudio: playClipAudioHighFalseWake,
      appVersion: '0.1.60',
      sleepMs: async () => {},
      simulateTimerFire: true,
      onIdleCpuMeasure: async () => 0.1,
      onOwnVoiceMeasure: async () => true,
      onBargeInMeasure: async () => 140,
    });

    assert.strictEqual(highFalseWakeReport.lookalikeClips.falseWakes, 2);
    assert.strictEqual(highFalseWakeReport.result, 'fail');
  });

  it('measures first model-routed command (<= 5s) and subsequent commands (<= 1.5s) (Step 2.5)', async () => {
    let aiCount = 0;
    const actionContext = {
      switchView: () => {},
      dryRun: true,
      openApp: async (name: string) => name,
      announce: () => {},
      askAI: async (query: string) => `Answer ${++aiCount} to ${query}`,
    };
    const agent = new JarvisVoiceAgent(actionContext);
    const listener = new JarvisVoiceListener();

    const manifest: SelftestClipsManifest = {
      version: 1,
      clips: [
        {
          id: 'req-1',
          file: 'req-1.wav',
          kind: 'request',
          voice: 'lj',
          words: 'explain relativity',
          seconds: 2,
          expect: { action: 'ai_conversation' },
        },
        {
          id: 'req-2',
          file: 'req-2.wav',
          kind: 'request',
          voice: 'lj',
          words: 'explain gravity',
          seconds: 2,
          expect: { action: 'ai_conversation' },
        },
      ],
    };

    (Bridge as any).kevoSelftestGetClips = async () => JSON.stringify(manifest);

    const playClipAudio = async (filename: string) => {
      if (filename.includes('open-brave')) {
        listener.onFinalSpeech?.('Kevo, open Brave browser');
      } else if (filename.includes('timer')) {
        listener.onFinalSpeech?.('Set a timer for ten seconds');
      } else if (filename.includes('time')) {
        listener.onFinalSpeech?.('Kevo, what time is it?');
      } else if (filename.includes('help')) {
        listener.onFinalSpeech?.('What can you do?');
      } else if (filename.includes('black-holes')) {
        listener.onFinalSpeech?.('tell me about black holes');
      } else if (filename.includes('req-1')) {
        listener.onFinalSpeech?.('explain relativity');
      } else if (filename.includes('req-2')) {
        listener.onFinalSpeech?.('explain gravity');
      }
    };

    const passReport = await runKevoSelfTest({
      agent,
      listener,
      playClipAudio,
      appVersion: '0.1.60',
      sleepMs: async () => {},
      simulateTimerFire: true,
      onIdleCpuMeasure: async () => 0.0,
    });

    assert.ok(passReport.modelCommandLatencies);
    assert.strictEqual(passReport.modelCommandLatencies.firstPassed, true);
    assert.strictEqual(passReport.modelCommandLatencies.subsequentPassed, true);
    assert.strictEqual(passReport.result, 'pass');
  });

  it('pcm16WavToFloat32 decodes 16-bit PCM bytes to normalized float32 samples', () => {
    // Header 44 bytes + 4 samples (8 bytes)
    const bytes = new Array(44 + 8).fill(0);
    const view = new DataView(new Uint8Array(bytes).buffer);
    // Write sample 0: 0
    view.setInt16(44, 0, true);
    // Write sample 1: 16384 (0.5)
    view.setInt16(46, 16384, true);
    // Write sample 2: -16384 (-0.5)
    view.setInt16(48, -16384, true);
    // Write sample 3: 32767 (~1.0)
    view.setInt16(50, 32767, true);

    const floats = pcm16WavToFloat32(Array.from(new Uint8Array(view.buffer)));
    assert.strictEqual(floats.length, 4);
    assert.strictEqual(floats[0], 0);
    assert.ok(Math.abs(floats[1] - 0.5) < 1e-4);
    assert.ok(Math.abs(floats[2] - -0.5) < 1e-4);
    assert.ok(Math.abs(floats[3] - 1.0) < 1e-4);
  });

  it('records ownVoiceNeverInterrupts and bargeInStopDelayMs in self-test report (Step 1.6)', async () => {
    const actionContext = {
      switchView: () => {},
      dryRun: true,
      openApp: async (name: string) => name,
      announce: () => {},
    };
    const agent = new JarvisVoiceAgent(actionContext);
    const listener = new JarvisVoiceListener();

    const manifest: SelftestClipsManifest = {
      version: 1,
      clips: [],
    };
    (Bridge as any).kevoSelftestGetClips = async () => JSON.stringify(manifest);

    const playClipAudio = async (filename: string) => {
      if (filename.includes('open-brave')) {
        listener.onFinalSpeech?.('Kevo, open Brave browser');
      } else if (filename.includes('timer')) {
        listener.onFinalSpeech?.('Set a timer for ten seconds');
      } else if (filename.includes('time')) {
        listener.onFinalSpeech?.('Kevo, what time is it?');
      } else if (filename.includes('help')) {
        listener.onFinalSpeech?.('What can you do?');
      } else if (filename.includes('black-holes')) {
        listener.onFinalSpeech?.('tell me about black holes');
      }
    };

    // Scenario A: Own voice never interrupts, barge-in stop delay <= 300 ms -> passes
    const passReport = await runKevoSelfTest({
      agent,
      listener,
      playClipAudio,
      appVersion: '0.1.62',
      sleepMs: async () => {},
      simulateTimerFire: true,
      onIdleCpuMeasure: async () => 0.0,
      onOwnVoiceMeasure: async () => true,
      onBargeInMeasure: async () => 140,
    });

    assert.strictEqual(passReport.ownVoiceNeverInterrupts, true);
    assert.strictEqual(passReport.bargeInStopDelayMs, 140);
    assert.strictEqual(passReport.result, 'pass');

    // Scenario B: Own voice interrupts -> fails
    const failOwnVoiceReport = await runKevoSelfTest({
      agent,
      listener,
      playClipAudio,
      appVersion: '0.1.62',
      sleepMs: async () => {},
      simulateTimerFire: true,
      onIdleCpuMeasure: async () => 0.0,
      onOwnVoiceMeasure: async () => false,
      onBargeInMeasure: async () => 140,
    });

    assert.strictEqual(failOwnVoiceReport.ownVoiceNeverInterrupts, false);
    assert.strictEqual(failOwnVoiceReport.result, 'fail');

    // Scenario C: Barge-in stop delay > 300 ms -> fails
    const failBargeReport = await runKevoSelfTest({
      agent,
      listener,
      playClipAudio,
      appVersion: '0.1.62',
      sleepMs: async () => {},
      simulateTimerFire: true,
      onIdleCpuMeasure: async () => 0.0,
      onOwnVoiceMeasure: async () => true,
      onBargeInMeasure: async () => 350,
    });

    assert.strictEqual(failBargeReport.bargeInStopDelayMs, 350);
    assert.strictEqual(failBargeReport.result, 'fail');
  });

  it('starts hearing on the PC before any clip plays, and reports why when it cannot (Kevo 1.5 fix 1, #279)', async () => {
    const agent = new JarvisVoiceAgent({ switchView: () => {}, dryRun: true, openApp: async (n: string) => n, announce: () => {} });
    const order: string[] = [];
    let startEars: () => Promise<void> = async () => {};
    const listener = new KevoEarsListener({ eventSource: { onEvent: () => {}, start: () => startEars(), stop: async () => { order.push('ears-stopped'); } } });
    (Bridge as any).kevoSelftestGetClips = async () => JSON.stringify({ version: 1, clips: [{ id: 'wake-01', file: 'wake-01.wav', kind: 'wake', voice: 'x', words: 'Kevo', expect: { wake: true } }] });
    Bridge.systemStats = async () => ({ os: 'Windows_NT', cpuCores: 8 });
    Bridge.kevoGraphicsCard = async () => 'Intel UHD Graphics';
    Bridge.kevoSelftestSaveResult = async () => '~/AnF-Kevo/selftest-test.json';
    let bridgeStarts = 0;
    (Bridge as any).kevoEarsStart = async () => { bridgeStarts++; };
    const deps = {
      agent,
      listener,
      playClipAudio: async (file: string) => { order.push(`play ${file}`); },
      appVersion: '0.1.65',
      sleepMs: async () => {},
      simulateTimerFire: true,
      onIdleCpuMeasure: async () => 0.5,
      onOwnVoiceMeasure: async () => true,
      onBargeInMeasure: async () => 140,
    };

    // Models download on the first start: the clips wait for it, and hearing is started once.
    startEars = async () => { order.push('ears-start'); await new Promise((r) => setTimeout(r, 10)); order.push('ears-started'); };
    const okReport = await runKevoSelfTest(deps);
    assert.ok(order.indexOf('ears-started') >= 0 && order.indexOf('ears-started') < order.indexOf('play wake-01.wav'), order.join(', '));
    assert.strictEqual(order.filter((o) => o === 'ears-start').length, 1, order.join(', '));
    assert.strictEqual(bridgeStarts, 0, 'no second start through the bridge');
    assert.ok(!okReport.errors.some((e) => e.startsWith('Hearing')), okReport.errors.join('; '));
    assert.strictEqual(listener.getListeningState(), false, 'the microphone was off before the self-test, so it is off after it');

    // Left on by the owner: the self-test leaves it on.
    listener.start();
    await listener.whenStarted();
    await runKevoSelfTest(deps);
    assert.strictEqual(listener.getListeningState(), true);
    listener.stop();

    // The download fails (offline): the report names the cause and could_not_start, not a code failure.
    startEars = async () => { throw new Error('Kevo hearing models could not be downloaded: offline'); };
    const failReport = await runKevoSelfTest(deps);
    assert.ok(failReport.errors.some((e) => e.includes('Hearing could not start') && e.includes('could not be downloaded: offline')), failReport.errors.join('; '));
    assert.strictEqual(failReport.result, 'could_not_start');
    assert.strictEqual(listener.onError, undefined, 'the error hook is restored after the run');
    assert.strictEqual(listener.getListeningState(), false);
  });
});
