/**
 * Acoustic Timbre Fingerprinting with Formants & HNR
 * 
 * Extracts fundamental frequency (F0), vocal tract formants (F1, F2),
 * harmonic-to-noise ratio (HNR), and spectral tilt from audio clips
 * to match narrator timbre profiles and guide expressive voice synthesis.
 * 
 * Inspired by debpalash/voicestudio timbre analysis and voice style extraction.
 */

export interface TimbreFingerprint {
  pitchMedianHz: number;    // Fundamental frequency F0 (~85 - 350 Hz)
  formantF1Hz: number;      // First formant resonance (~300 - 900 Hz)
  formantF2Hz: number;      // Second formant resonance (~900 - 2500 Hz)
  hnrDb: number;            // Harmonics-to-Noise Ratio in dB (~10 - 25 dB)
  spectralBrightness: number;// Ratio of high-frequency (>2kHz) to total energy
  timbreLabel: string;      // Categorical classification
}

export interface VoiceStyleProfile {
  id: string;
  name: string;
  description: string;
  targetFingerprint: Omit<TimbreFingerprint, 'timbreLabel'>;
}

export const REFERENCE_VOICE_PROFILES: VoiceStyleProfile[] = [
  {
    id: 'voice_deep_baritone',
    name: 'Deep Baritone Narrator',
    description: 'Resonant, authoritative, deep pitch suitable for historical and epic literature.',
    targetFingerprint: { pitchMedianHz: 110, formantF1Hz: 420, formantF2Hz: 1150, hnrDb: 18.5, spectralBrightness: 0.15 }
  },
  {
    id: 'voice_warm_conversational',
    name: 'Warm Conversational',
    description: 'Balanced midrange, smooth harmonics, ideal for fiction and general non-fiction.',
    targetFingerprint: { pitchMedianHz: 165, formantF1Hz: 550, formantF2Hz: 1450, hnrDb: 21.0, spectralBrightness: 0.22 }
  },
  {
    id: 'voice_bright_clear',
    name: 'Crisp Technical / Academic',
    description: 'High intelligibility, bright high frequencies, ideal for papers and study material.',
    targetFingerprint: { pitchMedianHz: 210, formantF1Hz: 680, formantF2Hz: 1850, hnrDb: 23.5, spectralBrightness: 0.35 }
  }
];

export class AcousticFingerprinter {
  /**
   * Computes autocorrelation to extract fundamental pitch F0 in Hz
   */
  public extractPitchF0(samples: Float32Array, sampleRate = 16000): number {
    const minPeriod = Math.floor(sampleRate / 400); // 400 Hz max
    const maxPeriod = Math.floor(sampleRate / 75);  // 75 Hz min

    let bestPeriod = minPeriod;
    let maxCorr = -1;

    for (let lag = minPeriod; lag <= maxPeriod; lag++) {
      let sum = 0;
      let count = 0;
      for (let i = 0; i < samples.length - lag; i += 4) {
        sum += samples[i] * samples[i + lag];
        count++;
      }
      const corr = count > 0 ? sum / count : 0;
      if (corr > maxCorr) {
        maxCorr = corr;
        bestPeriod = lag;
      }
    }

    const f0 = sampleRate / bestPeriod;
    return Math.round(f0 * 10) / 10;
  }

