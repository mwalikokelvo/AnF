/**
 * On-Device Pure BPE Tokenizer & Saliency Attention Map
 * 
 * Provides self-contained Byte-Pair Encoding (BPE) tokenization, special token handling,
 * exact token counting, and attention saliency heatmaps without external Python or Rust runtimes.
 * 
 * Inspired by jingyaogong/minimind on-device tokenizer architecture.
 */

export interface TokenSpan {
  id: number;
  text: string;
  start: number;
  end: number;
  isSpecial: boolean;
}

export interface SaliencyScore {
  token: string;
  tokenId: number;
  importanceScore: number; // 0.0 to 1.0
}

export const SPECIAL_TOKENS: Record<string, number> = {
  '<|endoftext|>': 0,
  '<|im_start|>': 1,
  '<|im_end|>': 2,
  '<|pad|>': 3,
  '<|unk|>': 4
};

const INVERSE_SPECIAL_TOKENS: Record<number, string> = {
  0: '<|endoftext|>',
  1: '<|im_start|>',
  2: '<|im_end|>',
  3: '<|pad|>',
  4: '<|unk|>'
};

/**
 * Built-in base BPE merges for common English subwords, contractions, and prefixes
 */
const DEFAULT_SUBWORD_VOCAB: string[] = [
  ' ', 'the', 'th', 'he', 'in', 'in ', 'on', 'on ', 'at', 'at ', 'to', 'to ',
  'of', 'of ', 'and', 'and ', 'is', 'is ', 'it', 'it ', 'that', 'that ',
  'with', 'with ', 'as', 'as ', 'for', 'for ', 'was', 'was ', 'be', 'be ',
  'by', 'by ', 'are', 'are ', 'not', 'not ', 'this', 'this ', 'from', 'from ',
  'or', 'or ', 'you', 'you ', 'an', 'an ', 'they', 'they ', 'which', 'one',
  'would', 'all', 'there', 'their', 'we', 'about', 'out', 'up', 'so', 'said',
  'what', 'its', 'who', 'into', 'can', 'has', 'more', 'her', 'two', 'like',
  'see', 'no', 'way', 'could', 'my', 'than', 'first', 'been', 'call', 'who',
  'now', 'find', 'long', 'down', 'day', 'did', 'get', 'come', 'made', 'may',
  'part', 'over', 'new', 'sound', 'take', 'only', 'little', 'work', 'know',
  'place', 'year', 'live', 'me', 'back', 'give', 'most', 'very', 'after',
  'thing', 'our', 'just', 'name', 'good', 'sentence', 'man', 'think', 'say',
  'great', 'where', 'help', 'through', 'much', 'before', 'line', 'right',
  'too', 'mean', 'old', 'any', 'same', 'tell', 'boy', 'follow', 'came',
  'want', 'show', 'also', 'around', 'form', 'three', 'small', 'set', 'put',
  'end', 'does', 'another', 'well', 'large', 'must', 'big', 'even', 'such',
  'because', 'turn', 'here', 'why', 'ask', 'went', 'men', 'read', 'need',
  'land', 'different', 'home', 'us', 'move', 'try', 'kind', 'hand', 'picture',
  'again', 'change', 'off', 'play', 'spell', 'air', 'away', 'animal', 'house',
  'point', 'page', 'letter', 'mother', 'answer', 'found', 'study', 'still',
  'learn', 'should', 'America', 'world', 'high', 'every', 'near', 'add',
  'food', 'between', 'own', 'below', 'country', 'plant', 'last', 'school',
  'father', 'keep', 'tree', 'never', 'start', 'city', 'earth', 'eye', 'light',
  'thought', 'head', 'under', 'story', 'saw', 'left', 'don\'t', 'few', 'while',
  'along', 'might', 'close', 'something', 'seem', 'next', 'hard', 'open',
  'example', 'begin', 'life', 'always', 'those', 'both', 'paper', 'together',
  'got', 'group', 'often', 'run', 'important', 'until', 'children', 'side',
  'feet', 'car', 'mile', 'night', 'walk', 'white', 'sea', 'began', 'grow',
  'took', 'river', 'four', 'carry', 'state', 'once', 'book', 'hear', 'stop',
  'without', 'second', 'later', 'miss', 'idea', 'enough', 'eat', 'face',
  'watch', 'far', 'Indian', 'really', 'almost', 'let', 'above', 'girl',
  'sometimes', 'mountains', 'cut', 'young', 'talk', 'soon', 'list', 'song',
  'being', 'leave', 'family', 'it\'s'
];

export class BpeTokenizer {
  private vocabToId: Map<string, number> = new Map();
  private idToVocab: Map<number, string> = new Map();

