/**
 * Neural read-aloud playback (disk cache + provider). Phase 5 supplies Piper/Kokoro;
 * until then Reader keeps system speech unless a provider is registered and the flag is on.
 */

import {
  synthesizeChunk,
  type TtsAudioFormat,
  type TtsProvider,
  type VoiceDisk,
  type TtsSynthesisRequest,
} from './tts-service';

export const NEURAL_TTS_STORAGE_KEY = 'anf-neural-tts';

export interface NeuralSpeechConfig {
  providerId: string;
  voiceId: string;
  format?: TtsAudioFormat;
  sampleRate?: number;
}

export interface NeuralSpeechRegistration {
  provider: TtsProvider;
  disk: VoiceDisk;
  config: NeuralSpeechConfig;
}

/** Test-only stub; never used in production UI until a real model provider exists. */
export class NullTtsProvider implements TtsProvider {
  async synthesize(): Promise<Uint8Array> {
    throw new Error('NullTtsProvider: no neural model is installed.');
  }
}

export interface VoiceStudioProviderOptions {
  serverUrl?: string;
  model?: string;
}

/**
 * Local neural speech synthesis provider backed by VoiceStudio (http://localhost:3900).
 * AGPL integration: connects purely via local HTTP OpenAI-compatible endpoint with zero cloud telemetry.
 */
export class VoiceStudioTtsProvider implements TtsProvider {
  private serverUrl: string;
  private model: string;

  constructor(options: VoiceStudioProviderOptions = {}) {
    this.serverUrl = options.serverUrl || 'http://localhost:3900';
    this.model = options.model || 'tts-1';
  }

