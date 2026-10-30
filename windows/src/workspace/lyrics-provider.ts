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

const titleCleanupPatterns = [
  /\s*\(.*?(official|video|audio|lyrics|lyric|visualizer|hd|hq|4k|remaster|remix|live|acoustic|version|edit|extended|radio|clean|explicit).*?\)/gi,
  /\s*\[.*?(official|video|audio|lyrics|lyric|visualizer|hd|hq|4k|remaster|remix|live|acoustic|version|edit|extended|radio|clean|explicit).*?\]/gi,
  /\s*【.*?】/g,
  /\s*\|.*$/g,
  /\s*-\s*(official|video|audio|lyrics|lyric|visualizer).*$/gi,
  /\s*\(feat\..*?\)/gi,
  /\s*\(ft\..*?\)/gi,
  /\s*feat\..*$/gi,
  /\s*ft\..*$/gi,
];

const artistSeparators = [
  ' feat. ', ' feat ', ' ft. ', ' ft ', ' featuring ', ' & ', ' and ', ', ', ' x ', ' X ', ' with '
];

/** Clean promotional and format tags from track title for higher lyrics match accuracy. */
export function cleanTitle(title: string): string {
  let cleaned = title.trim();
  for (const pattern of titleCleanupPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  return cleaned.trim() || title.trim();
}

/** Extract primary artist from multi-artist strings. */
export function primaryArtist(artist: string): string {
  let res = artist.trim();
  for (const sep of artistSeparators) {
    if (res.includes(sep)) {
      res = res.split(sep)[0].trim();
      break;
    }
  }
  return res || artist.trim();
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
  const title = cleanTitle(track.title);
  const artist = track.artist ? primaryArtist(track.artist) : '';
  const duration = track.duration && Number.isFinite(track.duration) ? Math.round(track.duration) : undefined;

  // 1. Try exact match
  const params = new URLSearchParams();
  params.set('track_name', title);
  if (artist && artist !== 'Unknown artist') params.set('artist_name', artist);
  if (track.album) params.set('album_name', track.album);
  if (duration && duration > 0) params.set('duration', String(duration));

  try {
    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
    if (res.ok) {
      const data: RemoteLyrics = await res.json();
      if (data.syncedLyrics?.trim()) return data.syncedLyrics.trim();
      if (data.plainLyrics?.trim()) return data.plainLyrics.trim();
    }
  } catch {
    // Fall through to query search
  }

  // 2. Fuzzy search fallback
  try {
    const query = [title, artist !== 'Unknown artist' ? artist : ''].filter(Boolean).join(' ');
    if (!query) return undefined;

    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const list: RemoteLyrics[] = await res.json();
      if (Array.isArray(list) && list.length) {
        const synced = list.filter(item => Boolean(item.syncedLyrics?.trim()));
        if (synced.length) {
          if (duration && duration > 0) {
            synced.sort((a, b) => Math.abs((a.duration || 0) - duration) - Math.abs((b.duration || 0) - duration));
          }
          return synced[0].syncedLyrics?.trim();
        }
        if (list[0].plainLyrics?.trim()) return list[0].plainLyrics.trim();
      }
    }
  } catch {
    // Network unavailable or offline
  }

  return undefined;
}
