import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NullTtsProvider,
  createMemoryVoiceDisk,
  createNeuralUtterancePlayer,
  neuralSpeechEnabled,
  neuralSpeechToggleAvailable,
  playNeuralSentence,
  registerNeuralSpeechProvider,
  setNeuralSpeechEnabled,
  type NeuralSpeechRegistration,
} from '../src/workspace/neural-speech.ts';
import type { TtsProvider } from '../src/workspace/tts-service.ts';

const storageMem = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storageMem.get(key) ?? null,
    setItem: (key: string, value: string) => { storageMem.set(key, value); },
    removeItem: (key: string) => { storageMem.delete(key); },
    clear: () => storageMem.clear(),
    key: () => null,
    length: 0,
  },
});

function tinyWav(payload: number[]): Uint8Array {
  const data = Uint8Array.from(payload);
  const bytes = new Uint8Array(44 + data.length);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  const size = 36 + data.length;
  bytes[4] = size & 0xff;
  bytes[5] = (size >> 8) & 0xff;
  bytes[6] = (size >> 16) & 0xff;
  bytes[7] = (size >> 24) & 0xff;
  bytes.set([0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20], 8);
  bytes[16] = 16;
  bytes[20] = 1;
  bytes[22] = 1;
  bytes[24] = 0x80;
  bytes[25] = 0x3e;
  bytes[32] = 2;
  bytes[34] = 16;
  bytes.set([0x64, 0x61, 0x74, 0x61], 36);
  bytes[40] = data.length & 0xff;
  bytes[41] = (data.length >> 8) & 0xff;
  bytes.set(data, 44);
  return bytes;
}

const WAV = tinyWav([1, 2, 3, 4]);

test('NullTtsProvider always rejects synthesis', async () => {
  const stub = new NullTtsProvider();
  await assert.rejects(() => stub.synthesize({
    providerId: 'null',
    voiceId: 'none',
    text: 'hi',
    format: 'wav',
    sampleRate: 22050,
  }), /no neural model/i);
});

test('neuralSpeechEnabled is false until flag and registration', () => {
  registerNeuralSpeechProvider(null);
  setNeuralSpeechEnabled(false);
  assert.equal(neuralSpeechToggleAvailable(), false);
  assert.equal(neuralSpeechEnabled(), false);

  const disk = createMemoryVoiceDisk();
  let calls = 0;
  const provider: TtsProvider = { synthesize: async () => { calls += 1; return WAV; } };
  registerNeuralSpeechProvider({
    disk,
    provider,
    config: { providerId: 'test', voiceId: 'voice-a', format: 'wav', sampleRate: 22050 },
  });
  assert.equal(neuralSpeechToggleAvailable(), true);
  assert.equal(neuralSpeechEnabled(), false);

  setNeuralSpeechEnabled(true);
  assert.equal(neuralSpeechEnabled(), true);
  registerNeuralSpeechProvider(null);
  setNeuralSpeechEnabled(false);
});

test('playNeuralSentence plays bytes and respects cancellation', async () => {
  const urls: string[] = [];
  const revoked: string[] = [];
  let playbackRate = 0;
  class FakeAudio {
    playbackRate = 1;
    src = '';
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    pause() {}
    async play() {
      playbackRate = this.playbackRate;
      queueMicrotask(() => this.onended?.());
    }
  }
  let cancelled = false;
  const result = await playNeuralSentence(WAV, 'wav', 1.25, {
    isCancelled: () => cancelled,
  }, {
    createAudio: () => new FakeAudio() as unknown as HTMLAudioElement,
    createObjectURL: () => {
      const url = 'blob:fake-' + urls.length;
      urls.push(url);
      return url;
    },
    revokeObjectURL: (url) => revoked.push(url),
  });
  assert.equal(result, 'completed');
  assert.equal(urls.length, 1);
  assert.equal(revoked.length, 1);
  assert.equal(playbackRate, 1.25);

  cancelled = true;
  const skipped = await playNeuralSentence(WAV, 'wav', 1, { isCancelled: () => true }, {
    createAudio: () => new FakeAudio() as unknown as HTMLAudioElement,
    createObjectURL: () => 'blob:skip',
    revokeObjectURL: () => {},
  });
  assert.equal(skipped, 'cancelled');
});

test('createNeuralUtterancePlayer caches chunks and stops cleanly', async () => {
  const disk = createMemoryVoiceDisk();
  let synthCalls = 0;
  const provider: TtsProvider = {
    synthesize: async () => {
      synthCalls += 1;
      return WAV;
    },
  };
  const reg: NeuralSpeechRegistration = {
    disk,
    provider,
    config: { providerId: 'piper', voiceId: 'en', format: 'wav', sampleRate: 22050 },
  };
  const played: string[] = [];
  let pausePlay = false;
  let releasePlay: (() => void) | null = null;
  const player = createNeuralUtterancePlayer(reg, {
    play: async (audio, format, rate, control) => {
      played.push(`${audio.length}:${format}:${rate}`);
      if (pausePlay) {
        await new Promise<void>((resolve) => {
          releasePlay = () => resolve();
        });
      }
      return control.isCancelled() ? 'cancelled' : 'completed';
    },
  });

  let token = 1;
  assert.equal(await player.speak('Hello there.', 1, token, () => token), 'ok');
  assert.equal(synthCalls, 1);
  assert.equal(played.length, 1);

  assert.equal(await player.speak('Hello there.', 1, token, () => token), 'ok');
  assert.equal(synthCalls, 1, 'second utterance should hit disk cache');

  token = 2;
  pausePlay = true;
  const pending = player.speak('Another line.', 1, token, () => token);
  await new Promise((resolve) => setTimeout(resolve, 0));
  player.stop();
  releasePlay?.();
  assert.equal(await pending, 'cancelled');

  synthCalls = 0;
  const failPlayer = createNeuralUtterancePlayer({
    disk,
    provider: new NullTtsProvider(),
    config: reg.config,
  });
  assert.equal(await failPlayer.speak('Nope.', 1, 1, () => 1), 'fallback');
  assert.equal(synthCalls, 0);
});
