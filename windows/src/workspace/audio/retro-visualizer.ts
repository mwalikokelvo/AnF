/**
 * Retro Tactical Audio Visualizer for AnF Audio Studio & Music Hub
 * 
 * Generates low-overhead CRT phosphor, oscilloscope, and audio FFT visualizer
 * frames with scanline and glow effects.
 * Inspired by bilawalsidhu/gods-eye-view shaders.
 */

export type VisualizerTheme = 'amber-crt' | 'green-phosphor' | 'cyber-cyan' | 'monochrome';

export interface VisualizerColorPalette {
  background: string;
  grid: string;
  waveform: string;
  glow: string;
  scanline: string;
}

export const VISUALIZER_THEMES: Record<VisualizerTheme, VisualizerColorPalette> = {
  'amber-crt': {
    background: '#120b00',
    grid: '#3a2000',
    waveform: '#ffb000',
    glow: 'rgba(255, 176, 0, 0.35)',
    scanline: 'rgba(0, 0, 0, 0.25)',
  },
  'green-phosphor': {
    background: '#021102',
    grid: '#063006',
    waveform: '#33ff33',
    glow: 'rgba(51, 255, 51, 0.35)',
    scanline: 'rgba(0, 0, 0, 0.28)',
  },
  'cyber-cyan': {
    background: '#020b14',
    grid: '#08233a',
    waveform: '#00e5ff',
    glow: 'rgba(0, 229, 255, 0.35)',
    scanline: 'rgba(0, 0, 0, 0.22)',
  },
  'monochrome': {
    background: '#0a0a0a',
    grid: '#222222',
    waveform: '#e0e0e0',
    glow: 'rgba(240, 240, 240, 0.25)',
    scanline: 'rgba(0, 0, 0, 0.25)',
  },
};

/** Render an oscilloscope waveform frame with tactical scanlines and phosphor glow. */
export function renderOscilloscope(
  ctx: CanvasRenderingContext2D,
  samples: Float32Array,
  width: number,
  height: number,
  theme: VisualizerTheme = 'green-phosphor'
): void {
  const palette = VISUALIZER_THEMES[theme] || VISUALIZER_THEMES['green-phosphor'];

  // 1. CRT Background
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  // 2. Tactical Grid
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  const gridSize = 32;
  ctx.beginPath();
  for (let x = 0; x < width; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = 0; y < height; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  // 3. Waveform with Phosphor Glow
  if (samples && samples.length > 0) {
    ctx.save();
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = palette.waveform;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const sliceWidth = width / samples.length;
    let x = 0;
    const midY = height / 2;

    for (let i = 0; i < samples.length; i++) {
      const v = samples[i];
      const y = midY + v * (height * 0.45);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();
    ctx.restore();
  }

  // 4. CRT Horizontal Scanlines Overlay
  ctx.fillStyle = palette.scanline;
  for (let y = 0; y < height; y += 4) {
    ctx.fillRect(0, y, width, 1.5);
  }
}
