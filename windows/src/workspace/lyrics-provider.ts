import { gatedFetch } from './online-lookups';
// Online synced lyrics from LRCLIB's public API (https://lrclib.net/docs), behind the opt-in
// "Online lookups" switch. AnF's own code: no third-party lyrics client is copied or translated here.
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

/**
 * Removes upload and release labels from a track title so a lyrics search finds the song:
 * bracketed groups such as "(Official Video)" or "[Remastered 2009]", featured-artist credits,
 * a trailing " - Live" style label, and anything after " | ". Falls back to the original title.
 */
export function cleanTitle(title: string): string {
  const original = title.trim();
  let out = '';
  for (let i = 0; i < original.length; i++) {
    const close = BRACKETS[original[i]];
    const end = close ? original.indexOf(close, i + 1) : -1;
    if (end < 0) { out += original[i]; continue; }
    const inner = original.slice(i + 1, end).trim();
    if (inner === '' || isLabel(inner)) i = end;
    else out += original[i];
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
      const data: RemoteLyrics = await res.json();
      if (data.syncedLyrics?.trim()) return data.syncedLyrics.trim();
      if (data.plainLyrics?.trim()) return data.plainLyrics.trim();
    }
  } catch {
    // Network error or offline
    return undefined;
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
      const list: RemoteLyrics[] = await res.json();
      if (Array.isArray(list) && list.length) {
        const synced = list.filter(item => Boolean(item.syncedLyrics?.trim()));
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
        if (list[0].plainLyrics?.trim()) {
          if (duration && duration > 0) {
            const toleranceMatches = list.filter(item => !item.duration || Math.abs(item.duration - duration) <= 5);
            if (toleranceMatches.length) return toleranceMatches[0].plainLyrics?.trim();
          }
          return list[0].plainLyrics.trim();
        }
      }
    }
  } catch {
    // Network unavailable or offline
  }

  return undefined;
}
