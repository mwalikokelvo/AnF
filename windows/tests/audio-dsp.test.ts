import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  AudioDspEngine,
  EQ_BAND_DEFINITIONS,
  EQ_PRESETS,
  clampGain,
  ensurePreservesPitch,
  computeBiquadCoefficients,
  computeMagnitudeResponse,
  compute5BandEqResponse,
  type EqPresetName,
} from '../src/workspace/audio-dsp.js';

describe('Audio DSP Engine & 5-Band Equalizer', () => {
  describe('Filter Parameter Validation & Gain Clamping', () => {
    test('clampGain restricts gain within -12 dB to +12 dB range', () => {
      assert.equal(clampGain(0), 0);
      assert.equal(clampGain(6), 6);
      assert.equal(clampGain(-12), -12);
      assert.equal(clampGain(12), 12);
      assert.equal(clampGain(18), 12);
      assert.equal(clampGain(-25), -12);
      assert.equal(clampGain(NaN), 0);
      assert.equal(clampGain(Infinity), 12);
    });

    test('ensurePreservesPitch sets preservesPitch on media elements', () => {
      const mockAudio = {
        playbackRate: 1.0,
        preservesPitch: false,
      } as unknown as HTMLMediaElement;

      ensurePreservesPitch(mockAudio, true);
      assert.equal(mockAudio.preservesPitch, true);

      // Verify vendor prefixes
      const mockVendorAudio = {
        playbackRate: 1.5,
        mozPreservesPitch: false,
        webkitPreservesPitch: false,
      } as unknown as HTMLMediaElement;

      ensurePreservesPitch(mockVendorAudio, true);
      assert.equal((mockVendorAudio as any).mozPreservesPitch, true);
      assert.equal((mockVendorAudio as any).webkitPreservesPitch, true);
    });
  });

  describe('EQ Presets Configuration', () => {
    test('Flat preset specifies zero dB across all 5 bands', () => {
      const flat = EQ_PRESETS['Flat'];
      assert.ok(flat);
      assert.deepEqual(flat.gains, [0, 0, 0, 0, 0]);
    });

    test('Bass Boost preset enhances sub-bass and bass bands', () => {
      const bassBoost = EQ_PRESETS['Bass Boost'];
      assert.ok(bassBoost);
      assert.equal(bassBoost.gains[0], 6); // 60 Hz Sub-Bass
      assert.equal(bassBoost.gains[1], 4); // 250 Hz Bass
      assert.ok(bassBoost.gains[0] > bassBoost.gains[2]);
    });

    test('Vocal Clarity preset attenuates low-rumble and boosts speech clarity bands', () => {
      const vocal = EQ_PRESETS['Vocal Clarity'];
      assert.ok(vocal);
      assert.ok(vocal.gains[0] < 0, 'Sub-bass must be attenuated');
      assert.ok(vocal.gains[2] > 0, 'Mid (1 kHz) must be boosted');
      assert.ok(vocal.gains[3] > 0, 'Upper-Mid (4 kHz) must be boosted');
    });

    test('Podcast / Audiobook Voice Clarifier eliminates sub-rumble and enhances speech presence', () => {
      const podcast = EQ_PRESETS['Podcast / Audiobook Voice Clarifier'];
      assert.ok(podcast);
      // Sub-Bass (60 Hz) rolled off by -6 dB to cut mic thumps and room rumble
      assert.equal(podcast.gains[0], -6);
      // Bass (250 Hz) trimmed by -2 dB to reduce proximity boominess
      assert.equal(podcast.gains[1], -2);
      // Mid (1 kHz) boosted by +3 dB for vowel articulation
      assert.equal(podcast.gains[2], 3);
      // Upper-Mid (4 kHz) boosted by +4 dB for consonant presence
      assert.equal(podcast.gains[3], 4);
      // Treble (12 kHz) attenuated by -2 dB to eliminate harsh mic hiss
      assert.equal(podcast.gains[4], -2);
    });

    test('All presets match the 5 EQ band definitions', () => {
      for (const [name, preset] of Object.entries(EQ_PRESETS)) {
        assert.equal(preset.gains.length, 5, `Preset ${name} must have 5 band gains`);
        assert.equal(preset.name, name);
        for (const g of preset.gains) {
          assert.ok(g >= -12 && g <= 12, `Gain ${g} out of range in ${name}`);
        }
      }
      assert.equal(EQ_BAND_DEFINITIONS.length, 5);
      assert.equal(EQ_BAND_DEFINITIONS[0].frequency, 60);
      assert.equal(EQ_BAND_DEFINITIONS[1].frequency, 250);
      assert.equal(EQ_BAND_DEFINITIONS[2].frequency, 1000);
      assert.equal(EQ_BAND_DEFINITIONS[3].frequency, 4000);
      assert.equal(EQ_BAND_DEFINITIONS[4].frequency, 12000);
    });
  });

  describe('Pure DSP Filter Math & Frequency Response', () => {
    const sampleRate = 48000;

    test('0 dB gain returns 0 dB magnitude response across all frequencies', () => {
      const coeffs = computeBiquadCoefficients('peaking', 1000, sampleRate, 0, 1.0);
      const dbAtF0 = computeMagnitudeResponse(coeffs, 1000, sampleRate);
      const dbAtLow = computeMagnitudeResponse(coeffs, 100, sampleRate);
      const dbAtHigh = computeMagnitudeResponse(coeffs, 10000, sampleRate);

      assert.ok(Math.abs(dbAtF0) < 0.001, `Expected ~0 dB, got ${dbAtF0}`);
      assert.ok(Math.abs(dbAtLow) < 0.001, `Expected ~0 dB, got ${dbAtLow}`);
      assert.ok(Math.abs(dbAtHigh) < 0.001, `Expected ~0 dB, got ${dbAtHigh}`);
    });

    test('Peaking filter computes exact gain at target center frequency', () => {
      const targetGainDb = 4.0;
      const centerFreq = 1000;
      const coeffs = computeBiquadCoefficients('peaking', centerFreq, sampleRate, targetGainDb, 1.0);

      const responseAtF0 = computeMagnitudeResponse(coeffs, centerFreq, sampleRate);
      // Response at center frequency should match the specified target gain
      assert.ok(
        Math.abs(responseAtF0 - targetGainDb) < 0.05,
        `Expected ${targetGainDb} dB at ${centerFreq} Hz, got ${responseAtF0.toFixed(3)} dB`
      );

      // Frequencies far from center should have significantly lower gain
      const responseAtLow = computeMagnitudeResponse(coeffs, 100, sampleRate);
      assert.ok(responseAtLow < targetGainDb / 2, `Expected attenuation far from center, got ${responseAtLow}`);
    });

    test('Low-shelf filter boosts low frequencies and transitions smoothly to 0 dB at high frequencies', () => {
      const shelfGainDb = 6.0;
      const cornerFreq = 60;
      const coeffs = computeBiquadCoefficients('lowshelf', cornerFreq, sampleRate, shelfGainDb);

      const dbSubBass = computeMagnitudeResponse(coeffs, 30, sampleRate);
      const dbHigh = computeMagnitudeResponse(coeffs, 5000, sampleRate);

      assert.ok(dbSubBass > 4.5, `Sub-bass at 30 Hz should be boosted (~6 dB), got ${dbSubBass.toFixed(2)} dB`);
      assert.ok(Math.abs(dbHigh) < 0.2, `High frequencies should be unaffected (~0 dB), got ${dbHigh.toFixed(2)} dB`);
    });

    test('High-shelf filter attenuates high frequencies while preserving bass', () => {
      const shelfGainDb = -4.0;
      const cornerFreq = 12000;
      const coeffs = computeBiquadCoefficients('highshelf', cornerFreq, sampleRate, shelfGainDb);

      const dbTreble = computeMagnitudeResponse(coeffs, 16000, sampleRate);
      const dbBass = computeMagnitudeResponse(coeffs, 200, sampleRate);

      assert.ok(dbTreble < -2.5, `Treble at 16 kHz should be attenuated (~-4 dB), got ${dbTreble.toFixed(2)} dB`);
      assert.ok(Math.abs(dbBass) < 0.1, `Bass at 200 Hz should be unaffected, got ${dbBass.toFixed(2)} dB`);
    });

    test('compute5BandEqResponse validates combined Podcast Clarifier curve', () => {
      const podcastGains = EQ_PRESETS['Podcast / Audiobook Voice Clarifier'].gains;

      // 40 Hz sub-bass rumble should be attenuated
      const responseRumble = compute5BandEqResponse(podcastGains, 40, sampleRate);
      assert.ok(responseRumble < -3.0, `Expected rumble reduction (< -3 dB), got ${responseRumble.toFixed(2)} dB`);

      // 3 kHz speech articulation range should be boosted
      const responseSpeech = compute5BandEqResponse(podcastGains, 3000, sampleRate);
      assert.ok(responseSpeech > 2.0, `Expected speech boost (> +2 dB), got ${responseSpeech.toFixed(2)} dB`);
    });
  });

  describe('AudioDspEngine State Management & Lifecycle', () => {
    test('initializes with default flat preset and enabled state', () => {
      const engine = new AudioDspEngine();
      assert.equal(engine.isEnabled(), true);
      assert.equal(engine.getCurrentPreset(), 'Flat');
      assert.deepEqual(engine.getBandGains(), [0, 0, 0, 0, 0]);
    });

    test('applyPreset updates gains and current preset name', () => {
      const engine = new AudioDspEngine();
      engine.applyPreset('Bass Boost');
      assert.equal(engine.getCurrentPreset(), 'Bass Boost');
      assert.deepEqual(engine.getBandGains(), [6, 4, 0, -1, 1]);

      engine.applyPreset('Podcast / Audiobook Voice Clarifier');
      assert.equal(engine.getCurrentPreset(), 'Podcast / Audiobook Voice Clarifier');
      assert.deepEqual(engine.getBandGains(), [-6, -2, 3, 4, -2]);
    });

    test('setBandGain modifies individual band and marks preset as Custom if modified', () => {
      const engine = new AudioDspEngine();
      engine.applyPreset('Flat');
      engine.setBandGain(0, 5.5);

      const gains = engine.getBandGains();
      assert.equal(gains[0], 5.5);
      assert.equal(engine.getCurrentPreset(), 'Custom');
    });

    test('reset restores Flat preset with zero gains', () => {
      const engine = new AudioDspEngine();
      engine.applyPreset('Vocal Clarity');
      assert.notDeepEqual(engine.getBandGains(), [0, 0, 0, 0, 0]);

      engine.reset();
      assert.equal(engine.getCurrentPreset(), 'Flat');
      assert.deepEqual(engine.getBandGains(), [0, 0, 0, 0, 0]);
    });

    test('setEnabled controls bypass state and triggers subscribers', () => {
      const engine = new AudioDspEngine();
      let notified = false;
      const unsubscribe = engine.subscribe(() => {
        notified = true;
      });

      engine.setEnabled(false);
      assert.equal(engine.isEnabled(), false);
      assert.equal(notified, true);

      notified = false;
      engine.setEnabled(true);
      assert.equal(engine.isEnabled(), true);
      assert.equal(notified, true);

      unsubscribe();
      notified = false;
      engine.setEnabled(false);
      assert.equal(notified, false, 'Unsubscribed listener should not receive notification');
    });

    test('attachAudioElement safely configures audio element without crashing in Node', () => {
      const engine = new AudioDspEngine();
      const mockAudio = {
        playbackRate: 1.25,
        preservesPitch: false,
        crossOrigin: '',
        addEventListener: () => {},
      } as unknown as HTMLMediaElement;

      const attached = engine.attachAudioElement(mockAudio);
      assert.equal(attached, true);
      assert.equal(mockAudio.preservesPitch, true);
      assert.equal(mockAudio.crossOrigin, 'anonymous');
    });
  });
});
