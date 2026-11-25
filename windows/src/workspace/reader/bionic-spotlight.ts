/**
 * Karaoke Bionic Reading Spotlight for AnF Reader & ThingsBook
 * 
 * Synchronizes audio narration playheads with real-time word-level
 * visual spotlight highlighting and bionic fixation bolding.
 * Inspired by debpalash/voicestudio + iv-org/invidious timed captions.
 */

export interface WordTimeMarker {
  word: string;
  startMs: number;
  endMs: number;
  index: number;
}

export const BionicSpotlightCore = {
  /**
   * Align words in a passage to calculated speech timestamps based on reading pace.
   */
  alignWords(text: string, wordsPerMinute = 160): WordTimeMarker[] {
    if (!text || typeof text !== 'string') return [];
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    const msPerWord = (60 * 1000) / wordsPerMinute;
    const markers: WordTimeMarker[] = [];

    let currentMs = 0;
    for (let i = 0; i < tokens.length; i++) {
      const word = tokens[i];
      // Slight pause on punctuation
      const pauseBonusMs = /[.,!?;:]$/.test(word) ? msPerWord * 0.4 : 0;
      const duration = msPerWord + pauseBonusMs;

      markers.push({
        word,
        startMs: Math.round(currentMs),
        endMs: Math.round(currentMs + duration),
        index: i,
      });

      currentMs += duration;
    }

    return markers;
  },

  /**
   * Binary search for the active word index at playhead position.
   */
  findActiveWordIndex(markers: WordTimeMarker[], playheadMs: number): number {
    if (!markers || markers.length === 0 || playheadMs < 0) return -1;
    let low = 0;
    let high = markers.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const m = markers[mid];

      if (playheadMs >= m.startMs && playheadMs <= m.endMs) {
        return mid;
      } else if (playheadMs < m.startMs) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    if (playheadMs > markers[markers.length - 1].endMs) {
      return markers.length - 1;
    }
    return 0;
  },

  /**
   * Apply bionic reading bolding to a single word (e.g. "loc" in "local").
   */
  bionicWord(word: string): string {
    if (!word) return '';
    const clean = word.replace(/^[^\w]+/, '');
    const prefixLen = word.length - clean.length;
    const prefix = word.slice(0, prefixLen);
    const bare = word.slice(prefixLen);

    const mid = bare.length <= 3 ? 1 : Math.ceil(bare.length * 0.45);
    const boldPart = bare.slice(0, mid);
    const restPart = bare.slice(mid);

    return `${prefix}<b>${boldPart}</b>${restPart}`;
  },

  /**
   * Render HTML paragraph with bionic bolding and active karaoke spotlight class.
   */
  renderKaraokeParagraph(markers: WordTimeMarker[], activeIndex: number): string {
    return markers.map(m => {
      const bionic = BionicSpotlightCore.bionicWord(m.word);
      const isSpotlight = m.index === activeIndex;
      const cls = isSpotlight ? 'class="karaoke-word active-spotlight"' : 'class="karaoke-word"';
      return `<span ${cls} data-word-idx="${m.index}">${bionic}</span>`;
    }).join(' ');
  }
};
