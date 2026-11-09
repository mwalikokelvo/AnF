import type { ReadingSection } from './reader-data';

export interface DocumentMatch {
  index: number;
  charOffset: number;
  length: number;
  sectionIndex: number;
  sectionLabel: string;
  snippet: string;
}

export interface DocumentSearchResult {
  query: string;
  matches: DocumentMatch[];
  matchedSectionsCount: number;
}

/**
 * Creates a clean excerpt snippet surrounding a match offset.
 */
export function createMatchSnippet(
  text: string,
  start: number,
  length: number,
  padding = 35
): string {
  const from = Math.max(0, start - padding);
  const to = Math.min(text.length, start + length + padding);
  const prefix = from > 0 ? '…' : '';
  const suffix = to < text.length ? '…' : '';
  const raw = text.slice(from, to).replace(/\s+/g, ' ');
  return `${prefix}${raw.trim()}${suffix}`;
}

/**
 * Pure search function across document text and reading sections.
 */
export function searchDocument(
  text: string,
  query: string,
  parts: ReadingSection[] = []
): DocumentSearchResult {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery || !text) {
    return { query: cleanQuery, matches: [], matchedSectionsCount: 0 };
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = cleanQuery.toLowerCase();
  const queryLen = lowerQuery.length;
  const matches: DocumentMatch[] = [];
  const matchedSections = new Set<number>();

  let pos = 0;
  let matchIndex = 0;
  while (pos < lowerText.length) {
    const found = lowerText.indexOf(lowerQuery, pos);
    if (found === -1) break;

    let secIdx = 0;
    let secLabel = 'Section 1';
    if (parts && parts.length > 0) {
      const idx = parts.findIndex((p) => p.start <= found && p.end > found);
      secIdx = idx >= 0 ? idx : parts.length - 1;
      secLabel = parts[secIdx]?.label || `Section ${secIdx + 1}`;
    }

    matchedSections.add(secIdx);
    matches.push({
      index: matchIndex++,
      charOffset: found,
      length: queryLen,
      sectionIndex: secIdx,
      sectionLabel: secLabel,
      snippet: createMatchSnippet(text, found, queryLen),
    });

    pos = found + Math.max(1, queryLen);
  }

  return {
    query: cleanQuery,
    matches,
    matchedSectionsCount: matchedSections.size,
  };
}

/**
 * State manager for step-by-step match navigation.
 */
export class DocumentSearchNavigator {
  private result: DocumentSearchResult = { query: '', matches: [], matchedSectionsCount: 0 };
  private activeIndex = -1;

  setResult(result: DocumentSearchResult): void {
    this.result = result;
    this.activeIndex = result.matches.length > 0 ? 0 : -1;
  }

  get total(): number {
    return this.result.matches.length;
  }

  get currentIndex(): number {
    return this.activeIndex;
  }

  current(): DocumentMatch | null {
    if (this.activeIndex < 0 || this.activeIndex >= this.result.matches.length) {
      return null;
    }
    return this.result.matches[this.activeIndex];
  }

  next(): DocumentMatch | null {
    if (this.result.matches.length === 0) return null;
    this.activeIndex = (this.activeIndex + 1) % this.result.matches.length;
    return this.current();
  }

  prev(): DocumentMatch | null {
    if (this.result.matches.length === 0) return null;
    this.activeIndex =
      (this.activeIndex - 1 + this.result.matches.length) % this.result.matches.length;
    return this.current();
  }

  statusText(): string {
    if (!this.result.query) return '';
    if (this.result.matches.length === 0) return 'No matches found';
    return `${this.activeIndex + 1} of ${this.result.matches.length} matches (${this.result.matchedSectionsCount} section${this.result.matchedSectionsCount === 1 ? '' : 's'})`;
  }
}
