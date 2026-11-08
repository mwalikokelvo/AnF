/**
 * 5-Band Graphic Equalizer & Audio DSP Engine
 * Connected via Web Audio API to HTML5 MediaElement with safe CORS fallback,
 * pitch correction preservation across variable speeds (0.75x to 2.0x),
 * and audio engineering presets.
 */

export interface EqBandDefinition {
  id: string;
  name: string;
  frequency: number;
  type: BiquadFilterType;
  defaultGain: number;
  q?: number;
  label: string;
}

export const EQ_BAND_DEFINITIONS: readonly EqBandDefinition[] = [
  { id: 'sub-bass', name: 'Sub-Bass', frequency: 60, type: 'lowshelf', defaultGain: 0, label: '60 Hz' },
  { id: 'bass', name: 'Bass', frequency: 250, type: 'peaking', defaultGain: 0, q: 1.0, label: '250 Hz' },
  { id: 'mid', name: 'Mid', frequency: 1000, type: 'peaking', defaultGain: 0, q: 1.0, label: '1 kHz' },
  { id: 'upper-mid', name: 'Upper-Mid', frequency: 4000, type: 'peaking', defaultGain: 0, q: 1.0, label: '4 kHz' },
  { id: 'treble', name: 'Treble', frequency: 12000, type: 'highshelf', defaultGain: 0, label: '12 kHz' },
] as const;

export type EqPresetName =
  | 'Flat'
  | 'Bass Boost'
  | 'Vocal Clarity'
  | 'Acoustic'
  | 'Podcast / Audiobook Voice Clarifier';

export interface EqPreset {
  name: EqPresetName;
  description: string;
  gains: [number, number, number, number, number];
}

export const EQ_PRESETS: Record<EqPresetName, EqPreset> = {
  'Flat': {
    name: 'Flat',
    description: 'Neutral frequency response with zero coloration',
    gains: [0, 0, 0, 0, 0],
  },
  'Bass Boost': {
    name: 'Bass Boost',
    description: 'Deep sub-bass and punchy low-end enhancement for EDM, Hip-Hop, and Pop',
    gains: [6, 4, 0, -1, 1],
  },
  'Vocal Clarity': {
    name: 'Vocal Clarity',
    description: 'Attenuates low rumble and boosts 1-4 kHz presence for singing vocals',
    gains: [-3, -1, 3, 5, 2],
  },
  'Acoustic': {
    name: 'Acoustic',
    description: 'Balanced low-end with warm upper-mids and shimmering acoustic guitar treble',
    gains: [2, 1, -1, 2, 3],
  },
  'Podcast / Audiobook Voice Clarifier': {
    name: 'Podcast / Audiobook Voice Clarifier',
    description: 'Filters out desk rumble, cuts proximity boom, and enhances speech presence',
    gains: [-6, -2, 3, 4, -2],
  },
};

export const EQ_MIN_GAIN_DB = -12;
export const EQ_MAX_GAIN_DB = 12;

export function clampGain(gain: number): number {
  if (typeof gain !== 'number' || Number.isNaN(gain)) return 0;
  return Math.min(EQ_MAX_GAIN_DB, Math.max(EQ_MIN_GAIN_DB, gain));
}

/**
 * Configure HTMLMediaElement pitch preservation across playback speed changes (0.75x to 2.0x).
 * Ensures audiobook & podcast speech sounds natural without chipmunk/demon pitch distortion.
 */
export function ensurePreservesPitch(audio: HTMLMediaElement, preserves = true): void {
  if (!audio) return;
  if ('preservesPitch' in audio) {
    audio.preservesPitch = preserves;
  }
  if ('mozPreservesPitch' in audio) {
    (audio as any).mozPreservesPitch = preserves;
  }
  if ('webkitPreservesPitch' in audio) {
    (audio as any).webkitPreservesPitch = preserves;
  }
}

export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a0: number;
  a1: number;
  a2: number;
}

/**
 * Pure DSP mathematical computation of Biquad Filter Coefficients based on
 * Robert Bristow-Johnson Audio EQ Cookbook. Used for filter emulation, testing, and UI response curves.
 */
