/** Classify local audio for the Music Hub. Not a streaming catalogue. */
export type MediaKind = 'music' | 'audiobook' | 'podcast';

export const AUDIOBOOK_MIN_SECONDS = 30 * 60;

export function kindFromFile(name: string, durationSeconds?: number): MediaKind {
  const lower = name.toLowerCase();
  if (/\.m4b$/.test(lower) || /audiobook/i.test(lower)) return 'audiobook';
  if (typeof durationSeconds === 'number' && durationSeconds >= AUDIOBOOK_MIN_SECONDS) return 'audiobook';
  return 'music';
}

export function kindLabel(kind: MediaKind): string {
  if (kind === 'audiobook') return 'Audiobook';
  if (kind === 'podcast') return 'Podcast';
  return 'Music';
}
