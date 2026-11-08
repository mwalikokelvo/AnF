/**
 * Bionic Reading & Speed Reader Engine
 *
 * Implements high-focus bionic fixation formatting that guides the human eye
 * through text by emphasizing the initial characters of words, increasing
 * reading speed and comprehension.
 * Preserves HTML tags, code blocks, URLs, and Markdown tokens.
 * Follows Ponytail Lazy Senior Dev principles: pure TypeScript, zero dependencies.
 */

export interface ReadingStats {
  wordCount: number;
  charCount: number;
  standardMinutes: number;
  bionicMinutes: number;
  wpm: number;
}

/**
 * Calculates the number of characters to emphasize in a word of given length.
 */
export function getFixationLength(wordLength: number): number {
  if (wordLength <= 1) return 1;
  if (wordLength <= 3) return 1;
  if (wordLength <= 6) return 2;
  if (wordLength <= 8) return 3;
  return Math.ceil(wordLength * 0.45);
}

/**
 * Applies bionic reading bold fixation to a single word.
 */
export function bionifyWord(word: string): string {
  // Extract leading punctuation (e.g. quotes, brackets)
  const leadMatch = word.match(/^[^\p{L}\p{N}]+/u);
  const leading = leadMatch ? leadMatch[0] : '';
  const core = word.slice(leading.length);

  // Extract trailing punctuation
  const trailMatch = core.match(/[^\p{L}\p{N}]+$/u);
  const trailing = trailMatch ? trailMatch[0] : '';
  const letters = core.slice(0, core.length - trailing.length);

  if (letters.length === 0) return word;

  const fixLen = getFixationLength(letters.length);
  const boldPart = letters.slice(0, fixLen);
  const restPart = letters.slice(fixLen);

  return `${leading}<b>${boldPart}</b>${restPart}${trailing}`;
}

/**
 * Transforms plain text or Markdown into Bionic Reading HTML,
 * preserving code blocks, inline code, URLs, and HTML tags without mangling.
 */
export function formatBionicText(text: string): string {
  if (!text) return '';

  const lines = text.split('\n');
  let inCodeBlock = false;

  const bionicLines = lines.map(line => {
    // Preserve fenced code blocks
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      return line;
    }
    if (inCodeBlock) return line;

    // Preserve headings markers
    const headingMatch = line.match(/^(#{1,6}\s+)/);
    const prefix = headingMatch ? headingMatch[1] : '';
    const content = line.slice(prefix.length);

    // Split words while preserving whitespace, inline code, and URLs
    const tokens = content.split(/(\s+|`[^`]+`|<[^>]+>|https?:\/\/[^\s]+)/u);

    const bionified = tokens.map(token => {
      if (
        !token ||
        /^\s+$/.test(token) ||
        token.startsWith('`') ||
        token.startsWith('<') ||
        token.startsWith('http://') ||
        token.startsWith('https://')
      ) {
        return token;
      }
      return bionifyWord(token);
    }).join('');

    return prefix + bionified;
  });

  return bionicLines.join('\n');
}

/**
 * Computes reading metrics for a draft or article.
 */
export function computeReadingStats(text: string, wpm = 250): ReadingStats {
  const clean = text.trim();
  if (!clean) {
    return {
      wordCount: 0,
      charCount: 0,
      standardMinutes: 0,
      bionicMinutes: 0,
      wpm,
    };
  }

  const words = clean.split(/\s+/u).filter(w => w.length > 0);
  const wordCount = words.length;
  const charCount = Array.from(clean).length;

  const standardMinutes = Math.max(1, Math.round((wordCount / wpm) * 10) / 10);
  // Bionic reading empirically saves ~20-25% fixation time
  const bionicMinutes = Math.max(1, Math.round((wordCount / (wpm * 1.25)) * 10) / 10);

  return {
    wordCount,
    charCount,
    standardMinutes,
    bionicMinutes,
    wpm,
  };
}