export function computeBiquadCoefficients(
  type: BiquadFilterType,
  frequency: number,
  sampleRate: number,
  gainDb: number,
  q = 1.0
): BiquadCoefficients {
  const fs = Math.max(8000, sampleRate);
  const f0 = Math.min(Math.max(10, frequency), fs / 2 - 10);
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * f0) / fs;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);

  if (type === 'peaking') {
    const alpha = sinW0 / (2 * Math.max(0.01, q));
    const b0 = 1 + alpha * A;
    const b1 = -2 * cosW0;
    const b2 = 1 - alpha * A;
    const a0 = 1 + alpha / A;
    const a1 = -2 * cosW0;
    const a2 = 1 - alpha / A;
    return { b0, b1, b2, a0, a1, a2 };
  }

  if (type === 'lowshelf') {
    const alpha = (sinW0 / 2) * Math.SQRT2;
    const sqrtA = Math.sqrt(A);
    const b0 = A * (A + 1 - (A - 1) * cosW0 + 2 * sqrtA * alpha);
    const b1 = 2 * A * (A - 1 - (A + 1) * cosW0);
    const b2 = A * (A + 1 - (A - 1) * cosW0 - 2 * sqrtA * alpha);
    const a0 = A + 1 + (A - 1) * cosW0 + 2 * sqrtA * alpha;
    const a1 = -2 * (A - 1 + (A + 1) * cosW0);
    const a2 = A + 1 + (A - 1) * cosW0 - 2 * sqrtA * alpha;
    return { b0, b1, b2, a0, a1, a2 };
  }

  if (type === 'highshelf') {
    const alpha = (sinW0 / 2) * Math.SQRT2;
    const sqrtA = Math.sqrt(A);
    const b0 = A * (A + 1 + (A - 1) * cosW0 + 2 * sqrtA * alpha);
    const b1 = -2 * A * (A - 1 + (A + 1) * cosW0);
    const b2 = A * (A + 1 + (A - 1) * cosW0 - 2 * sqrtA * alpha);
    const a0 = A + 1 - (A - 1) * cosW0 + 2 * sqrtA * alpha;
    const a1 = 2 * (A - 1 - (A + 1) * cosW0);
    const a2 = A + 1 - (A - 1) * cosW0 - 2 * sqrtA * alpha;
    return { b0, b1, b2, a0, a1, a2 };
  }

  // Fallback flat pass-through
  return { b0: 1, b1: 0, b2: 0, a0: 1, a1: 0, a2: 0 };
}

/**
 * Compute filter magnitude response in dB at a given frequency.
 */
export function computeMagnitudeResponse(
  coeffs: BiquadCoefficients,
  frequency: number,
  sampleRate: number
): number {
  const fs = Math.max(8000, sampleRate);
  const f = Math.min(Math.max(1, frequency), fs / 2 - 1);
  const w = (2 * Math.PI * f) / fs;
  const cos1 = Math.cos(w);
  const sin1 = Math.sin(w);
  const cos2 = Math.cos(2 * w);
  const sin2 = Math.sin(2 * w);

  const numRe = coeffs.b0 + coeffs.b1 * cos1 + coeffs.b2 * cos2;
  const numIm = -coeffs.b1 * sin1 - coeffs.b2 * sin2;

  const denRe = coeffs.a0 + coeffs.a1 * cos1 + coeffs.a2 * cos2;
  const denIm = -coeffs.a1 * sin1 - coeffs.a2 * sin2;

  const numMagSq = numRe * numRe + numIm * numIm;
  const denMagSq = denRe * denRe + denIm * denIm;

  if (denMagSq === 0) return 0;
  const mag = Math.sqrt(numMagSq / denMagSq);
  if (mag <= 0.0000001) return -100;
  return 20 * Math.log10(mag);
}

/**
 * Compute the combined magnitude response across all 5 EQ bands in cascade at a given frequency.
 */
export function compute5BandEqResponse(
  gains: number[],
  testFrequency: number,
  sampleRate = 44100
): number {
  let totalDb = 0;
  for (let i = 0; i < EQ_BAND_DEFINITIONS.length; i++) {
    const band = EQ_BAND_DEFINITIONS[i];
    const gain = clampGain(gains[i] ?? 0);
    if (Math.abs(gain) < 0.05) continue;
    const coeffs = computeBiquadCoefficients(band.type, band.frequency, sampleRate, gain, band.q ?? 1.0);
    const db = computeMagnitudeResponse(coeffs, testFrequency, sampleRate);
    totalDb += db;
  }
  return totalDb;
}

export interface DspState {
  enabled: boolean;
  preset: EqPresetName | 'Custom';
  gains: [number, number, number, number, number];
  normalizeVolume?: boolean;
}

const STORAGE_KEY = 'anf-dsp-eq-state';