  async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.serverUrl}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async synthesize(request: TtsSynthesisRequest): Promise<Uint8Array> {
    const format = request.format || 'wav';
    const body = JSON.stringify({
      model: this.model,
      voice: request.voiceId || 'alloy',
      input: request.text,
      response_format: format,
    });

    const res = await fetch(`${this.serverUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!res.ok) {
      throw new Error(`VoiceStudio synthesis failed: HTTP ${res.status}`);
    }

    const buffer = await res.arrayBuffer();
    return new Uint8Array(buffer);
  }
  }

let registered: NeuralSpeechRegistration | null = null;

export function registerNeuralSpeechProvider(registration: NeuralSpeechRegistration | null): void {
  registered = registration;
}

export function getNeuralSpeechRegistration(): NeuralSpeechRegistration | null {
  return registered;
}

export function neuralSpeechToggleAvailable(): boolean {
  return registered !== null;
}

export function setNeuralSpeechEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(NEURAL_TTS_STORAGE_KEY, '1');
    else localStorage.removeItem(NEURAL_TTS_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

export function neuralSpeechEnabled(): boolean {
  if (!registered) return false;
  try {
    return localStorage.getItem(NEURAL_TTS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function createMemoryVoiceDisk(): VoiceDisk {
  const store = new Map<string, Uint8Array>();
  return {
    async read(name) {
      const hit = store.get(name);
      return hit ? new Uint8Array(hit) : null;
    },
    async write(name, bytes) {
      store.set(name, new Uint8Array(bytes));
    },
    async remove(name) {
      store.delete(name);
    },
    async list() {
      return [...store.entries()].map(([name, bytes]) => ({
        name,
        bytes: bytes.length,
        mtimeMs: Date.now(),
      }));
    },
  };
}

function mimeForFormat(format: TtsAudioFormat): string {
  if (format === 'wav') return 'audio/wav';
  if (format === 'mp3') return 'audio/mpeg';
  if (format === 'opus') return 'audio/ogg; codecs=opus';
  return 'audio/ogg';
}

export interface PlayNeuralDeps {
  createAudio?: () => HTMLAudioElement;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
}

export type PlayNeuralOutcome = 'completed' | 'cancelled' | 'error';

/** Plays raw neural audio bytes via HTMLAudioElement (blob URL). */
export async function playNeuralSentence(
  audio: Uint8Array,
  format: TtsAudioFormat,
  rate: number,
  control: { isCancelled: () => boolean },
  deps: PlayNeuralDeps = {},
): Promise<PlayNeuralOutcome> {
  if (control.isCancelled()) return 'cancelled';
  const createAudio = deps.createAudio ?? (() => new Audio());
  const createObjectURL = deps.createObjectURL ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeObjectURL = deps.revokeObjectURL ?? ((url: string) => URL.revokeObjectURL(url));
  const blob = new Blob([new Uint8Array(audio)], { type: mimeForFormat(format) });
  const url = createObjectURL(blob);
  const el = createAudio();
  el.src = url;
  el.playbackRate = rate;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: PlayNeuralOutcome) => {
      if (settled) return;
      settled = true;
      el.pause();
      el.src = '';
      el.onended = null;
      el.onerror = null;
      revokeObjectURL(url);
      resolve(outcome);
    };
    el.onended = () => finish(control.isCancelled() ? 'cancelled' : 'completed');
    el.onerror = () => finish('error');
    void el.play().catch(() => finish('error'));
  });
}

export type NeuralSpeakOutcome = 'ok' | 'fallback' | 'cancelled';

export interface NeuralUtterancePlayer {
  speak(text: string, rate: number, token: number, currentToken: () => number): Promise<NeuralSpeakOutcome>;
  stop(): void;
}

export interface NeuralPlayerDeps {
  play?: (
    audio: Uint8Array,
    format: TtsAudioFormat,
    rate: number,
    control: { isCancelled: () => boolean },
  ) => Promise<PlayNeuralOutcome>;
}

export function createNeuralUtterancePlayer(
  registration: NeuralSpeechRegistration,
  deps: NeuralPlayerDeps = {},
): NeuralUtterancePlayer {
  const play = deps.play ?? ((audio, format, rate, control) => playNeuralSentence(audio, format, rate, control));
  let active: HTMLAudioElement | null = null;
  let activeUrl: string | null = null;
  let stopGen = 0;

  function stopPlayback() {
    if (active) {
      active.pause();
      active.src = '';
      active.onended = null;
      active.onerror = null;
      active = null;
    }
    if (activeUrl) {
      URL.revokeObjectURL(activeUrl);
      activeUrl = null;
    }
  }

  return {
    stop() {
      stopGen += 1;
      stopPlayback();
    },
    async speak(text, rate, token, currentToken) {
      const gen = stopGen;
      stopPlayback();
      const cancelled = () => currentToken() !== token || stopGen !== gen;
      if (cancelled()) return 'cancelled';
      const { provider, disk, config } = registration;
      const format = config.format ?? 'wav';
      const sampleRate = config.sampleRate ?? 22050;
      let audio: Uint8Array;
      try {
        const result = await synthesizeChunk(disk, provider, {
          providerId: config.providerId,
          voiceId: config.voiceId,
          text,
          format,
          sampleRate,
        });
        audio = result.audio;
      } catch {
        return 'fallback';
      }
      if (cancelled()) return 'cancelled';

      if (!deps.play) {
        const blob = new Blob([new Uint8Array(audio)], { type: mimeForFormat(format) });
        activeUrl = URL.createObjectURL(blob);
        const el = new Audio(activeUrl);
        active = el;
        el.playbackRate = rate;
        const outcome = await new Promise<PlayNeuralOutcome>((resolve) => {
          const finish = (value: PlayNeuralOutcome) => {
            el.onended = null;
            el.onerror = null;
            resolve(value);
          };
          el.onended = () => finish(cancelled() ? 'cancelled' : 'completed');
          el.onerror = () => finish('error');
          void el.play().catch(() => finish('error'));
        });
        stopPlayback();
        if (outcome === 'error') return 'fallback';
        if (outcome === 'cancelled' || cancelled()) return 'cancelled';
        return 'ok';
      }

      const outcome = await play(audio, format, rate, { isCancelled: cancelled });
      if (outcome === 'error') return 'fallback';
      if (outcome === 'cancelled' || cancelled()) return 'cancelled';
      return 'ok';
    },
  };
}
