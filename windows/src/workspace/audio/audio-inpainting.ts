/**
 * Spectral Audio Inpainting & Transient Removal for AnF Audio Studio
 * 
 * Detects and repairs impulsive acoustic transients (clicks, pops, mic thuds, coughs)
 * in speech recordings using local moving-average thresholding and crossfade inpainting.
 * Inspired by debpalash/voicestudio.
 */

export interface TransientSpike {
  startSample: number;
  length: number;
  peakEnergy: number;
}

export interface InpaintResult {
  cleanedSamples: Float32Array;
  spikesRepaired: number;
  repairedRanges: Array<[number, number]>;
}

export const AudioInpaintingCore = {
  /**
   * Scan audio PCM buffer for sudden transient bursts exceeding the local moving average.
   */
  detectTransients(
    samples: Float32Array,
    frameSize = 256,
    energyMultiplier = 3.5
  ): TransientSpike[] {
    if (!samples || samples.length === 0) return [];
    const spikes: TransientSpike[] = [];
    const numFrames = Math.floor(samples.length / frameSize);
    const energies = new Float32Array(numFrames);

    // 1. Calculate frame RMS energy
    let sumEnergy = 0;
    for (let f = 0; f < numFrames; f++) {
      let frameSum = 0;
      const offset = f * frameSize;
      for (let i = 0; i < frameSize; i++) {
        const val = samples[offset + i];
        frameSum += val * val;
      }
      const rms = Math.sqrt(frameSum / frameSize);
      energies[f] = rms;
      sumEnergy += rms;
    }

    const avgEnergy = sumEnergy / Math.max(1, numFrames);
    const threshold = Math.max(0.01, avgEnergy * energyMultiplier);

    // 2. Identify outlier spikes
    for (let f = 1; f < numFrames - 1; f++) {
      if (energies[f] > threshold && energies[f] > energies[f - 1] * 2.0 && energies[f] > energies[f + 1] * 2.0) {
        spikes.push({
          startSample: f * frameSize,
          length: frameSize,
          peakEnergy: energies[f],
        });
      }
    }

    return spikes;
  },

  /**
   * Inpaint damaged audio ranges using smooth boundary interpolation.
   */
  repairTransients(samples: Float32Array, spikes: TransientSpike[]): InpaintResult {
    const out = new Float32Array(samples);
    const repairedRanges: Array<[number, number]> = [];

    for (const spike of spikes) {
      const start = spike.startSample;
      const end = Math.min(out.length - 1, start + spike.length);
      const preVal = start > 0 ? out[start - 1] : 0;
      const postVal = end < out.length - 1 ? out[end + 1] : 0;

      const len = end - start + 1;
      for (let i = 0; i < len; i++) {
        const t = i / (len + 1);
        // Linear crossfade interpolation across the burst gap
        out[start + i] = preVal * (1 - t) + postVal * t;
      }

      repairedRanges.push([start, end]);
    }

    return {
      cleanedSamples: out,
      spikesRepaired: spikes.length,
      repairedRanges,
    };
  }
};