/**
 * 5-Band Graphic Equalizer Engine
 * Connects to HTML5 <audio> using Web Audio API AudioContext & BiquadFilterNodes.
 */
export class AudioDspEngine {
  private ctx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private compressorNode: DynamicsCompressorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private attachedElement: HTMLMediaElement | null = null;
  private gains: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  private activePreset: EqPresetName | 'Custom' = 'Flat';
  private enabled = true;
  private normalizeVolume = false;
  private corsFallback = false;
  private listeners: Array<() => void> = [];

  constructor() {
    this.hydrate();
  }

  private hydrate(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const state: Partial<DspState> = JSON.parse(raw);
        if (typeof state.enabled === 'boolean') this.enabled = state.enabled;
        if (typeof state.normalizeVolume === 'boolean') this.normalizeVolume = state.normalizeVolume;
        if (state.preset && (state.preset in EQ_PRESETS || state.preset === 'Custom')) {
          this.activePreset = state.preset as EqPresetName | 'Custom';
        }
        if (Array.isArray(state.gains) && state.gains.length === 5) {
          this.gains = [
            clampGain(state.gains[0]),
            clampGain(state.gains[1]),
            clampGain(state.gains[2]),
            clampGain(state.gains[3]),
            clampGain(state.gains[4]),
          ];
        }
      }
    } catch {
      // Storage unavailable or parsing error
    }
  }

  private persist(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const state: DspState = {
        enabled: this.enabled,
        preset: this.activePreset,
        gains: [...this.gains],
        normalizeVolume: this.normalizeVolume,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Quota or storage failure
    }
  }

  /** Subscribe to EQ state updates (gains, presets, bypass) */
  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Safe dispatch
      }
    }
  }

  /**
   * Safely connect HTML5 `<audio>` element to Web Audio graph with CORS error containment.
   * If CORS restrictions or already-connected errors occur, falls back safely to direct output.
   */
  attachAudioElement(audio: HTMLMediaElement): boolean {
    if (!audio) return false;
    if (this.attachedElement === audio && this.sourceNode) {
      return true;
    }
    this.attachedElement = audio;
    ensurePreservesPitch(audio, true);

    // Audio elements playing streamed media must declare anonymous CORS for Web Audio analysis
    if (!audio.crossOrigin) {
      audio.crossOrigin = 'anonymous';
    }

    if (typeof window === 'undefined') {
      return true;
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      return false;
    }

    if (!this.ctx) {
      try {
        this.ctx = new AudioContextClass();
      } catch {
        return false;
      }
    }

    // Attempt Web Audio node chaining
    try {
      if (!this.sourceNode) {
        this.sourceNode = this.ctx.createMediaElementSource(audio);
        this.buildFilterChain();
      }

      // Auto-resume AudioContext on playback start (handles browser autoplay gesture policy)
      audio.addEventListener('play', () => {
        if (this.ctx && this.ctx.state === 'suspended') {
          void this.ctx.resume();
        }
      });
      return true;
    } catch (err) {
      // Safe CORS fallback: audio plays through direct native media pipeline
      this.corsFallback = true;
      return false;
    }
  }

  private buildFilterChain(): void {
    if (!this.ctx || !this.sourceNode) return;

    // Create 5 BiquadFilterNodes
    this.filters = EQ_BAND_DEFINITIONS.map(def => {
      const filter = this.ctx!.createBiquadFilter();
      filter.type = def.type;
      filter.frequency.setValueAtTime(def.frequency, this.ctx!.currentTime);
      if (typeof def.q === 'number') {
        filter.Q.setValueAtTime(def.q, this.ctx!.currentTime);
      }
      return filter;
    });

    // Create DynamicsCompressorNode for Spotify-style Volume Normalization
    try {
      this.compressorNode = this.ctx.createDynamicsCompressor();
      this.compressorNode.threshold.setValueAtTime(-24, this.ctx.currentTime);
      this.compressorNode.knee.setValueAtTime(30, this.ctx.currentTime);
      this.compressorNode.ratio.setValueAtTime(12, this.ctx.currentTime);
      this.compressorNode.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressorNode.release.setValueAtTime(0.25, this.ctx.currentTime);
    } catch {
      this.compressorNode = null;
    }

    try {
      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 64;
      this.analyserNode.smoothingTimeConstant = 0.8;
    } catch {
      this.analyserNode = null;
    }

    this.connectFilterChain();

    // Synchronize initial filter gains
    this.applyGainsToGraph();
  }

  private connectFilterChain(): void {
    if (!this.ctx || !this.sourceNode || this.filters.length !== 5) return;
    try {
      this.sourceNode.disconnect();
      for (const filter of this.filters) filter.disconnect();
      if (this.compressorNode) this.compressorNode.disconnect();
      if (this.analyserNode) this.analyserNode.disconnect();
    } catch {
      // Safe disconnect if nodes were not connected
    }

    // Connect audio graph: source -> band0 -> band1 -> band2 -> band3 -> band4 -> (compressor) -> (analyser) -> destination
    let current: AudioNode = this.sourceNode;
    for (const filter of this.filters) {
      current.connect(filter);
      current = filter;
    }

    if (this.normalizeVolume && this.compressorNode) {
      current.connect(this.compressorNode);
      current = this.compressorNode;
    }

    if (this.analyserNode) {
      current.connect(this.analyserNode);
      this.analyserNode.connect(this.ctx.destination);
    } else {
      current.connect(this.ctx.destination);
    }
  }

  private applyGainsToGraph(): void {
    if (!this.ctx || this.filters.length !== 5) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const targetGain = this.enabled ? this.gains[i] : 0;
      const param = this.filters[i].gain;
      // Smooth linear ramp over 20ms to eliminate clicks/pops
      try {
        param.cancelScheduledValues(now);
        param.setValueAtTime(param.value, now);
        param.linearRampToValueAtTime(targetGain, now + 0.02);
      } catch {
        param.value = targetGain;
      }
    }
  }

  setBandGain(index: number, gainDb: number): void {
    if (index < 0 || index >= 5) return;
    const clamped = clampGain(gainDb);
    this.gains[index] = clamped;
    this.activePreset = this.detectMatchingPreset();
    this.applyGainsToGraph();
    this.persist();
    this.notify();
  }

  getBandGains(): [number, number, number, number, number] {
    return [...this.gains];
  }

  applyPreset(presetName: EqPresetName): void {
    const preset = EQ_PRESETS[presetName];
    if (!preset) return;
    this.gains = [...preset.gains];
    this.activePreset = presetName;
    this.applyGainsToGraph();
    this.persist();
    this.notify();
  }

  getCurrentPreset(): EqPresetName | 'Custom' {
    return this.activePreset;
  }

  private detectMatchingPreset(): EqPresetName | 'Custom' {
    for (const [name, preset] of Object.entries(EQ_PRESETS) as [EqPresetName, EqPreset][]) {
      const matches = preset.gains.every((g, idx) => Math.abs(g - this.gains[idx]) < 0.1);
      if (matches) return name;
    }
    return 'Custom';
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.applyGainsToGraph();
    this.persist();
    this.notify();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setVolumeNormalization(enabled: boolean): void {
    if (this.normalizeVolume === enabled) return;
    this.normalizeVolume = enabled;
    this.connectFilterChain();
    this.persist();
    this.notify();
  }

  isVolumeNormalizationEnabled(): boolean {
    return this.normalizeVolume;
  }

  isCorsFallbackActive(): boolean {
    return this.corsFallback;
  }

  getFrequencyData(): Uint8Array | null {
    if (!this.analyserNode) return null;
    try {
      const data = new Uint8Array(this.analyserNode.frequencyBinCount);
      this.analyserNode.getByteFrequencyData(data);
      return data;
    } catch {
      return null;
    }
  }

  reset(): void {
    this.applyPreset('Flat');
  }

  getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  getAttachedElement(): HTMLMediaElement | null {
    return this.attachedElement;
  }

  dispose(): void {
    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        void this.ctx.close();
      } catch {}
    }
    this.ctx = null;
    this.sourceNode = null;
    this.filters = [];
    this.compressorNode = null;
    this.attachedElement = null;
    this.listeners = [];
  }
}

