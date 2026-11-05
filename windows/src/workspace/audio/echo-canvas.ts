/**
 * Echo Music Canvas Provider
 * Reverse-engineered from EchoMusicApp/Echo-Music (echomusiccanvas module)
 * Fetches ambient looping video artwork and visuals for tracks.
 */
import { cleanTitle, primaryArtist } from './lyrics-provider';

export interface CanvasItem {
  song: string;
  artist: string;
  url: string;
}

export class EchoCanvasService {
  private manifestCache: CanvasItem[] | null = null;
  private cacheExpiresAt = 0;
  private readonly ttlMs = 60_000; // 1 minute TTL matching Echo Music

  public async fetchManifest(): Promise<CanvasItem[]> {
    if (this.manifestCache && Date.now() < this.cacheExpiresAt) {
      return this.manifestCache;
    }

    const isOnline = typeof navigator === 'undefined' || !('onLine' in navigator) || navigator.onLine;
    if (!isOnline) return this.manifestCache || [];

    try {
      const res = await fetch('https://canvas.echomusic.fun/canvas.json');
      if (res.ok) {
        const data = await res.json();
        const items: CanvasItem[] = Array.isArray(data.items) ? data.items : [];
        this.manifestCache = items;
        this.cacheExpiresAt = Date.now() + this.ttlMs;
        return items;
      }
    } catch {
      // Offline fallback
    }
    return this.manifestCache || [];
  }

  public async getCanvasUrl(title: string, artist?: string): Promise<string | null> {
    const items = await this.fetchManifest();
    if (!items || items.length === 0) return null;

    const t = cleanTitle(title).toLowerCase();
    const a = (artist ? primaryArtist(artist) : '').toLowerCase();

    const match = items.find(
      i =>
        i.song.toLowerCase().includes(t) &&
        (a ? i.artist.toLowerCase().includes(a) || a.includes(i.artist.toLowerCase()) : true)
    );
    return match ? match.url : null;
  }
}

export const echoCanvas = new EchoCanvasService();
