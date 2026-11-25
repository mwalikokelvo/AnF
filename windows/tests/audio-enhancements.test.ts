import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AudioInpaintingCore } from '../src/workspace/audio/audio-inpainting';
import { ChapterMarkersCore } from '../src/workspace/audio/chapter-markers';

describe('Audio Enhancements (Spectral Inpainting & Chapter Markers)', () => {
  it('detects and repairs impulsive transient pops/clicks', () => {
    // 2048 samples of quiet speech baseline (~0.05 amplitude)
    const samples = new Float32Array(2048);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = 0.05 * Math.sin(i * 0.1);
    }
    // Plant sudden burst pop in frame 3 (sample 768 to 1024)
    for (let i = 768; i < 1024; i++) {
      samples[i] = 0.95; // Loud pop
    }

    const spikes = AudioInpaintingCore.detectTransients(samples, 256, 3.0);
    assert.equal(spikes.length, 1);
    assert.equal(spikes[0].startSample, 768);

    const repaired = AudioInpaintingCore.repairTransients(samples, spikes);
    assert.equal(repaired.spikesRepaired, 1);
    // Verified pop amplitude was mitigated
    assert.ok(Math.abs(repaired.cleanedSamples[800]) < 0.2);
  });

  it('extracts chapter markers from description text', () => {
    const desc = `
Episode 42: Modern Systems Architecture
00:00 Introduction
02:30 Local-first Paradigms
14:15 - Audio Inpainting Algorithms
1:02:40 Conclusion & Wrap up
`;
    const chapters = ChapterMarkersCore.extractChapters(desc, 4000);
    assert.equal(chapters.length, 4);
    assert.equal(chapters[0].title, 'Introduction');
    assert.equal(chapters[0].startSeconds, 0);
    assert.equal(chapters[1].title, 'Local-first Paradigms');
    assert.equal(chapters[1].startSeconds, 150);
    assert.equal(chapters[1].timeLabel, '2:30');
    assert.equal(chapters[2].title, 'Audio Inpainting Algorithms');
    assert.equal(chapters[3].title, 'Conclusion & Wrap up');
    assert.equal(chapters[3].startSeconds, 3760);
    assert.equal(chapters[3].timeLabel, '1:02:40');
  });
});
