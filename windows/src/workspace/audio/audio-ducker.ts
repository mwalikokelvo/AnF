/**
 * Side-Chain Audio Ducking & Multi-Track Stem Mixer
 * 
 * Provides automated side-chain audio attenuation, smooth attack/release ramps,
 * and multi-track stems mixing so background music or ambient audio dynamically ducks
 * whenever narration, dialogue, or voice responses speak.
 * 
 * Inspired by debpalash/voicestudio multi-track DAW mixing.
 */

export interface TrackStem {
  id: string;
  name: string;
  samples: Float32Array;
  volume: number; // 0.0 to 1.0
  pan: number;    // -1.0 (left) to +1.0 (right)
  isSideChainTrigger?: boolean;
}

export interface DuckingConfig {
  duckingThresholdRms: number; // RMS level on trigger track that causes ducking (e.g. 0.05)
  duckingGain: number;         // Gain applied to ducked tracks (e.g. 0.25 = -12 dB)
  attackMs: number;            // Attack time to reach ducked gain (e.g. 50 ms)
  releaseMs: number;           // Release time to recover original gain (e.g. 300 ms)
  sampleRate: number;
}

export class AudioDuckerMixer {
  private config: DuckingConfig;
  private stems: Map<string, TrackStem> = new Map();

  constructor(config: Partial<DuckingConfig> = {}) {
    this.config = {
      duckingThresholdRms: config.duckingThresholdRms ?? 0.04,
      duckingGain: config.duckingGain ?? 0.25,
      attackMs: config.attackMs ?? 40,
      releaseMs: config.releaseMs ?? 250,
      sampleRate: config.sampleRate ?? 16000
    };
  }

  public addStem(stem: TrackStem): void {
    this.stems.set(stem.id, stem);
  }

  /**
   * Computes an envelope array of gain multipliers (0.0 to 1.0) for background tracks
   * based on speech activity on the side-chain trigger track.
   */
  public computeDuckingEnvelope(triggerSamples: Float32Array): Float32Array {
    const n = triggerSamples.length;
    const envelope = new Float32Array(n);
    const windowSize = Math.floor(this.config.sampleRate * 0.02); // 20ms RMS window
    const attackSamples = Math.floor((this.config.attackMs / 1000) * this.config.sampleRate);
    const releaseSamples = Math.floor((this.config.releaseMs / 1000) * this.config.sampleRate);

    let currentGain = 1.0;

    for (let i = 0; i < n; i++) {
      // Calculate local RMS
      if (i % windowSize === 0) {
        let sumSq = 0;
        const count = Math.min(windowSize, n - i);
        for (let j = 0; j < count; j++) {
          const s = triggerSamples[i + j];
          sumSq += s * s;
        }
        const rms = Math.sqrt(sumSq / count);

        const targetGain = rms >= this.config.duckingThresholdRms
          ? this.config.duckingGain
          : 1.0;

        // Smooth transition
        if (targetGain < currentGain) {
          const step = (1.0 - this.config.duckingGain) / Math.max(1, attackSamples / windowSize);
          currentGain = Math.max(targetGain, currentGain - step);
        } else if (targetGain > currentGain) {
          const step = (1.0 - this.config.duckingGain) / Math.max(1, releaseSamples / windowSize);
          currentGain = Math.min(1.0, currentGain + step);
        }
      }
      envelope[i] = currentGain;
    }

    return envelope;
  }

  /**
   * Mixes all stems down to a master stereo or mono buffer with automatic ducking
   */
  public mixdown(): Float32Array {
    const stemList = Array.from(this.stems.values());
    if (stemList.length === 0) return new Float32Array(0);

    const maxLength = Math.max(...stemList.map(s => s.samples.length));
    const master = new Float32Array(maxLength);

    // Identify side-chain trigger stem (speech/narration)
    const trigger = stemList.find(s => s.isSideChainTrigger);
    const duckingEnvelope = trigger
      ? this.computeDuckingEnvelope(trigger.samples)
      : null;

    for (const stem of stemList) {
      const isTrigger = stem.id === trigger?.id;
      for (let i = 0; i < stem.samples.length; i++) {
        let sample = stem.samples[i] * stem.volume;
        if (!isTrigger && duckingEnvelope) {
          const envGain = i < duckingEnvelope.length ? duckingEnvelope[i] : 1.0;
          sample *= envGain;
        }
        master[i] += sample;
      }
    }

    // Soft clipping / limiter to prevent harsh digital wrapping
    for (let i = 0; i < maxLength; i++) {
      master[i] = Math.tanh(master[i]);
    }

    return master;
  }
}
