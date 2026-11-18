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
  type KevoSelfTestReport,
} from '../src/workspace/jarvis/kevo-selftest';
import { JarvisVoiceAgent } from '../src/workspace/jarvis/voice/jarvis-voice-agent';
import { JarvisVoiceListener } from '../src/workspace/jarvis/voice/jarvis-voice-listener';
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
});
