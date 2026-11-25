/**
 * Dialogue-Aware Narration Engine for AnF Reader
 * 
 * Segments chapter prose from character dialogue to drive expressive,
 * multi-speaker audiobook playback and TTS cadence modulation.
 * Ported from ThingsBook / inspired by debpalash/voicestudio.
 */

export interface NarrationSegment {
  type: 'prose' | 'dialogue';
  speaker: 'narrator' | 'character';
  text: string;
  pitchMultiplier: number;
  rateMultiplier: number;
}

export interface DialogueRatioStats {
  proseWords: number;
  dialogueWords: number;
  ratio: number;
}

export const DialogueNarratorCore = {
  segmentPassage(text: string): NarrationSegment[] {
    if (!text || typeof text !== 'string') return [];
    const segments: NarrationSegment[] = [];
    const quoteRegex = /([“"«][^”"»]+?[”"»])/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = quoteRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const prose = text.slice(lastIndex, match.index).trim();
        if (prose) {
          segments.push({
            type: 'prose',
            speaker: 'narrator',
            text: prose,
            pitchMultiplier: 1.0,
            rateMultiplier: 1.0,
          });
        }
      }

      const dialogue = match[1].slice(1, -1).trim();
      if (dialogue) {
        segments.push({
          type: 'dialogue',
          speaker: 'character',
          text: dialogue,
          pitchMultiplier: 1.08,
          rateMultiplier: 0.96,
        });
      }

      lastIndex = quoteRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      const remaining = text.slice(lastIndex).trim();
      if (remaining) {
        segments.push({
          type: 'prose',
          speaker: 'narrator',
          text: remaining,
          pitchMultiplier: 1.0,
          rateMultiplier: 1.0,
        });
      }
    }

    return segments;
  },

  dialogueRatio(segments: NarrationSegment[]): DialogueRatioStats {
    if (!segments || segments.length === 0) return { proseWords: 0, dialogueWords: 0, ratio: 0 };
    let proseWords = 0;
    let dialogueWords = 0;

    for (const seg of segments) {
      const words = seg.text.split(/\s+/).filter(Boolean).length;
      if (seg.type === 'dialogue') dialogueWords += words;
      else proseWords += words;
    }

    const total = proseWords + dialogueWords;
    const ratio = total > 0 ? (dialogueWords / total) : 0;
    return { proseWords, dialogueWords, ratio: Number(ratio.toFixed(2)) };
  }
};
