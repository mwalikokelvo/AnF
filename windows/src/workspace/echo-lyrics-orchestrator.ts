/**
 * Echo Music Multi-Provider Lyrics Orchestration
 * Reverse-engineered from EchoMusicApp/Echo-Music (lyrics module)
 * Providers: YouLyPlus, Paxsenix, BetterLyrics, SimpMusic, LrcLib, KuGou
 */
import { cleanTitle, primaryArtist, type ParsedLyrics, type LyricLine } from './lyrics-provider';

export type LyricsProviderName =
  | 'YouLyPlus'
  | 'Paxsenix'
  | 'BetterLyrics'
  | 'SimpMusic'
  | 'LrcLib'
  | 'KuGou'
  | 'OfflineCache';

export interface LyricsQueryResult {
  lyrics: ParsedLyrics;
  provider: LyricsProviderName;
  rawLrc?: string;
  sourceUrl?: string;
}

export interface TrackLyricsQuery {
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  id?: string;
}

const DEFAULT_TIMEOUT_MS = 4500;

function getTimeoutSignal(ms = DEFAULT_TIMEOUT_MS): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export function parseLrcTimestamps(lrcText: string): ParsedLyrics {
  const lines: LyricLine[] = [];
  let offsetMs = 0;
  const rawLines = lrcText.split('\n');

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Check offset tag [offset:+/-ms]
    const offsetMatch = trimmed.match(/\[offset:\s*([+-]?\d+)\]/i);
    if (offsetMatch) {
      offsetMs = parseInt(offsetMatch[1], 10) || 0;
      continue;
    }

    // Match one or multiple timestamp markers [mm:ss.xx]
    const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
    const matches = Array.from(trimmed.matchAll(timeRegex));
    if (matches.length > 0) {
      const text = trimmed.replace(timeRegex, '').trim();
      for (const match of matches) {
        const mins = parseInt(match[1], 10);
        const secs = parseInt(match[2], 10);
        const fracStr = (match[3] || '0').padEnd(3, '0').slice(0, 3);
        const ms = parseInt(fracStr, 10);
        const timeSec = mins * 60 + secs + ms / 1000 + offsetMs / 1000;
        lines.push({ time: Math.max(0, timeSec), text });
      }
    }
  }

  lines.sort((a, b) => a.time - b.time);
  return {
    lines,
    offsetMs,
    syncType: lines.length > 0 ? 'LINE_SYNCED' : 'UNSYNCED',
  };
}

