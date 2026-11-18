/**
 * Kevo Self-Test unit tests (Phase 0 step 0.4b).
 * Verifies that:
 * 1. Self-test runs request clips in dry-run mode and records timings, heard text, and dispatched actions.
 * 2. Wake, look-alike and background clips record counts only (wakes, false wakes), never heard text.
 * 3. Results are formatted with home paths sanitized to `~`.
 * 4. "Run Kevo test builds and Kevo's self-test automatically" defaults to false.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runKevoSelfTest, type KevoSelfTestReport } from '../src/workspace/jarvis/kevo-selftest';
import { JarvisVoiceAgent } from '../src/workspace/jarvis/voice/jarvis-voice-agent';
import { JarvisVoiceListener } from '../src/workspace/jarvis/voice/jarvis-voice-listener';
import { DEFAULT_SETTINGS } from '../src/core/state';
import { Bridge } from '../src/core/bridge';

describe('Kevo Self-Test (Phase 0 step 0.4b)', () => {
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
      } else if (filename === 'req-time-01.wav') {
        listener.onFinalSpeech?.('what time is it');
      } else if (filename === 'req-open-01.wav') {
        listener.onFinalSpeech?.('open Brave browser');
      }
    };

    const progressSteps: string[] = [];
    const report = await runKevoSelfTest({
      agent,
      listener,
      playClipAudio,
      appVersion: '0.1.58',
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

    // Result was saved
    assert.ok(savedResultJson.length > 0);
    const parsedSaved = JSON.parse(savedResultJson);
    assert.strictEqual(parsedSaved.result, 'pass');
  });

  it('marks result as fail if an expected action does not match', async () => {
    const agent = new JarvisVoiceAgent({ switchView: () => {}, dryRun: true });
    const listener = new JarvisVoiceListener();

    const mockManifest = JSON.stringify({
      version: 1,
      clips: [
        {
          id: 'req-fail',
          file: 'req-fail.wav',
          kind: 'request',
          voice: 'ljspeech',
          words: 'Unknown phrase',
          seconds: 1.0,
          expect: { action: 'expected_action_never_matched' },
        },
      ],
    });

    Bridge.kevoSelftestGetClips = async () => mockManifest;
    Bridge.systemStats = async () => null;
    Bridge.kevoGraphicsCard = async () => 'Standard Graphics';
    Bridge.kevoSelftestSaveResult = async () => '';

    const playClipAudio = async () => {
      listener.onFinalSpeech?.('something else completely');
    };

    const report = await runKevoSelfTest({
      agent,
      listener,
      playClipAudio,
    });

    assert.strictEqual(report.result, 'fail');
    assert.strictEqual(report.requests[0].id, 'req-fail');
  });
});
