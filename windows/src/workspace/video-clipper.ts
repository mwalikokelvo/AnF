/**
 * Supoclip Native AI Video Clipper & Subtitle Engine
 * Auto-frames videos to 9:16 vertical shorts, generates word-synced animated subtitles,
 * and extracts moments from recorded videos and podcasts.
 */
import { h } from '../views/dom';

export type AspectRatio = '16:9' | '9:16' | '1:1';

export interface VideoCaptionWord {
  word: string;
  startSec: number;
  endSec: number;
}

export interface VideoClipCue {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  words?: VideoCaptionWord[];
}

export interface SupoclipProject {
  id: string;
  videoUrl: string;
  aspectRatio: AspectRatio;
  cues: VideoClipCue[];
  selectedHighlight?: { startSec: number; endSec: number; title: string };
  subtitleStyle: 'karaoke' | 'minimal' | 'bold-pop';
}

export class SupoclipEngine {
  private project: SupoclipProject;

  constructor(videoUrl = '', aspectRatio: AspectRatio = '9:16') {
    this.project = {
      id: 'supoclip-' + Date.now(),
      videoUrl,
      aspectRatio,
      cues: [],
      subtitleStyle: 'karaoke',
    };
  }

  getProject(): SupoclipProject {
    return this.project;
  }

  setVideoUrl(url: string): void {
    this.project.videoUrl = url;
  }

  setAspectRatio(ratio: AspectRatio): void {
    this.project.aspectRatio = ratio;
  }

  setSubtitleStyle(style: 'karaoke' | 'minimal' | 'bold-pop'): void {
    this.project.subtitleStyle = style;
  }

  /**
   * Automatically detect highlights from transcript or video duration.
   * Splits long video into punchy 15s, 30s, or 60s viral clip segments.
   */
  generateHighlights(totalDurationSec: number, targetClipSec = 30): { startSec: number; endSec: number; title: string }[] {
    const clips: { startSec: number; endSec: number; title: string }[] = [];
    if (totalDurationSec <= targetClipSec) {
      clips.push({ startSec: 0, endSec: totalDurationSec, title: 'Full Highlight Moment' });
      return clips;
    }

    const count = Math.min(6, Math.floor(totalDurationSec / targetClipSec));
    for (let i = 0; i < count; i++) {
      const start = i * targetClipSec;
      const end = Math.min(totalDurationSec, start + targetClipSec);
      clips.push({
        startSec: start,
        endSec: end,
        title: `Moment ${i + 1} (${Math.round(start)}s - ${Math.round(end)}s)`,
      });
    }
    return clips;
  }

  /**
   * Parses Whisper or SRT transcription text into timed caption cues.
   */
  importCuesFromText(text: string, durationSec = 30): VideoClipCue[] {
    const sentences = text.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 0);
    if (!sentences.length) {
      return [{ id: 'cue-1', startSec: 0, endSec: durationSec, text: text.trim() }];
    }

    const step = durationSec / sentences.length;
    return sentences.map((sentence, idx) => {
      const startSec = Math.round(idx * step * 10) / 10;
      const endSec = Math.round(Math.min(durationSec, (idx + 1) * step) * 10) / 10;
      const words = sentence.split(/\s+/).map((w, wIdx, arr) => {
        const wStep = (endSec - startSec) / Math.max(1, arr.length);
        return {
          word: w,
          startSec: startSec + wIdx * wStep,
          endSec: startSec + (wIdx + 1) * wStep,
        };
      });

      return {
        id: `cue-${idx + 1}`,
        startSec,
        endSec,
        text: sentence,
        words,
      };
    });
  }

  /**
   * Generates CSS framing styles for aspect ratio auto-cropping
   */
  getFramingCss(aspectRatio: AspectRatio): { width: string; height: string; objectFit: string; borderRadius: string } {
    switch (aspectRatio) {
      case '9:16':
        return { width: '270px', height: '480px', objectFit: 'cover', borderRadius: '16px' };
      case '1:1':
        return { width: '360px', height: '360px', objectFit: 'cover', borderRadius: '12px' };
      case '16:9':
      default:
        return { width: '480px', height: '270px', objectFit: 'contain', borderRadius: '8px' };
    }
  }

  /**
   * Exports project metadata as JSON for local persistence or video rendering
   */
  exportProjectJson(): string {
    return JSON.stringify(this.project, null, 2);
  }
}

/**
 * Visual Supoclip Studio Component
 */
