import { gatedFetch } from './online-lookups';
import { activeLine, parseLyrics } from './lyrics';
// Online synced lyrics from LRCLIB's public API (https://lrclib.net/docs), behind the opt-in
// "Online lookups" switch. AnF's own code: no third-party lyrics client is copied or translated here.
// LRC parsing and active-line selection reuse `lyrics.ts` so imported .lrc files and LRCLIB text
// agree on offsets, malformed stamps, and minute boundaries.
export type RemoteLyrics = {
  id?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string;
  syncedLyrics?: string;
};

export interface LyricLine {
  time: number;
  text: string;
}

export interface ParsedLyrics {
  lines: LyricLine[];
  offsetMs: number;
  syncType: 'LINE_SYNCED' | 'WORD_SYNCED' | 'UNSYNCED';
}

export interface LyricsProvider {
  fetchLyrics(track: { title: string; artist: string; duration: number }): Promise<ParsedLyrics | null>;
  cleanTitle(title: string): string;
  primaryArtist(artist: string): string;
  getCachedLyrics(trackId: string): Promise<ParsedLyrics | null>;
}

const LRCLIB_CLIENT_HEADER = {
  'Lrclib-Client': 'AnF-Desktop/0.1.46 (https://github.com/mwalikokelvo/AnF)',
};

// Words that describe a release or an upload rather than the song. A bracketed group, or a
// trailing " - …" part, is dropped only when it is made of these words (and years or numbers),
// so real titles such as "(Don't Fear) The Reaper" or "Live and Let Die" stay intact.
const RELEASE_WORDS = new Set([
  'official', 'video', 'music', 'audio', 'lyric', 'lyrics', 'visualizer', 'visualiser', 'mv', 'clip',
  'hd', 'hq', '4k', 'uhd', 'remaster', 'remastered', 'remix', 'mix', 'live', 'acoustic', 'unplugged',
  'version', 'edit', 'extended', 'radio', 'single', 'album', 'clean', 'explicit', 'mono', 'stereo',
  'demo', 'instrumental', 'bonus', 'track', 'deluxe', 'original', 'new', 'full',
]);
// Small words allowed inside a label ("Live in HD") but never a label on their own.
const FILLER = new Set(['the', 'a', 'an', 'and', 'in', 'at', 'of', 'with']);
// Credits that name other artists; everything after them is not part of the title.
const CREDIT = /^(?:feat|ft|featuring|with)\b\.?/i;
const BRACKETS: Record<string, string> = { '(': ')', '[': ']', '【': '】', '{': '}' };

/** True when a group says how a song was released or uploaded, not what it is called. */
function describesRelease(text: string): boolean {
  const list = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w && !/^\d+$/.test(w));
  return list.some(w => RELEASE_WORDS.has(w)) && list.every(w => RELEASE_WORDS.has(w) || FILLER.has(w));
}
/** A credit, a release label, or a performance note such as "Live at Wembley / 1986". */
const isLabel = (text: string) => CREDIT.test(text) || describesRelease(text) || /^(?:live|recorded)\s+(?:at|in|from|on)\b/i.test(text);

const MAX_CLEAN_LENGTH = 300;

/** Index of the bracket closing the one at `start`, skipping nested pairs; -1 when unbalanced. */
function matchingClose(text: string, start: number, close: string): number {
  const open = text[start];
  let depth = 0;
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && depth-- === 0) return i;
  }
  return -1;
}

/** One left-to-right pass that drops empty or label-only bracketed groups. */
function stripLabelGroups(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const close = BRACKETS[text[i]];
    const end = close ? matchingClose(text, i, close) : -1;
    if (end < 0) { out += text[i]; continue; }
    const inner = text.slice(i + 1, end).trim();
    if (inner === '' || isLabel(inner)) i = end;
    else out += text[i];
  }
  return out;
}

/**
 * Removes upload and release labels from a track title so a lyrics search finds the song:
 * bracketed groups such as "(Official Video)" or "[Remastered 2009]", featured-artist credits,
 * a trailing " - Live" style label, and anything after " | ". Falls back to the original title.
 */
export function cleanTitle(title: string): string {
  const original = title.trim();
  // No real song title is this long; scanning it would be quadratic on hostile input.
  if (original.length > MAX_CLEAN_LENGTH) return original;
  let out = original;
  // Repeat so nested groups such as "((Official Video))" collapse; each pass shortens or ends the loop.
  for (let pass = 0; pass < 4; pass++) {
    const next = stripLabelGroups(out);
    if (next === out) break;
    out = next;
  }
  let cleaned = out.split(/\s+\|\s*/)[0];
  const credit = cleaned.search(/\s(?:feat\.?|ft\.|featuring)\s/i);
  if (credit > 0) cleaned = cleaned.slice(0, credit);
  for (;;) {
    const dash = cleaned.search(/\s[-–—]\s[^-–—]*$/);
    if (dash < 0 || !isLabel(cleaned.slice(dash + 3).trim())) break;
    cleaned = cleaned.slice(0, dash);
  }
  cleaned = cleaned.replace(/\s+/g, ' ').replace(/[\s\-–—]+$/, '').trim();
  return cleaned || original;
}

/** Extract primary artist from multi-artist strings preserving separator precedence. */
export function primaryArtist(artist: string): string {
  const trimmed = artist.trim();
  const parts = trimmed.split(/\s*(?:feat\.|ft\.|featuring|\bx\b|&|\band\b|\bwith\b|,|\/|;)\s*/i);
  return parts[0]?.trim() || trimmed;
}