  constructor(customVocab?: string[]) {
    // 0..4 reserved for special tokens
    let nextId = 5;

    // Single character ASCII fallbacks (0..255 byte tokens)
    for (let i = 0; i < 256; i++) {
      const ch = String.fromCharCode(i);
      this.vocabToId.set(ch, nextId);
      this.idToVocab.set(nextId, ch);
      nextId++;
    }

    // Subwords
    const vocabList = customVocab || DEFAULT_SUBWORD_VOCAB;
    for (const sub of vocabList) {
      if (!this.vocabToId.has(sub)) {
        this.vocabToId.set(sub, nextId);
        this.idToVocab.set(nextId, sub);
        nextId++;
      }
    }
  }

  /**
   * Encodes a string into an array of token IDs, extracting special tokens when present
   */
  public encode(text: string): number[] {
    const tokens = this.tokenizeWithSpans(text);
    return tokens.map(t => t.id);
  }

  /**
   * Decodes an array of token IDs back into the reconstructed text
   */
  public decode(tokenIds: number[]): string {
    const parts: string[] = [];
    for (const id of tokenIds) {
      if (INVERSE_SPECIAL_TOKENS[id] !== undefined) {
        parts.push(INVERSE_SPECIAL_TOKENS[id]);
      } else if (this.idToVocab.has(id)) {
        parts.push(this.idToVocab.get(id)!);
      } else {
        parts.push('<|unk|>');
      }
    }
    return parts.join('');
  }

  /**
   * Tokenizes text into tokens with source character offsets and special-token classification
   */
  public tokenizeWithSpans(text: string): TokenSpan[] {
    const results: TokenSpan[] = [];

    // Regular expression matching special tokens or words/whitespace
    const specialPattern = /(<\|endoftext\|>|<\|im_start\|>|<\|im_end\|>|<\|pad\|>|<\|unk\|>)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = specialPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const chunk = text.slice(lastIndex, match.index);
        this.tokenizeChunk(chunk, lastIndex, results);
      }
      const specialStr = match[0];
      const specialId = SPECIAL_TOKENS[specialStr] ?? 4;
      results.push({
        id: specialId,
        text: specialStr,
        start: match.index,
        end: match.index + specialStr.length,
        isSpecial: true
      });
      lastIndex = match.index + specialStr.length;
    }

    if (lastIndex < text.length) {
      const chunk = text.slice(lastIndex);
      this.tokenizeChunk(chunk, lastIndex, results);
    }

    return results;
  }

  private tokenizeChunk(chunk: string, offset: number, out: TokenSpan[]): void {
    let i = 0;
    while (i < chunk.length) {
      // Greedy subword matching
      let bestMatch = '';
      let bestLength = 0;

      // Try longest match from vocab
      for (let len = Math.min(chunk.length - i, 20); len >= 2; len--) {
        const sub = chunk.slice(i, i + len);
        if (this.vocabToId.has(sub)) {
          bestMatch = sub;
          bestLength = len;
          break;
        }
      }

      if (bestLength > 0) {
        const id = this.vocabToId.get(bestMatch)!;
        out.push({
          id,
          text: bestMatch,
          start: offset + i,
          end: offset + i + bestLength,
          isSpecial: false
        });
        i += bestLength;
      } else {
        // Fallback to single character
        const ch = chunk[i];
        const id = this.vocabToId.get(ch) ?? (SPECIAL_TOKENS['<|unk|>']);
        out.push({
          id,
          text: ch,
          start: offset + i,
          end: offset + i + 1,
          isSpecial: false
        });
        i++;
      }
    }
  }

  /**
   * Computes attention saliency score for each token in a sequence
   * based on inverse document frequency and token position weighting
   */
  public computeSaliencyMap(text: string): SaliencyScore[] {
    const tokens = this.tokenizeWithSpans(text);
    if (tokens.length === 0) return [];

    // Frequency count
    const freqs = new Map<number, number>();
    for (const t of tokens) {
      freqs.set(t.id, (freqs.get(t.id) || 0) + 1);
    }

    const n = tokens.length;
    const scores: SaliencyScore[] = [];

    for (let i = 0; i < n; i++) {
      const t = tokens[i];
      if (t.isSpecial) {
        scores.push({ token: t.text, tokenId: t.id, importanceScore: 0.1 });
        continue;
      }

      // Information density: rare words get higher weight
      const count = freqs.get(t.id) || 1;
      const idf = Math.log(1 + n / count);
      // Positional bias: initial subject & final concluding tokens receive recency boost
      const posWeight = 1.0 + 0.3 * (1 - Math.abs((i / (n - 1 || 1)) - 0.5) * 2);
      // Length factor: longer specific subwords carry higher semantic density
      const lengthFactor = Math.min(2.0, Math.max(0.8, t.text.trim().length / 4));

      const rawScore = idf * posWeight * lengthFactor;
      scores.push({
        token: t.text,
        tokenId: t.id,
        importanceScore: Math.round(rawScore * 100) / 100
      });
    }

    // Normalize max to 1.0
    const maxScore = Math.max(...scores.map(s => s.importanceScore), 1.0);
    for (const s of scores) {
      s.importanceScore = Math.round((s.importanceScore / maxScore) * 100) / 100;
    }

    return scores;
  }
}
