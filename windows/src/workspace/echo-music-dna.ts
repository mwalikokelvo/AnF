/**
 * Echo Music DNA - Track Backstory & Annotations
 * Reverse-engineered from EchoMusicApp/Echo-Music (Music DNA feature & Wikipedia.kt)
 * Queries Genius multi-search API with intelligent fallback to Wikipedia REST extracts.
 */
import { cleanTitle, primaryArtist } from './lyrics-provider';

import { gatedFetch } from './online-lookups';
export interface MusicDnaRecord {
  songTitle: string;
  artistName: string;
  albumName?: string;
  meaning: string;
  artistBio: string;
  albumNotes?: string;
  source: 'genius' | 'wikipedia' | 'cached' | 'offline';
  retrievedAt: number;
}

const DEFAULT_DNA_TIMEOUT_MS = 5000;

function getTimeoutSignal(ms = DEFAULT_DNA_TIMEOUT_MS): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export class EchoMusicDnaService {
  private cache = new Map<string, MusicDnaRecord>();
  private readonly storagePrefix = 'echo-dna:';

  constructor() {
    this.hydrateFromStorage();
  }

  private hydrateFromStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.storagePrefix)) {
          const item = JSON.parse(localStorage.getItem(key) || '{}');
          if (item && item.songTitle) {
            this.cache.set(key.replace(this.storagePrefix, ''), item);
          }
        }
      }
    } catch {
      // Storage unavailable
    }
  }

  private persist(cacheKey: string, record: MusicDnaRecord): void {
    this.cache.set(cacheKey, record);
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(`${this.storagePrefix}${cacheKey}`, JSON.stringify(record));
    } catch {
      // Quota exceeded
    }
  }

  public getCacheKey(title: string, artist?: string): string {
    const t = cleanTitle(title).toLowerCase();
    const a = (artist ? primaryArtist(artist) : '').toLowerCase();
    return `${t}::${a}`;
  }

  /**
   * Fetch Wikipedia REST summary for a given subject (song or artist)
   */
  public async fetchWikipediaSummary(subject: string): Promise<string | null> {
    try {
      const slug = encodeURIComponent(subject.trim().replace(/\s+/g, '_'));
      const res = await gatedFetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`, {
        signal: getTimeoutSignal(4000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.extract && !data.extract.includes('may refer to:')) {
          return data.extract;
        }
      }
    } catch {
      // Ignore
    }
    return null;
  }

  /**
   * Wikipedia Action API search + extract fallback (matching PlayerMenu.kt logic)
   */
  public async searchWikipediaExtract(query: string): Promise<string | null> {
    try {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        query
      )}&utf8=&format=json&origin=*`;
      const searchRes = await gatedFetch(searchUrl, { signal: getTimeoutSignal(4000) });
      if (!searchRes.ok) return null;
      const searchData = await searchRes.json();
      const hits = searchData?.query?.search;
      if (!hits || hits.length === 0) return null;

      const pageTitle = hits[0].title;
      const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exsentences=4&exlimit=1&titles=${encodeURIComponent(
        pageTitle
      )}&explaintext=1&format=json&origin=*`;
      const extractRes = await gatedFetch(extractUrl, { signal: getTimeoutSignal(4000) });
      if (!extractRes.ok) return null;
      const extractData = await extractRes.json();
      const pages = extractData?.query?.pages;
      if (!pages) return null;

      const firstKey = Object.keys(pages)[0];
      const extract = pages[firstKey]?.extract;
      if (extract && !extract.includes('may refer to')) {
        return extract;
      }
    } catch {
      // Ignore
    }
    return null;
  }

  /**
   * Genius API Search & Annotations Query
   */
  private async queryGenius(title: string, artist: string): Promise<{
    album?: string;
    meaning?: string;
    bio?: string;
  } | null> {
    try {
      const q = encodeURIComponent(`${artist} ${title}`);
      const res = await gatedFetch(`https://genius.com/api/search/multi?q=${q}`, {
        signal: getTimeoutSignal(4500),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const sections = data?.response?.sections || [];
      let songId: number | null = null;

      for (const sec of sections) {
        if (sec.type === 'top_hit' || sec.type === 'song') {
          const hits = sec.hits || [];
          if (hits.length > 0 && hits[0].result?.id) {
            songId = hits[0].result.id;
            break;
          }
        }
      }

      if (!songId) return null;

      const songRes = await gatedFetch(`https://genius.com/api/songs/${songId}?text_format=plain`, {
        signal: getTimeoutSignal(4500),
      });
      if (!songRes.ok) return null;
      const songData = await songRes.json();
      const song = songData?.response?.song;
      if (!song) return null;

      const album = song.album?.name || undefined;
      let meaning = song.description?.plain;
      if (meaning === '?' || !meaning) meaning = undefined;

      let bio: string | undefined = undefined;
      const artistId = song.primary_artist?.id;
      if (artistId) {
        try {
          const artistRes = await gatedFetch(
            `https://genius.com/api/artists/${artistId}?text_format=plain`,
            { signal: getTimeoutSignal(4000) }
          );
          if (artistRes.ok) {
            const artistData = await artistRes.json();
            const rawBio = artistData?.response?.artist?.description?.plain;
            if (rawBio && rawBio !== '?') bio = rawBio;
          }
        } catch {
          // Ignore
        }
      }

      return { album, meaning, bio };
    } catch {
      return null;
    }
  }

  /**
   * Fetch Music DNA for a track with Genius -> Wikipedia cascading fallback
   */
  public async fetchMusicDna(track: {
    title: string;
    artist?: string;
    album?: string;
  }): Promise<MusicDnaRecord> {
    const cacheKey = this.getCacheKey(track.title, track.artist);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const cleanT = cleanTitle(track.title);
    const primA = track.artist ? primaryArtist(track.artist) : '';
    const isOnline = typeof navigator === 'undefined' || !('onLine' in navigator) || navigator.onLine;

    if (!isOnline) {
      return {
        songTitle: cleanT,
        artistName: primA || 'Unknown Artist',
        albumName: track.album,
        meaning: 'Offline: Connect to network to fetch track backstory and DNA.',
        artistBio: 'Offline',
        source: 'offline',
        retrievedAt: Date.now(),
      };
    }

    let album = track.album;
    let meaning = 'Information not found.';
    let bio = 'Biography not found.';
    let source: 'genius' | 'wikipedia' = 'genius';

    // 1. Try Genius
    const geniusResult = await this.queryGenius(cleanT, primA);
    if (geniusResult) {
      if (geniusResult.album) album = geniusResult.album;
      if (geniusResult.meaning) meaning = geniusResult.meaning;
      if (geniusResult.bio) bio = geniusResult.bio;
    }

    // 2. Wikipedia Fallbacks for Song Meaning & Artist Bio
    if (meaning === 'Information not found.') {
      source = 'wikipedia';
      const wikiQuery = album ? `${cleanT} (${album} song)` : `${cleanT} (song)`;
      const wikiMeaning =
        (await this.fetchWikipediaSummary(wikiQuery)) ||
        (await this.searchWikipediaExtract(`${cleanT} ${primA} song`));
      if (wikiMeaning) meaning = wikiMeaning;
    }

    if (bio === 'Biography not found.' && primA) {
      const wikiBio =
        (await this.fetchWikipediaSummary(`${primA} (musician)`)) ||
        (await this.fetchWikipediaSummary(primA)) ||
        (await this.searchWikipediaExtract(`${primA} musician`));
      if (wikiBio) bio = wikiBio;
    }

    const record: MusicDnaRecord = {
      songTitle: cleanT,
      artistName: primA || 'Unknown Artist',
      albumName: album,
      meaning,
      artistBio: bio,
      source,
      retrievedAt: Date.now(),
    };

    this.persist(cacheKey, record);
    return record;
  }
}

export const echoDna = new EchoMusicDnaService();
