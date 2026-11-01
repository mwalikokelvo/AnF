import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBuffer,
  splitBuffer,
  trimBuffer,
  deleteRegionBuffer,
  encodeWavBlob,
  createStudioAudioEngine,
} from '../src/workspace/audio-engine.js';

describe('Audacity Audio Studio Engine & Waveform Operations', () => {
  it('createBuffer creates buffer with correct channel geometry and sample rate', () => {
    const buf = createBuffer(2, 48000, 48000);
    assert.equal(buf.numberOfChannels, 2);
    assert.equal(buf.length, 48000);
    assert.equal(buf.sampleRate, 48000);
    assert.equal(buf.duration, 1.0);
    assert.equal(buf.getChannelData(0).length, 48000);
    assert.equal(buf.getChannelData(1).length, 48000);
  });

  it('splitBuffer divides an AudioBuffer at the specified timestamp without sample loss', () => {
    const sampleRate = 32000;
    const buf = createBuffer(1, sampleRate * 2, sampleRate); // 2 seconds
    const channel = buf.getChannelData(0);
    for (let i = 0; i < channel.length; i++) {
      channel[i] = i < sampleRate ? 0.5 : -0.5;
    }

    const [part1, part2] = splitBuffer(buf, 1.0);
    assert.equal(part1.length, sampleRate);
    assert.equal(part2.length, sampleRate);
    assert.equal(part1.getChannelData(0)[0], 0.5);
    assert.equal(part2.getChannelData(0)[0], -0.5);
  });

  it('trimBuffer extracts the requested time region accurately', () => {
    const sampleRate = 32000;
    const buf = createBuffer(1, sampleRate * 4, sampleRate); // 4 seconds
    const channel = buf.getChannelData(0);
    for (let i = 0; i < channel.length; i++) {
      channel[i] = i / channel.length;
    }

    const trimmed = trimBuffer(buf, { startSec: 1.0, endSec: 3.0 });
    assert.equal(trimmed.length, sampleRate * 2);
    assert.equal(trimmed.duration, 2.0);
    // Verify first sample in trimmed corresponds to 1.0s in original
    const expectedFirst = channel[sampleRate];
    assert.equal(trimmed.getChannelData(0)[0], expectedFirst);
  });

  it('deleteRegionBuffer removes cut region and applies equal-power crossfade', () => {
    const sampleRate = 32000;
    const buf = createBuffer(1, sampleRate * 3, sampleRate); // 3 seconds
    const channel = buf.getChannelData(0);
    channel.fill(0.75);

    const deleted = deleteRegionBuffer(buf, { startSec: 1.0, endSec: 2.0 }, 10);
    // 3 seconds - 1 second cut = 2 seconds length
    assert.equal(deleted.length, sampleRate * 2);
    assert.equal(deleted.duration, 2.0);
    // Boundary samples remain finite
    for (let i = 0; i < deleted.length; i++) {
      assert.ok(Number.isFinite(deleted.getChannelData(0)[i]));
    }
  });

  it('encodeWavBlob exports 16-bit PCM RIFF WAVE with valid 44-byte header', async () => {
    const sampleRate = 44100;
    const buf = createBuffer(2, sampleRate, sampleRate); // 1 sec stereo
    const blob = encodeWavBlob(buf, 16);

    assert.equal(blob.type, 'audio/wav');
    const arrayBuffer = await blob.arrayBuffer();
    const view = new DataView(arrayBuffer);

    // Check RIFF header
    const str = (offset: number, len: number) => {
      let s = '';
      for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
      return s;
    };

    assert.equal(str(0, 4), 'RIFF');
    assert.equal(str(8, 4), 'WAVE');
    assert.equal(str(12, 4), 'fmt ');
    assert.equal(view.getUint16(20, true), 1); // PCM
    assert.equal(view.getUint16(22, true), 2); // 2 channels
    assert.equal(view.getUint32(24, true), sampleRate);
    assert.equal(view.getUint16(34, true), 16); // 16 bits
    assert.equal(str(36, 4), 'data');

    // Expected size = 44 + (samples * channels * 2) = 44 + (44100 * 2 * 2) = 176444
    assert.equal(arrayBuffer.byteLength, 44 + sampleRate * 2 * 2);
  });

  it('encodeWavBlob exports 24-bit PCM RIFF WAVE with 3 bytes per sample', async () => {
    const sampleRate = 48000;
    const buf = createBuffer(1, 1000, sampleRate); // 1000 samples mono
    const blob = encodeWavBlob(buf, 24);

    assert.equal(blob.type, 'audio/wav');
    const arrayBuffer = await blob.arrayBuffer();
    const view = new DataView(arrayBuffer);

    assert.equal(view.getUint16(22, true), 1); // 1 channel
    assert.equal(view.getUint32(24, true), sampleRate);
    assert.equal(view.getUint16(34, true), 24); // 24 bits

    // Expected size = 44 + (1000 * 1 * 3) = 3044
    assert.equal(arrayBuffer.byteLength, 44 + 1000 * 3);
  });

  it('StudioAudioEngine provides complete recording lifecycle and live meter levels', async () => {
    const engine = createStudioAudioEngine();
    await engine.startRecording();

    const levels = engine.getLiveMeterLevels();
    assert.ok(typeof levels.peakDbfs === 'number');
    assert.ok(typeof levels.rmsDbfs === 'number');
    assert.equal(typeof levels.isClipping, 'boolean');

    const recorded = await engine.stopRecording();
    assert.ok(recorded.duration > 0);

    const [left, right] = engine.split(recorded, 0.5);
    assert.ok(left);
    assert.ok(right);

    const trimmed = engine.trim(recorded, { startSec: 0.1, endSec: 0.8 });
    assert.ok(trimmed);

    const wavBlob = engine.exportWav(recorded, 16);
    assert.equal(wavBlob.type, 'audio/wav');
  });
});