export const audioDsp = new AudioDspEngine();

/**
 * Creates the DOM UI controller for the 5-band Graphic Equalizer.
 */
export function createEqDialog(dsp: AudioDspEngine = audioDsp): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.className = 'music-dialog music-eq-dialog';
  dialog.setAttribute('aria-label', '5-Band Graphic Equalizer');

  const header = document.createElement('div');
  header.className = 'music-eq-header';
  const title = document.createElement('h3');
  title.textContent = '5-Band Graphic Equalizer';
  const subtitle = document.createElement('p');
  subtitle.className = 'music-muted';
  subtitle.textContent = 'Hardware-grade Web Audio signal processing with voice clarification.';
  header.append(title, subtitle);

  // Preset Selector
  const presetRow = document.createElement('div');
  presetRow.className = 'music-eq-presets';
  presetRow.setAttribute('role', 'group');
  presetRow.setAttribute('aria-label', 'EQ Presets');

  const presetButtons: HTMLButtonElement[] = [];
  const presetNames: EqPresetName[] = [
    'Flat',
    'Bass Boost',
    'Vocal Clarity',
    'Acoustic',
    'Podcast / Audiobook Voice Clarifier',
  ];

  for (const name of presetNames) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'music-chip';
    btn.textContent = name === 'Podcast / Audiobook Voice Clarifier' ? 'Podcast Clarifier' : name;
    btn.title = EQ_PRESETS[name].description;
    btn.onclick = () => {
      dsp.applyPreset(name);
      renderState();
    };
    presetRow.append(btn);
    presetButtons.push(btn);
  }

  // 5 Sliders Container
  const slidersBox = document.createElement('div');
  slidersBox.className = 'music-eq-sliders';

  const sliderInputs: HTMLInputElement[] = [];
  const gainLabels: HTMLElement[] = [];

  for (let i = 0; i < EQ_BAND_DEFINITIONS.length; i++) {
    const band = EQ_BAND_DEFINITIONS[i];
    const col = document.createElement('div');
    col.className = 'music-eq-col';

    const gainValue = document.createElement('span');
    gainValue.className = 'music-eq-val';
    gainLabels.push(gainValue);

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'music-eq-slider';
    input.min = String(EQ_MIN_GAIN_DB);
    input.max = String(EQ_MAX_GAIN_DB);
    input.step = '0.5';
    input.setAttribute('aria-label', `${band.name} (${band.label})`);
    input.oninput = () => {
      dsp.setBandGain(i, parseFloat(input.value));
      renderState();
    };
    sliderInputs.push(input);

    const nameLabel = document.createElement('span');
    nameLabel.className = 'music-eq-band-label';
    nameLabel.textContent = band.name;

    const freqLabel = document.createElement('span');
    freqLabel.className = 'music-eq-freq-label';
    freqLabel.textContent = band.label;

    col.append(gainValue, input, nameLabel, freqLabel);
    slidersBox.append(col);
  }

  // Controls footer (Enable / Bypass, Volume Normalization, Reset, Close)
  const footer = document.createElement('div');
  footer.className = 'music-eq-footer';

  const bypassBtn = document.createElement('button');
  bypassBtn.type = 'button';
  bypassBtn.className = 'music-eq-toggle';
  bypassBtn.onclick = () => {
    dsp.setEnabled(!dsp.isEnabled());
    renderState();
  };

  const normBtn = document.createElement('button');
  normBtn.type = 'button';
  normBtn.className = 'music-eq-toggle';
  normBtn.onclick = () => {
    dsp.setVolumeNormalization(!dsp.isVolumeNormalizationEnabled());
    renderState();
  };

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.textContent = 'Reset (Flat)';
  resetBtn.onclick = () => {
    dsp.reset();
    renderState();
  };

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Close';
  closeBtn.onclick = () => {
    dialog.close();
    dialog.remove();
  };

  footer.append(bypassBtn, normBtn, resetBtn, closeBtn);

  function renderState(): void {
    const enabled = dsp.isEnabled();
    const gains = dsp.getBandGains();
    const currentPreset = dsp.getCurrentPreset();
    const norm = dsp.isVolumeNormalizationEnabled();

    bypassBtn.textContent = enabled ? 'EQ: Active' : 'EQ: Bypassed';
    bypassBtn.classList.toggle('active', enabled);
    slidersBox.classList.toggle('bypassed', !enabled);

    normBtn.textContent = norm ? 'Volume Normalization: On' : 'Volume Normalization: Off';
    normBtn.classList.toggle('active', norm);
    normBtn.title = 'Spotify-style loudness normalization (dynamics leveling across tracks)';

    for (let i = 0; i < presetButtons.length; i++) {
      const name = presetNames[i];
      presetButtons[i].classList.toggle('active', currentPreset === name);
    }

    for (let i = 0; i < 5; i++) {
      const g = gains[i];
      sliderInputs[i].value = String(g);
      gainLabels[i].textContent = (g > 0 ? '+' : '') + g.toFixed(1) + ' dB';
    }
  }

  const unsubscribe = dsp.subscribe(renderState);
  dialog.addEventListener('close', () => {
    unsubscribe();
    dialog.remove();
  });

  renderState();
  dialog.append(header, presetRow, slidersBox, footer);
  return dialog;
}
