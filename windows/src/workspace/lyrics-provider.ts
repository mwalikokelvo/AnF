// MKR Music Synced Lyrics Provider (based on mkr-music LyricsProvider & LRCLIB)
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

const titleCleanupPatterns = [
  /\s*\(.*?(official|video|audio|lyrics|lyric|visualizer|hd|hq|4k|remaster|remix|live|acoustic|version|edit|extended|radio|clean|explicit|with).*?\)/gi,
  /\s*\[.*?(official|video|audio|lyrics|lyric|visualizer|hd|hq|4k|remaster|remix|live|acoustic|version|edit|extended|radio|clean|explicit|with).*?\]/gi,
  /\s*【.*?】/g,
  /\s*\|.*$/g,
  /\s*-\s*(official|video|audio|lyrics|lyric|visualizer|live|remaster|remix|acoustic|version|edit).*$/gi,
  /\s*\(feat\..*?\)/gi,
  /\s*\(ft\..*?\)/gi,
  /\s*feat\..*$/gi,
  /\s*ft\..*$/gi,
];

/** Clean promotional and format tags from track title for higher lyrics match accuracy. */
export function cleanTitle(title: string): string {
  let cleaned = title.trim();
  for (const pattern of titleCleanupPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  while (/\s*[-–—]\s*$/.test(cleaned)) {
    cleaned = cleaned.replace(/\s*[-–—]\s*$/, '');
  }
  return cleaned.trim() || title.trim();
}

/** Extract primary artist from multi-artist strings preserving separator precedence. */
export function primaryArtist(artist: string): string {
  const trimmed = artist.trim();
  const parts = trimmed.split(/\s*(?:feat\.|ft\.|featuring|\bx\b|&|\band\b|\bwith\b|,|\/|;)\s*/i);
  return parts[0]?.trim() || trimmed;
}

/**
 * Fetch synchronized or plain lyrics from LRCLIB using MKR Music's search strategy.
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
    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
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

    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, {
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
            // Apply MKR Music duration tolerance of ±5 seconds (or relaxed ±8s)
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