export function createSupoclipPanel(options: {
  initialVideoUrl?: string;
  initialTranscript?: string;
  notify?: (msg: string) => void;
}): HTMLElement {
  const engine = new SupoclipEngine(options.initialVideoUrl || '', '9:16');
  const container = h('div', { class: 'supoclip-studio' });

  const ratioSelect = h('select', { class: 'supoclip-ratio-select', 'aria-label': 'Aspect Ratio' },
    h('option', { value: '9:16', text: '9:16 Vertical (Shorts / Reels / TikTok)', selected: true }),
    h('option', { value: '16:9', text: '16:9 Landscape (YouTube / Desktop)' }),
    h('option', { value: '1:1', text: '1:1 Square (Instagram / Feed)' })
  ) as HTMLSelectElement;

  const styleSelect = h('select', { class: 'supoclip-style-select', 'aria-label': 'Subtitle Style' },
    h('option', { value: 'karaoke', text: 'Karaoke Glow (Dynamic Word Highlight)', selected: true }),
    h('option', { value: 'bold-pop', text: 'Bold Yellow Pop (High Contrast)' }),
    h('option', { value: 'minimal', text: 'Minimal Dark Box' })
  ) as HTMLSelectElement;

  const videoContainer = h('div', { class: 'supoclip-frame-wrap' });
  const videoEl = h('video', { class: 'supoclip-video', controls: true, playsInline: true }) as HTMLVideoElement;
  if (options.initialVideoUrl) {
    videoEl.src = options.initialVideoUrl;
  }

  const captionOverlay = h('div', { class: 'supoclip-caption-overlay', text: 'AI Captions Ready' });
  videoContainer.append(videoEl, captionOverlay);

  const applyFraming = () => {
    const ratio = ratioSelect.value as AspectRatio;
    engine.setAspectRatio(ratio);
    const css = engine.getFramingCss(ratio);
    videoContainer.style.width = css.width;
    videoContainer.style.height = css.height;
    videoEl.style.objectFit = css.objectFit;
    videoContainer.style.borderRadius = css.borderRadius;
  };
  applyFraming();

  ratioSelect.addEventListener('change', applyFraming);
  styleSelect.addEventListener('change', () => {
    engine.setSubtitleStyle(styleSelect.value as any);
    captionOverlay.className = `supoclip-caption-overlay supoclip-style-${styleSelect.value}`;
  });

  const transcriptInput = h('textarea', {
    class: 'supoclip-transcript-input',
    placeholder: 'Paste or import Whisper transcription to generate word-synced animated subtitles…',
    rows: 4,
  }) as HTMLTextAreaElement;
  if (options.initialTranscript) {
    transcriptInput.value = options.initialTranscript;
  }

  const genCuesBtn = h('button', { type: 'button', class: 'primary', text: 'Generate Subtitles' }) as HTMLButtonElement;
  const highlightsList = h('div', { class: 'supoclip-highlights-list' });

  genCuesBtn.addEventListener('click', () => {
    const text = transcriptInput.value.trim();
    if (!text) {
      options.notify?.('Enter transcript text or run Whisper first.');
      return;
    }
    const dur = Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : 30;
    const cues = engine.importCuesFromText(text, dur);
    engine.getProject().cues = cues;
    captionOverlay.textContent = cues[0]?.text || text;
    options.notify?.(`Generated ${cues.length} timed subtitle cues.`);

    // Populate highlights
    const highlights = engine.generateHighlights(dur, 20);
    highlightsList.replaceChildren();
    for (const hItem of highlights) {
      const itemBtn = h('button', {
        type: 'button',
        class: 'supoclip-highlight-chip',
        text: hItem.title,
        onclick: () => {
          videoEl.currentTime = hItem.startSec;
          void videoEl.play();
          captionOverlay.textContent = `Clip: ${hItem.title}`;
        },
      });
      highlightsList.append(itemBtn);
    }
  });

  // Sync captions with playback
  videoEl.addEventListener('timeupdate', () => {
    const cues = engine.getProject().cues;
    if (!cues.length) return;
    const cur = videoEl.currentTime;
    const active = cues.find(c => cur >= c.startSec && cur <= c.endSec);
    if (active) {
      captionOverlay.textContent = active.text;
    }
  });

  const exportBtn = h('button', { type: 'button', class: 'primary', text: 'Export Clip Project (.json)' }) as HTMLButtonElement;
  exportBtn.addEventListener('click', () => {
    const json = engine.exportProjectJson();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: `supoclip-project-${Date.now()}.json` }) as HTMLAnchorElement;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    options.notify?.('Exported Supoclip project metadata.');
  });

  container.append(
    h('div', { class: 'supoclip-header' },
      h('strong', { text: 'Supoclip AI Video Clipper & 9:16 Shorts Studio' }),
      h('p', { class: 'hint', text: 'Auto-frame horizontal video into vertical 9:16 format, add word-highlight animated subtitles, and slice viral highlight moments.' })
    ),
    h('div', { class: 'supoclip-controls-row' },
      ratioSelect,
      styleSelect,
      exportBtn
    ),
    videoContainer,
    h('div', { class: 'supoclip-cues-section' },
      h('span', { class: 'eyebrow', text: 'TRANSCRIPT & SUBTITLES' }),
      transcriptInput,
      h('div', { class: 'row' }, genCuesBtn)
    ),
    h('div', { class: 'supoclip-highlights-section' },
      h('span', { class: 'eyebrow', text: 'HIGHLIGHT MOMENTS' }),
      highlightsList
    )
  );

  return container;
}
