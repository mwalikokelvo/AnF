import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { slicePcmAudio, wav, durationText } from '../src/workspace/audio-data.js';

describe('Audio Clip Slicing & Export (Cap / Supoclip Integration)', () => {
  const sampleRate = 44100;

  test('slicePcmAudio extracts exact sample range across mono and stereo channels', () => {
    // 10 seconds of audio at 44100 Hz
    const totalSamples = sampleRate * 10;
    const chLeft = new Float32Array(totalSamples);
    const chRight = new Float32Array(totalSamples);

    for (let i = 0; i < totalSamples; i++) {
      chLeft[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
      chRight[i] = Math.sin((2 * Math.PI * 880 * i) / sampleRate);
    }

    // Extract a 3-second clip starting at second 2.0
    const startSec = 2.0;
    const durSec = 3.0;
    const sliced = slicePcmAudio([chLeft, chRight], sampleRate, startSec, durSec);

    assert.equal(sliced.length, 2);
    const expectedLength = sampleRate * 3;
    assert.equal(sliced[0].length, expectedLength);
    assert.equal(sliced[1].length, expectedLength);

    // Verify sample content alignment
    const startSample = Math.round(startSec * sampleRate);
    assert.equal(sliced[0][0], chLeft[startSample]);
    assert.equal(sliced[1][0], chRight[startSample]);
  });

  test('slicePcmAudio handles boundary edge cases safely', () => {
    const ch = [new Float32Array(1000)];

    // Empty channels
    assert.deepEqual(slicePcmAudio([], 44100, 0, 1), []);
    assert.deepEqual(slicePcmAudio([new Float32Array(0)], 44100, 0, 1), []);

    // Start beyond length
    assert.deepEqual(slicePcmAudio(ch, 1000, 2.0, 1.0), []);

    // Duration is zero or negative
    assert.deepEqual(slicePcmAudio(ch, 1000, 0, 0), []);
    assert.deepEqual(slicePcmAudio(ch, 1000, 0, -5), []);

    // Duration exceeding audio length clamps cleanly
    const clamped = slicePcmAudio(ch, 1000, 0.5, 2.0);
    assert.equal(clamped[0].length, 500);
  });

  test('sliced PCM audio produces valid 16-bit PCM WAV buffer', () => {
    const totalSamples = 16000;
    const mono = [new Float32Array(totalSamples)];
    for (let i = 0; i < totalSamples; i++) mono[0][i] = 0.5;

    const clip = slicePcmAudio(mono, 16000, 0, 0.5);
    assert.equal(clip[0].length, 8000);

    const buffer = wav(clip, 16000);
    assert.ok(buffer instanceof ArrayBuffer);
    assert.equal(buffer.byteLength, 44 + 8000 * 2);

    const view = new DataView(buffer);
    assert.equal(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)), 'RIFF');
    assert.equal(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)), 'WAVE');
  });
});