export class EchoLyricsOrchestrator {
  private cache = new Map<string, LyricsQueryResult>();
  private readonly storagePrefix = 'echo-lyrics:';

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
          if (item && item.lyrics) {
            this.cache.set(key.replace(this.storagePrefix, ''), item);
          }
        }
      }
    } catch {
      // Storage unavailable
    }
  }

  private persist(cacheKey: string, result: LyricsQueryResult): void {
    this.cache.set(cacheKey, result);
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(`${this.storagePrefix}${cacheKey}`, JSON.stringify(result));
    } catch {
      // Quota exceeded
    }
  }

  public getCacheKey(track: TrackLyricsQuery): string {
    const t = cleanTitle(track.title).toLowerCase();
    const a = (track.artist ? primaryArtist(track.artist) : '').toLowerCase();
    return `${t}::${a}`;
  }

  // Provider 1: LrcLib (lrclib.net)
  private async queryLrcLib(title: string, artist: string, duration?: number): Promise<string | null> {
    const params = new URLSearchParams({ track_name: title });
    if (artist) params.set('artist_name', artist);
    if (duration && duration > 0) params.set('duration', String(Math.round(duration)));

    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: { 'Lrclib-Client': 'EchoMusic-AnF/1.4.4 (https://github.com/EchoMusicApp/Echo-Music)' },
      signal: getTimeoutSignal(4000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.syncedLyrics || json.plainLyrics || null;
  }

  // Provider 2: YouLyPlus / LyricsPlus Mirrors
  private async queryYouLyPlus(title: string, artist: string, duration?: number): Promise<string | null> {
    const mirrors = [
      'https://lyricsplus.prjktla.my.id',
      'https://lyricsplus.atomix.one',
      'https://lyricsplus.binimum.org',
      'https://lyricsplus-seven.vercel.app',
    ];
    for (const mirror of mirrors) {
      try {
        const params = new URLSearchParams({ title, artist });
        if (duration) params.set('duration', String(Math.round(duration)));
        const res = await fetch(`${mirror}/v2/lyrics/get?${params.toString()}`, {
          signal: getTimeoutSignal(3500),
        });
        if (res.ok) {
          const data = await res.json();
          if (data && (data.synced || data.lyrics || data.plain)) {
            return data.synced || data.lyrics || data.plain;
          }
        }
      } catch {
        // Try next mirror
      }
    }
    return null;
  }

  // Provider 3: BetterLyrics (lyrics-api.boidu.dev)
  private async queryBetterLyrics(title: string, artist: string, duration?: number): Promise<string | null> {
    try {
      const params = new URLSearchParams({ s: title, a: artist });
      if (duration) params.set('d', String(Math.round(duration)));
      const res = await fetch(`https://lyrics-api.boidu.dev/getLyrics?${params.toString()}`, {
        signal: getTimeoutSignal(3500),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.ttml) {
          // Parse TTML <p begin="00:00.00" end="...">text</p> into LRC
          return this.ttmlToLrc(data.ttml);
        }
      }
    } catch {
      // Ignore
    }
    return null;
  }

  private ttmlToLrc(ttml: string): string {
    const pRegex = /<p[^>]*begin="([^"]+)"[^>]*>([\s\S]*?)<\/p>/gi;
    const lrcLines: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = pRegex.exec(ttml)) !== null) {
      const begin = match[1];
      const text = match[2].replace(/<[^>]+>/g, '').trim();
      // Format begin time mm:ss.xx
      lrcLines.push(`[${begin}] ${text}`);
    }
    return lrcLines.join('\n');
  }

  // Provider 4: KuGou (mobileservice.kugou.com)
  private async queryKuGou(title: string, artist: string, _duration?: number): Promise<string | null> {
    try {
      const q = `${title} - ${artist}`;
      const searchRes = await fetch(
        `https://mobileservice.kugou.com/api/v3/search/song?version=9108&plat=0&pagesize=5&keyword=${encodeURIComponent(q)}`,
        { signal: getTimeoutSignal(3500) }
      );
      if (!searchRes.ok) return null;
      const searchData = await searchRes.json();
      const songs = searchData?.data?.info;
      if (!songs || songs.length === 0) return null;

      // Select candidate matching duration
      const song = songs[0];
      const hash = song.hash;
      const lyricRes = await fetch(
        `https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&hash=${hash}`,
        { signal: getTimeoutSignal(3500) }
      );
      if (!lyricRes.ok) return null;
      const lyricData = await lyricRes.json();
      const candidate = lyricData?.candidates?.[0];
      if (!candidate) return null;

      const dlRes = await fetch(
        `https://lyrics.kugou.com/download?ver=1&client=pc&id=${candidate.id}&accesskey=${candidate.accesskey}&fmt=lrc&charset=utf8`,
        { signal: getTimeoutSignal(3500) }
      );
      if (!dlRes.ok) return null;
      const dlData = await dlRes.json();
      if (dlData?.content) {
        // Base64 decode
        if (typeof atob === 'function') {
          return atob(dlData.content);
        } else if (typeof (globalThis as any).Buffer !== 'undefined') {
          return (globalThis as any).Buffer.from(dlData.content, 'base64').toString('utf8');
        }
      }
    } catch {
      // Ignore
    }
    return null;
  }

  // Provider 5: SimpMusic (api-lyrics.simpmusic.org)
  private async querySimpMusic(title: string, artist: string, duration?: number): Promise<string | null> {
    try {
      const params = new URLSearchParams({ title, artist });
      if (duration) params.set('duration', String(Math.round(duration)));
      const res = await fetch(`https://api-lyrics.simpmusic.org/v1/lyrics?${params.toString()}`, {
        headers: { 'User-Agent': 'EchoMusic-AnF/1.4.4' },
        signal: getTimeoutSignal(3500),
      });
      if (res.ok) {
        const data = await res.json();
        return data.synced || data.plain || null;
      }
    } catch {
      // Ignore
    }
    return null;
  }

  // Provider 6: Paxsenix (lyrics.paxsenix.org)
  private async queryPaxsenix(title: string, artist: string, duration?: number): Promise<string | null> {
    try {
      const params = new URLSearchParams({ title, artist });
      if (duration) params.set('duration', String(Math.round(duration)));
      const res = await fetch(`https://lyrics.paxsenix.org/lyrics?${params.toString()}`, {
        headers: { 'User-Agent': 'EchoMusic-AnF/1.4.4' },
        signal: getTimeoutSignal(3500),
      });
      if (res.ok) {
        const data = await res.json();
        return data.syncedLyrics || data.lyrics || null;
      }
    } catch {
      // Ignore
    }
    return null;
  }

  /**
   * Cascading multi-provider query matching Echo Music's LyricsHelper priority:
   * 1. YouLyPlus
   * 2. Paxsenix
   * 3. BetterLyrics
   * 4. SimpMusic
   * 5. LrcLib
   * 6. KuGou
   */
  public async fetchLyrics(track: TrackLyricsQuery): Promise<LyricsQueryResult | null> {
    const cacheKey = this.getCacheKey(track);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const isOnline = typeof navigator === 'undefined' || !('onLine' in navigator) || navigator.onLine;
    if (!isOnline) return null;

    const cleanT = cleanTitle(track.title);
    const primA = track.artist ? primaryArtist(track.artist) : '';

    const providers: Array<{
      name: LyricsProviderName;
      fn: () => Promise<string | null>;
    }> = [
      { name: 'YouLyPlus', fn: () => this.queryYouLyPlus(cleanT, primA, track.duration) },
      { name: 'Paxsenix', fn: () => this.queryPaxsenix(cleanT, primA, track.duration) },
      { name: 'BetterLyrics', fn: () => this.queryBetterLyrics(cleanT, primA, track.duration) },
      { name: 'SimpMusic', fn: () => this.querySimpMusic(cleanT, primA, track.duration) },
      { name: 'LrcLib', fn: () => this.queryLrcLib(cleanT, primA, track.duration) },
      { name: 'KuGou', fn: () => this.queryKuGou(cleanT, primA, track.duration) },
    ];

    for (const p of providers) {
      try {
        const raw = await p.fn();
        if (raw && raw.trim().length > 0) {
          const parsed = parseLrcTimestamps(raw);
          const result: LyricsQueryResult = {
            lyrics: parsed,
            provider: p.name,
            rawLrc: raw,
          };
          this.persist(cacheKey, result);
          return result;
        }
      } catch {
        // Cascade to next provider
      }
    }

    return null;
  }
}

export const echoLyrics = new EchoLyricsOrchestrator();
