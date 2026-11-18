/**
 * Kevo Self-Test Runner (Phase 0 step 0.4b).
 *
 * Runs self-test clips in dry-run mode, recording:
 * - Request clips: id, expected, heard, action, reply, timings
 * - Wake / look-alike clips: counts only (wakes, false wakes), never heard text
 * - System stats (RAM, CPU) and graphics card name
 * - Output saved to ~/AnF-Kevo/selftest-<version>.json with home paths as ~
 */

import { Bridge } from '../../core/bridge';
import type { JarvisVoiceAgent } from './voice/jarvis-voice-agent';
import type { JarvisVoiceListener } from './voice/jarvis-voice-listener';

export interface SelftestClipExpect {
  action?: string;
  seconds?: number;
  app?: string;
  wake?: boolean;
}

export interface SelftestClip {
  id: string;
  file: string;
  kind: 'request' | 'wake' | 'lookalike' | 'background';
  voice: string;
  words: string;
  seconds: number;
  expect: SelftestClipExpect;
  check?: string;
}

export interface SelftestClipsManifest {
  version: number;
  clips: SelftestClip[];
}

export interface RequestClipReport {
  id: string;
  check?: string;
  expected: SelftestClipExpect;
  heard: string;
  action: string;
  reply: string;
  timings: {
    durationSeconds: number;
    heardToReplyMs: number;
  };
}

export interface KevoSelfTestReport {
  version: string;
  timestamp: string;
  result: 'pass' | 'fail' | 'could_not_start';
  systemStats: Record<string, unknown> | null;
  graphicsCard: string;
  requests: RequestClipReport[];
  wakeClips: {
    total: number;
    wakes: number;
    rate: number;
  };
  lookalikeClips: {
    total: number;
    falseWakes: number;
  };
  errors: string[];
}

export interface SelfTestDeps {
  agent: JarvisVoiceAgent;
  listener: JarvisVoiceListener;
  playClipAudio?: (filename: string) => Promise<void>;
  appVersion?: string;
  onProgress?: (step: string) => void;
}

/** Default audio player that requests clip bytes from Tauri and plays via HTML5 Audio. */
export async function defaultPlayClip(filename: string): Promise<void> {
  const bytes = await Bridge.kevoSelftestReadClip(filename);
  if (!bytes || bytes.length === 0) {
    throw new Error(`Clip ${filename} could not be read.`);
  }
  const u8 = new Uint8Array(bytes);
  const blob = new Blob([u8], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);

  await new Promise<void>((resolve, reject) => {
    audio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to play ${filename}: ${String(e)}`));
    };
    audio.play().catch(reject);
  });
}

export async function runKevoSelfTest(deps: SelfTestDeps): Promise<KevoSelfTestReport> {
  const { agent, listener, onProgress } = deps;
  onProgress?.('Loading clips manifest...');

  let manifest: SelftestClipsManifest;
  try {
    const raw = await Bridge.kevoSelftestGetClips();
    if (!raw) throw new Error('No manifest returned by kevo_selftest_get_clips.');
    manifest = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to load self-test clips: ${String(err)}`);
  }

  const report: KevoSelfTestReport = {
    version: deps.appVersion ?? '0.1.58',
    timestamp: new Date().toISOString(),
    result: 'pass',
    systemStats: await Bridge.systemStats(),
    graphicsCard: (await Bridge.kevoGraphicsCard()) ?? 'Standard Graphics Adapter',
    requests: [],
    wakeClips: { total: 0, wakes: 0, rate: 0 },
    lookalikeClips: { total: 0, falseWakes: 0 },
    errors: [],
  };

  const play = deps.playClipAudio ?? defaultPlayClip;

  for (let i = 0; i < manifest.clips.length; i++) {
    const clip = manifest.clips[i];
    onProgress?.(`Testing clip ${i + 1}/${manifest.clips.length} (${clip.id})...`);

    let clipHeardText = '';
    let clipWakeDetected = false;
    let clipActionName = '';
    let clipReply = '';
    let heardToReplyMs = 0;

    // Listen to events during clip playback
    const prevOnWake = listener.onWakeWord;
    const prevOnFinal = listener.onFinalSpeech;

    const startMs = Date.now();
    let heardAtMs = 0;

    listener.onWakeWord = (word: string) => {
      clipWakeDetected = true;
      prevOnWake?.(word);
    };

    listener.onFinalSpeech = (text: string) => {
      clipHeardText = text;
      heardAtMs = Date.now();
      prevOnFinal?.(text);
    };

    try {
      // Play audio
      await play(clip.file);

      // If recognized, dispatch through agent in dryRun mode
      if (clipHeardText) {
        const actionResult = await agent.processVoiceInput(clipHeardText);
        clipActionName = actionResult.actionName;
        clipReply = actionResult.speechReply;
        if (heardAtMs > 0) {
          heardToReplyMs = Date.now() - heardAtMs;
        }
      }
    } catch (err) {
      report.errors.push(`Clip ${clip.id} error: ${String(err)}`);
    } finally {
      listener.onWakeWord = prevOnWake;
      listener.onFinalSpeech = prevOnFinal;
    }

    if (clip.kind === 'wake') {
      report.wakeClips.total++;
      if (clipWakeDetected) {
        report.wakeClips.wakes++;
      }
      // Counts only, never heard text
    } else if (clip.kind === 'lookalike') {
      report.lookalikeClips.total++;
      if (clipWakeDetected) {
        report.lookalikeClips.falseWakes++;
      }
      // Counts only, never heard text
    } else if (clip.kind === 'request') {
      const durationSeconds = (Date.now() - startMs) / 1000;
      report.requests.push({
        id: clip.id,
        check: clip.check,
        expected: clip.expect,
        heard: clipHeardText,
        action: clipActionName,
        reply: clipReply,
        timings: {
          durationSeconds,
          heardToReplyMs,
        },
      });

      if (clip.expect?.action && clipActionName !== clip.expect.action) {
        report.result = 'fail';
      }
    }
  }

  report.wakeClips.rate =
    report.wakeClips.total > 0
      ? report.wakeClips.wakes / report.wakeClips.total
      : 0;

  onProgress?.('Saving self-test results...');
  const jsonString = JSON.stringify(report, null, 2);
  try {
    await Bridge.kevoSelftestSaveResult(jsonString);
  } catch (err) {
    report.errors.push(`Could not save self-test result: ${String(err)}`);
  }

  return report;
}
