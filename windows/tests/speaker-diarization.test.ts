import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SpeakerDiarizationCore } from '../src/workspace/audio/speaker-diarization';

describe('Frontier 2: Speaker Diarization & Audio Clustering', () => {
  it('extracts acoustic features and separates distinct speakers', () => {
    // Generate synthetic audio with two distinct speakers:
    // Speaker 1: Low-frequency tone (150Hz, low zero-crossings)
    // Speaker 2: Higher-frequency tone (600Hz, high zero-crossings)
    const sampleRate = 16000;
    const durationSec = 2.0;
    const totalSamples = sampleRate * durationSec;
    const pcm = new Float32Array(totalSamples);

    for (let i = 0; i < totalSamples; i++) {
      if (i < totalSamples / 2) {
        // Speaker 1 (first second)
        pcm[i] = 0.4 * Math.sin((2 * Math.PI * 150 * i) / sampleRate);
      } else {
        // Speaker 2 (second second)
        pcm[i] = 0.4 * Math.sin((2 * Math.PI * 600 * i) / sampleRate);
      }
    }

    const turns = SpeakerDiarizationCore.diarize(pcm, 1024, sampleRate, 2);
    assert.ok(turns.length >= 2);
    const speakers = new Set(turns.map(t => t.speakerId));
    assert.ok(speakers.has('Speaker 1'));
    assert.ok(speakers.has('Speaker 2'));
  });
});