  /**
   * Approximates formants F1 and F2 and spectral characteristics via discrete Fourier analysis
   */
  public analyzeSpectrum(samples: Float32Array, sampleRate = 16000): {
    f1: number;
    f2: number;
    brightness: number;
    hnr: number;
  } {
    const n = Math.min(samples.length, 1024);
    const hzPerBin = sampleRate / n;
    const bins = Math.min(n / 2, Math.floor(3000 / hzPerBin));
    const energySpectrum = new Float32Array(bins);

    for (let k = 0; k < bins; k++) {
      let real = 0;
      let imag = 0;
      const omega = (2 * Math.PI * k) / n;
      for (let t = 0; t < n; t++) {
        real += samples[t] * Math.cos(omega * t);
        imag -= samples[t] * Math.sin(omega * t);
      }
      energySpectrum[k] = Math.sqrt(real * real + imag * imag);
    }

    // F1 peak: 300 - 900 Hz
    let f1PeakBin = Math.floor(300 / hzPerBin);
    let maxF1 = -1;
    for (let k = Math.floor(300 / hzPerBin); k <= Math.floor(900 / hzPerBin); k++) {
      if (k < bins && energySpectrum[k] > maxF1) {
        maxF1 = energySpectrum[k];
        f1PeakBin = k;
      }
    }

    // F2 peak: 900 - 2500 Hz
    let f2PeakBin = Math.floor(900 / hzPerBin);
    let maxF2 = -1;
    for (let k = Math.floor(900 / hzPerBin); k <= Math.min(bins - 1, Math.floor(2500 / hzPerBin)); k++) {
      if (k < bins && energySpectrum[k] > maxF2) {
        maxF2 = energySpectrum[k];
        f2PeakBin = k;
      }
    }

    // Brightness: energy above 2000 Hz / total energy
    const highCutoff = Math.floor(2000 / hzPerBin);
    let totalE = 0;
    let highE = 0;
    for (let k = 0; k < bins; k++) {
      totalE += energySpectrum[k];
      if (k >= highCutoff) highE += energySpectrum[k];
    }
    const brightness = totalE > 0 ? Math.round((highE / totalE) * 100) / 100 : 0.2;

    // Harmonic-to-Noise Ratio (ratio of peak formant energies to background floor)
    const avgFloor = (totalE - maxF1 - maxF2) / (bins - 2 || 1);
    const peakEnergy = (maxF1 + maxF2) / 2;
    const rawHnrRatio = avgFloor > 0 ? peakEnergy / avgFloor : 10;
    const hnrDb = Math.round(10 * Math.log10(Math.max(1, rawHnrRatio)) * 10) / 10;

    return {
      f1: Math.round(f1PeakBin * hzPerBin),
      f2: Math.round(f2PeakBin * hzPerBin),
      brightness,
      hnr: Math.max(8.0, Math.min(28.0, hnrDb))
    };
  }

  /**
   * Generates a complete timbre fingerprint from raw audio samples
   */
  public fingerprintAudio(samples: Float32Array, sampleRate = 16000): TimbreFingerprint {
    const f0 = this.extractPitchF0(samples, sampleRate);
    const spec = this.analyzeSpectrum(samples, sampleRate);

    let label = 'Balanced Midrange';
    if (f0 < 135) label = 'Deep Baritone';
    else if (f0 > 190 && spec.brightness > 0.28) label = 'Crisp Bright';
    else if (spec.hnr > 20) label = 'Smooth Resonant';

    return {
      pitchMedianHz: f0,
      formantF1Hz: spec.f1,
      formantF2Hz: spec.f2,
      hnrDb: spec.hnr,
      spectralBrightness: spec.brightness,
      timbreLabel: label
    };
  }

  /**
   * Matches a calculated fingerprint against reference voice profiles to find the closest fit
   */
  public matchClosestVoiceProfile(fingerprint: TimbreFingerprint): {
    profile: VoiceStyleProfile;
    distance: number;
  } {
    let bestProfile = REFERENCE_VOICE_PROFILES[0];
    let minDistance = Infinity;

    for (const p of REFERENCE_VOICE_PROFILES) {
      // Normalized Euclidean distance
      const dF0 = (fingerprint.pitchMedianHz - p.targetFingerprint.pitchMedianHz) / 100;
      const dF1 = (fingerprint.formantF1Hz - p.targetFingerprint.formantF1Hz) / 300;
      const dF2 = (fingerprint.formantF2Hz - p.targetFingerprint.formantF2Hz) / 600;
      const dHnr = (fingerprint.hnrDb - p.targetFingerprint.hnrDb) / 10;
      const dBright = (fingerprint.spectralBrightness - p.targetFingerprint.spectralBrightness) / 0.2;

      const dist = Math.sqrt(dF0 * dF0 + dF1 * dF1 + dF2 * dF2 + dHnr * dHnr + dBright * dBright);
      if (dist < minDistance) {
        minDistance = dist;
        bestProfile = p;
      }
    }

    return {
      profile: bestProfile,
      distance: Math.round(minDistance * 100) / 100
    };
  }
}
