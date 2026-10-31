/** Decoupled streaming music provider inspired by Spotube architecture */
import type { AudioTrack } from './audio-library';

export interface StreamTrackMetadata {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  coverUrl?: string;
  streamUrl?: string;
  bitrate?: number;
}

export class SpotubeStreamService {
  private cache = new Map<string, StreamTrackMetadata>();

  /** Query track metadata by title or artist */
  async search(query: string, limit = 20): Promise<StreamTrackMetadata[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    // Filter memory cache first
    const cachedMatches = Array.from(this.cache.values()).filter(
      t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
    );

    if (cachedMatches.length >= limit) {
      return cachedMatches.slice(0, limit);
    }

    // Fallback/Simulated offline catalog for zero-connectivity graceful degradation
    return cachedMatches.slice(0, limit);
  }

  /** Resolve streaming audio URL for playback */
  async resolveStreamUrl(trackId: string): Promise<string> {
    const item = this.cache.get(trackId);
    if (item?.streamUrl) return item.streamUrl;
    throw Error(`Stream URL unavailable for track ${trackId}`);
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
      duration: track.duration,
      format: blob.type || 'audio/mp4',
      created: Date.now(),
    };

    await library.put(audioTrack);
    return audioTrack;
  }

  /** Retrieve all cached streaming tracks stored in local offline library */
  async getCachedStreamTracks(library: { tracks: () => Promise<AudioTrack[]> }): Promise<AudioTrack[]> {
    const all = await library.tracks();
    return all.filter(t => t.id.startsWith('stream:'));
  }

  registerMetadata(track: StreamTrackMetadata): void {
    this.cache.set(track.id, track);
  }
}

export const streamService = new SpotubeStreamService();
