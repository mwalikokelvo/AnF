/** Decoupled streaming music provider inspired by Spotube architecture */
import type { AudioTrack } from './audio-library';

export interface StreamTrackMetadata {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  coverUrl?: string;
  artworkUrl?: string;
  streamUrl?: string;
  bitrate?: number;
  source?: 'spotube' | 'spotify' | 'public' | 'custom';
  isrc?: string;
  year?: number;
}

export interface ResolvedAudioStream {
  streamUrl: string;
  mimeType?: string;
  bitrate?: number;
  expiresAt?: number;
  blob?: Blob;
  cached?: boolean;
}

export interface StreamingMetadataProvider {
  searchTracks(query: string, options?: { limit?: number }): Promise<StreamTrackMetadata[]>;
  getTrack(id: string): Promise<StreamTrackMetadata | null>;
}

export interface StreamResolver {
  resolveStream(track: StreamTrackMetadata): Promise<ResolvedAudioStream | null>;
}

function getTimeoutSignal(ms = 5000): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export class SpotubeStreamService implements StreamingMetadataProvider, StreamResolver {
  private cache = new Map<string, StreamTrackMetadata>();
  private cacheKey = 'anf-spotube-cached-tracks';

  constructor() {
    this.hydrateFromStorage();
  }

  private isOnline(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true;
  }

  private hydrateFromStorage(): void {
    try {
      const stored: StreamTrackMetadata[] = JSON.parse(localStorage.getItem(this.cacheKey) || '[]');
      for (const t of stored) {
        if (t && t.id) this.cache.set(t.id, t);
      }
    } catch {
      // Storage unavailable or empty
    }
  }

  private persistToStorage(): void {
    try {
      const list = Array.from(this.cache.values()).slice(0, 500);
      localStorage.setItem(this.cacheKey, JSON.stringify(list));
    } catch {
      // Storage quota or error
    }
  }

  /** Query track metadata by title or artist */
  async search(query: string, limit = 20): Promise<StreamTrackMetadata[]> {
    return this.searchTracks(query, { limit });
  }

  async searchTracks(query: string, options?: { limit?: number }): Promise<StreamTrackMetadata[]> {
    const q = query.trim().toLowerCase();
    const limit = options?.limit || 20;
    if (!q) return [];

    // Filter memory cache first
    const cachedMatches = Array.from(this.cache.values()).filter(
      t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
    );

    if (cachedMatches.length > 0 || !this.isOnline()) {
      return cachedMatches.slice(0, limit);
    }

    try {
      // Attempt remote discovery if available (public proxy or iTunes metadata)
      const res = await fetch(`https://itunes.apple.com/search?media=music&entity=song&term=${encodeURIComponent(q)}&limit=${limit}`, {
        signal: getTimeoutSignal(5000),
      });
      if (res.ok) {
        const data = await res.json();
        const results: StreamTrackMetadata[] = (data.results || []).map((item: any) => ({
          id: String(item.trackId || item.collectionId || crypto.randomUUID()),
          title: item.trackName || 'Unknown Title',
          artist: item.artistName || 'Unknown Artist',
          album: item.collectionName || undefined,
          duration: item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : undefined,
          artworkUrl: item.artworkUrl100 || item.artworkUrl60 || undefined,
          coverUrl: item.artworkUrl100 || item.artworkUrl60 || undefined,
          source: 'spotube' as const,
          streamUrl: item.previewUrl || undefined,
        }));

        for (const t of results) {
          this.registerMetadata(t);
        }
        return results;
      }
    } catch {
      // Network failure, return cached matches
    }

    return cachedMatches.slice(0, limit);
  }

  async getTrack(id: string): Promise<StreamTrackMetadata | null> {
    return this.cache.get(id) || null;
  }

  /** Resolve streaming audio URL for playback */
  async resolveStreamUrl(trackId: string): Promise<string> {
    const item = this.cache.get(trackId);
    if (item?.streamUrl) return item.streamUrl;
    throw Error(`Stream URL unavailable for track ${trackId}`);
  }

  async resolveStream(track: StreamTrackMetadata): Promise<ResolvedAudioStream | null> {
    if (track.streamUrl) {
      return {
        streamUrl: track.streamUrl,
        mimeType: 'audio/mp4',
        cached: false,
      };
    }
    const found = this.cache.get(track.id);
    if (found?.streamUrl) {
      return {
        streamUrl: found.streamUrl,
        mimeType: 'audio/mp4',
        cached: false,
      };
    }
    return null;
  }

  /** Cache streaming track blob into offline IndexedDB audio library */
  async cacheStreamTrack(
    library: { put: (t: AudioTrack) => Promise<void> },
    track: StreamTrackMetadata,
    streamBlobOrUrl: Blob | string
  ): Promise<AudioTrack> {
    let blob: Blob;
    if (typeof streamBlobOrUrl === 'string') {
      const res = await fetch(streamBlobOrUrl);
      if (!res.ok) throw Error(`Stream audio download failed (${res.status})`);
      blob = await res.blob();
    } else {
      blob = streamBlobOrUrl;
    }

    const audioTrack: AudioTrack = {
      id: 'stream:' + track.id,
      title: track.title,
      artist: track.artist,
      name: track.title,
      album: track.album || 'Streaming',
      kind: 'music',
      blob,
      streamUrl: track.streamUrl,
      coverUrl: track.coverUrl || track.artworkUrl,
      duration: track.duration,
      format: blob.type || 'audio/mp4',
      created: Date.now(),
    };

    await library.put(audioTrack);
    this.registerMetadata(track);
    return audioTrack;
  }

  /** Retrieve all cached streaming tracks stored in local offline library */
  async getCachedStreamTracks(library: { tracks: () => Promise<AudioTrack[]> }): Promise<AudioTrack[]> {
    const all = await library.tracks();
    return all.filter(t => t.id.startsWith('stream:'));
  }

  registerMetadata(track: StreamTrackMetadata): void {
    this.cache.set(track.id, track);
    this.persistToStorage();
  }
}

export const streamService = new SpotubeStreamService();

export async function cacheStreamTrack(
  library: { put: (t: AudioTrack) => Promise<void> },
  track: StreamTrackMetadata,
  streamBlobOrUrl: Blob | string
): Promise<AudioTrack> {
  return streamService.cacheStreamTrack(library, track, streamBlobOrUrl);
}