/**
 * Fetch synchronized or plain lyrics from LRCLIB: an exact lookup first, then a search ranked by duration.
 */
export async function fetchOnlineLyrics(track: {
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
}): Promise<string | undefined> {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' && !navigator.onLine) {
    return undefined;
  }

  const title = cleanTitle(track.title);
  const artist = track.artist ? primaryArtist(track.artist) : '';
  const duration = track.duration && Number.isFinite(track.duration) ? Math.round(track.duration) : undefined;

  const getTimeoutSignal = () => {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return AbortSignal.timeout(5000);
    }
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5000);
    return controller.signal;
  };

  /** Parse JSON without throwing; returns undefined for empty, invalid, or non-JSON bodies. */
  const readJson = async (res: Response): Promise<unknown> => {
    try {
      const text = await res.text();
      if (!text.trim()) return undefined;
      return JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  };

  const lyricsFrom = (data: unknown): string | undefined => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
    const row = data as RemoteLyrics;
    const synced = typeof row.syncedLyrics === 'string' ? row.syncedLyrics.trim() : '';
    if (synced) return synced;
    const plain = typeof row.plainLyrics === 'string' ? row.plainLyrics.trim() : '';
    return plain || undefined;
  };

  // 1. Try exact match
  const params = new URLSearchParams();
  params.set('track_name', title);
  if (artist && artist !== 'Unknown artist') params.set('artist_name', artist);
  if (track.album) params.set('album_name', track.album);
  if (duration && duration > 0) params.set('duration', String(duration));

  try {
    const res = await gatedFetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: LRCLIB_CLIENT_HEADER,
      signal: getTimeoutSignal(),
    });

    if (res.status === 429 || res.status === 503) {
      const retryAfter = res.headers?.get?.('Retry-After');
      console.warn(`LRCLIB rate limited or unavailable (${res.status}). Backing off${retryAfter ? `, retry after ${retryAfter}s` : ''}.`);
      return undefined;
    }

    if (res.ok) {
      const found = lyricsFrom(await readJson(res));
      if (found) return found;
    }
  } catch {
    // Timeout, network error, or offline — still try search below when the first hop failed hard.
  }

  // 2. Fuzzy search fallback with duration tolerance matching
  try {
    const query = [title, artist !== 'Unknown artist' ? artist : ''].filter(Boolean).join(' ');
    if (!query) return undefined;

    const res = await gatedFetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, {
      headers: LRCLIB_CLIENT_HEADER,
      signal: getTimeoutSignal(),
    });

    if (res.status === 429 || res.status === 503) {
      const retryAfter = res.headers?.get?.('Retry-After');
      console.warn(`LRCLIB search rate limited or unavailable (${res.status}). Backing off${retryAfter ? `, retry after ${retryAfter}s` : ''}.`);
      return undefined;
    }

    if (res.ok) {
      const body = await readJson(res);
      const list = Array.isArray(body) ? (body as RemoteLyrics[]) : [];
      if (list.length) {
        const synced = list.filter(item => item && typeof item === 'object' && typeof item.syncedLyrics === 'string' && item.syncedLyrics.trim());
        if (synced.length) {
          if (duration && duration > 0) {
            // Prefer versions within 5 s of the track's length, then within 8 s
            const toleranceMatches = synced.filter(item => !item.duration || Math.abs(item.duration - duration) <= 5);
            const candidates = toleranceMatches.length ? toleranceMatches : synced.filter(item => !item.duration || Math.abs(item.duration - duration) <= 8);
            if (candidates.length) {
              candidates.sort((a, b) => Math.abs((a.duration || 0) - duration) - Math.abs((b.duration || 0) - duration));
              return candidates[0].syncedLyrics?.trim();
            }
          } else {
            return synced[0].syncedLyrics?.trim();
          }
        }
        const plainRows = list.filter(item => item && typeof item === 'object' && typeof item.plainLyrics === 'string' && item.plainLyrics.trim());
        if (plainRows.length) {
          if (duration && duration > 0) {
            const toleranceMatches = plainRows.filter(item => !item.duration || Math.abs(item.duration - duration) <= 5);
            if (toleranceMatches.length) return toleranceMatches[0].plainLyrics?.trim();
          }
          return plainRows[0].plainLyrics?.trim();
        }
      }
    }
  } catch {
    // Timeout, network unavailable, or offline
  }

  return undefined;
}

/** Parse LRCLIB/LRC text. Synced lines use `[mm:ss.xx]`; plain text stays unsynced. */
export function parseSyncedLyrics(source: string): ParsedLyrics {
  const parsed = parseLyrics(source);
  if (parsed.synced) {
    return {
      lines: parsed.lines.map((line) => ({ time: line.time ?? 0, text: line.text })),
      offsetMs: 0,
      syncType: 'LINE_SYNCED',
    };
  }
  return {
    lines: parsed.lines.map((line) => ({ time: 0, text: line.text })),
    offsetMs: 0,
    syncType: 'UNSYNCED',
  };
}

/** Line being sung at `playbackSeconds`, or null before the first stamp or when the text is unsynced. */
export function activeLyricLine(lyrics: ParsedLyrics, playbackSeconds: number): LyricLine | null {
  if (lyrics.syncType === 'UNSYNCED' || !Number.isFinite(playbackSeconds)) return null;
  const index = activeLine(
    { synced: true, lines: lyrics.lines.map((line) => ({ time: line.time, text: line.text })) },
    playbackSeconds,
  );
  return index >= 0 ? lyrics.lines[index] : null;
}
