/**
 * Decoupled streaming audio provider supporting YouTube / Piped, Spotify / Spotube,
 * LibriVox / Internet Archive Audiobooks, and Direct Audio Streams.
 */
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
  source?: 'youtube' | 'spotify' | 'spotube' | 'audiobook' | 'public' | 'custom';
  bitrate?: number;
  isrc?: string;
  year?: number;
  description?: string;
  chapters?: { title: string; start: number; end?: number }[];
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

export const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.privacy.com.de',
  'https://piped-api.lunar.icu',
  'https://inv.nadeko.net',
];

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
      if (typeof localStorage === 'undefined') return;
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
      if (typeof localStorage === 'undefined') return;
      const list = Array.from(this.cache.values()).slice(0, 500);
      localStorage.setItem(this.cacheKey, JSON.stringify(list));
    } catch {
      // Storage quota or error
    }
  }

  /** Query track metadata by title or artist (backward compatible) */
  async search(query: string, limit = 20): Promise<StreamTrackMetadata[]> {
    return this.searchTracks(query, { limit });
  }

  /** Spotify / iTunes Metadata discovery */
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
      const res = await fetch(
        `https://itunes.apple.com/search?media=music&entity=song&term=${encodeURIComponent(q)}&limit=${limit}`,
        { signal: getTimeoutSignal(5000) }
      );
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
          year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : undefined,
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

  /** YouTube / Piped Multi-Instance Search */
  async searchYouTube(query: string, limit = 20): Promise<StreamTrackMetadata[]> {
    const q = query.trim();
    if (!q) return [];

    let rawItems: any[] = [];
    for (const instance of PIPED_INSTANCES) {
      try {
        const res = await fetch(
          `${instance}/search?q=${encodeURIComponent(q)}&filter=music_songs`,
          { signal: getTimeoutSignal(4500) }
        );
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data) ? data : (data?.items || []);
          if (items.length > 0) {
            rawItems = items;
            break;
          }
        }
      } catch {
        // Try next instance
      }
    }

    // Fallback: try general search if music filter returned empty
    if (rawItems.length === 0) {
      for (const instance of PIPED_INSTANCES) {
        try {
          const res = await fetch(
            `${instance}/search?q=${encodeURIComponent(q)}&filter=all`,
            { signal: getTimeoutSignal(4000) }
          );
          if (res.ok) {
            const data = await res.json();
            const items = Array.isArray(data) ? data : (data?.items || []);
            if (items.length > 0) {
              rawItems = items;
              break;
            }
          }
        } catch {
          // Next
        }
      }
    }

    const results: StreamTrackMetadata[] = [];
    for (const item of rawItems) {
      let videoId = '';
      if (typeof item.url === 'string') {
        const match = item.url.match(/v=([a-zA-Z0-9_-]{11})/);
        if (match) videoId = match[1];
        else if (item.url.startsWith('/watch?v=')) videoId = item.url.replace('/watch?v=', '');
      }
      if (!videoId && item.id) {
        videoId = String(item.id).replace('/watch?v=', '');
      }
      if (!videoId) continue;

      const track: StreamTrackMetadata = {
        id: `yt:${videoId}`,
        title: item.title || 'Unknown Title',
        artist: item.uploaderName || item.uploader || 'YouTube Artist',
        album: 'YouTube Music',
        duration: typeof item.duration === 'number' && item.duration > 0 ? item.duration : undefined,
        artworkUrl: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        coverUrl: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        source: 'youtube',
      };
      this.registerMetadata(track);
      results.push(track);
      if (results.length >= limit) break;
    }

    return results;
  }

  /** Resolve direct YouTube stream URL using multi-instance fallback */
  async resolveYouTubeStream(videoId: string): Promise<ResolvedAudioStream | null> {
    const cleanId = videoId.replace(/^yt:/, '');
    for (const instance of PIPED_INSTANCES) {
      try {
        const res = await fetch(`${instance}/streams/${cleanId}`, {
          signal: getTimeoutSignal(5000),
        });
        if (res.ok) {
          const data = await res.json();
          const streams = Array.isArray(data.audioStreams) ? data.audioStreams : [];
          if (streams.length > 0) {
            // Pick highest bitrate audio stream
            const sorted = [...streams].sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
            const best = sorted[0];
            return {
              streamUrl: best.url,
              mimeType: best.mimeType || 'audio/mp4',
              bitrate: best.bitrate || (best.quality ? parseInt(best.quality, 10) * 1000 : 128000),
              cached: false,
            };
          }
        }
      } catch {
        // Try next piped instance
      }
    }
    return null;
  }

  /** Spotube Resolver: matches Spotify/iTunes track with YouTube audio stream */
  async resolveSpotubeStream(track: StreamTrackMetadata): Promise<ResolvedAudioStream | null> {
    try {
      const q = `${track.artist} - ${track.title}`;
      const ytCandidates = await this.searchYouTube(q, 3);
      if (ytCandidates.length > 0) {
        const resolved = await this.resolveYouTubeStream(ytCandidates[0].id);
        if (resolved) {
          track.streamUrl = resolved.streamUrl;
          track.bitrate = resolved.bitrate;
          this.registerMetadata(track);
          return resolved;
        }
      }
    } catch {
      // YouTube fallback failed
    }

    if (track.streamUrl) {
      return {
        streamUrl: track.streamUrl,
        mimeType: 'audio/mp4',
        cached: false,
      };
    }
    return null;
  }

  /** Internet Archive & LibriVox Audiobooks Search */
  async searchAudiobooks(query: string, limit = 20): Promise<StreamTrackMetadata[]> {
    const q = query.trim();
    if (!q) return [];
    const results: StreamTrackMetadata[] = [];

    // 1. Internet Archive / LibriVox API
    try {
      const archiveUrl = `https://archive.org/advancedsearch.php?q=mediatype:audio+AND+(collection:librivoxaudio+OR+audio_book)+AND+(${encodeURIComponent(q)})&fl[]=identifier,title,creator,description,year,downloads&sort[]=downloads+desc&output=json&rows=${Math.min(limit, 25)}`;
      const res = await fetch(archiveUrl, { signal: getTimeoutSignal(6000) });
      if (res.ok) {
        const data = await res.json();
        const docs = data?.response?.docs || [];
        for (const doc of docs) {
          const id = doc.identifier;
          const track: StreamTrackMetadata = {
            id: `ia:${id}`,
            title: doc.title || id,
            artist: Array.isArray(doc.creator) ? doc.creator.join(', ') : (doc.creator || 'LibriVox / Internet Archive'),
            album: 'Audiobook',
            source: 'audiobook',
            coverUrl: `https://archive.org/services/img/${id}`,
            artworkUrl: `https://archive.org/services/img/${id}`,
            year: doc.year ? parseInt(doc.year, 10) : undefined,
            description: doc.description || undefined,
            streamUrl: `https://archive.org/download/${id}/${id}_64kb_mp3.zip`,
          };
          this.registerMetadata(track);
          results.push(track);
        }
      }
    } catch {
      // Internet Archive search error
    }

    // 2. Also query YouTube for `${query} audiobook`
    try {
      const ytBooks = await this.searchYouTube(`${q} audiobook`, Math.min(8, limit));
      for (const yt of ytBooks) {
        yt.source = 'audiobook';
        yt.album = 'Audiobook';
        results.push(yt);
      }
    } catch {
      // YouTube audiobook search error
    }

    return results.slice(0, limit);
  }

  /** Internet Archive direct audio/chapters stream resolver */
  async resolveInternetArchiveStream(identifier: string): Promise<ResolvedAudioStream | null> {
    const cleanId = identifier.replace(/^ia:/, '');
    try {
      const metaRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(cleanId)}/files`, {
        signal: getTimeoutSignal(5000),
      });
      if (metaRes.ok) {
        const data = await metaRes.json();
        const files: any[] = data?.result || data?.files || [];
        const mp3s = files.filter(f => f.name && (f.name.endsWith('.mp3') || f.format?.includes('MP3')) && !f.name.endsWith('_thumb.jpg'));
        if (mp3s.length > 0) {
          const streamUrl = `https://archive.org/download/${cleanId}/${encodeURIComponent(mp3s[0].name)}`;
          const chapters = mp3s.map((f, idx) => ({
            title: f.title || f.name.replace(/\.[^.]+$/, '').replace(/^[0-9_.-]+/, '') || `Chapter ${idx + 1}`,
            start: 0,
          }));
          const track = this.cache.get(`ia:${cleanId}`);
          if (track) {
            track.streamUrl = streamUrl;
            track.chapters = chapters;
            this.registerMetadata(track);
          }
          return {
            streamUrl,
            mimeType: 'audio/mpeg',
            cached: false,
          };
        }
      }
    } catch {
      // Metadata lookup failed
    }

    // Fallback to direct archive download file
    const streamUrl = `https://archive.org/download/${cleanId}/${cleanId}_64kb_mp3.zip`;
    return {
      streamUrl,
      mimeType: 'audio/mpeg',
      cached: false,
    };
  }

  /** Direct URL Resolver: parse YouTube URLs or direct audio media URLs */
  async resolveDirectUrl(url: string): Promise<{ track: StreamTrackMetadata; stream: ResolvedAudioStream } | null> {
    const raw = url.trim();
    if (!raw) return null;

    // 1. YouTube URLs (youtube.com, youtu.be, piped)
    const ytMatch = raw.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/|piped\.[^/]+\/watch\?.*v=)([a-zA-Z0-9_-]{11})/i);
    if (ytMatch) {
      const videoId = ytMatch[1];
      const stream = await this.resolveYouTubeStream(videoId);
      if (!stream) throw Error('Could not extract direct audio stream from YouTube URL');
      const track: StreamTrackMetadata = {
        id: `yt:${videoId}`,
        title: 'YouTube Stream',
        artist: 'YouTube',
        album: 'YouTube Audio',
        artworkUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        coverUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        streamUrl: stream.streamUrl,
        bitrate: stream.bitrate,
        source: 'youtube',
      };
      this.registerMetadata(track);
      return { track, stream };
    }

    // 2. Direct audio URL (.mp3, .m4a, .ogg, .opus, .wav, .flac)
    try {
      const pathname = raw.split('?')[0];
      const parts = pathname.split('/');
      const filename = decodeURIComponent(parts[parts.length - 1] || 'Web Audio Stream');
      const title = filename.replace(/\.[a-zA-Z0-9]+$/, '') || 'Direct Audio Stream';
      const extMatch = pathname.match(/\.([a-zA-Z0-9]+)$/);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'mp3';
      const mimeType = ext === 'm4a' ? 'audio/mp4' : ext === 'ogg' ? 'audio/ogg' : ext === 'opus' ? 'audio/opus' : ext === 'wav' ? 'audio/wav' : ext === 'flac' ? 'audio/flac' : 'audio/mpeg';

      const id = 'custom:' + Math.abs(Array.from(raw).reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0)).toString(36);
      const track: StreamTrackMetadata = {
        id,
        title,
        artist: 'Direct Stream',
        album: 'Web Audio',
        streamUrl: raw,
        source: 'custom',
      };
      const stream: ResolvedAudioStream = {
        streamUrl: raw,
        mimeType,
        cached: false,
      };
      this.registerMetadata(track);
      return { track, stream };
    } catch {
      return null;
    }
  }

  /** Unified Multi-Source Search Across YouTube, Spotify, and Audiobooks */
  async searchMultiSource(
    query: string,
    options?: { service?: 'all' | 'youtube' | 'spotify' | 'audiobook'; limit?: number }
  ): Promise<StreamTrackMetadata[]> {
    const q = query.trim();
    if (!q) return [];
    const limit = options?.limit || 20;
    const service = options?.service || 'all';

    // Check if query is a direct URL
    if (/^https?:\/\//i.test(q)) {
      try {
        const direct = await this.resolveDirectUrl(q);
        if (direct) return [direct.track];
      } catch {
        // Continue standard search
      }
    }

    if (service === 'youtube') {
      return this.searchYouTube(q, limit);
    }
    if (service === 'spotify') {
      return this.searchTracks(q, { limit });
    }
    if (service === 'audiobook') {
      return this.searchAudiobooks(q, limit);
    }

    // Service 'all': query YouTube, Spotify, and Audiobooks concurrently
    const [ytRes, spRes, abRes] = await Promise.allSettled([
      this.searchYouTube(q, Math.ceil(limit / 2)),
      this.searchTracks(q, { limit: Math.ceil(limit / 2) }),
      this.searchAudiobooks(q, Math.ceil(limit / 3)),
    ]);

    const ytItems = ytRes.status === 'fulfilled' ? ytRes.value : [];
    const spItems = spRes.status === 'fulfilled' ? spRes.value : [];
    const abItems = abRes.status === 'fulfilled' ? abRes.value : [];

    const merged: StreamTrackMetadata[] = [];
    const maxLen = Math.max(ytItems.length, spItems.length, abItems.length);
    for (let i = 0; i < maxLen; i++) {
      if (spItems[i] && merged.length < limit) merged.push(spItems[i]);
      if (ytItems[i] && merged.length < limit) merged.push(ytItems[i]);
      if (abItems[i] && merged.length < limit) merged.push(abItems[i]);
    }

    return merged.slice(0, limit);
  }

  async getTrack(id: string): Promise<StreamTrackMetadata | null> {
    return this.cache.get(id) || null;
  }

  /** Resolve streaming audio URL for playback */
  async resolveStreamUrl(trackId: string): Promise<string> {
    const item = this.cache.get(trackId);
    if (item?.streamUrl) return item.streamUrl;
    if (item) {
      const resolved = await this.resolveStream(item);
      if (resolved?.streamUrl) return resolved.streamUrl;
    }
    throw Error(`Stream URL unavailable for track ${trackId}`);
  }

  async resolveStream(track: StreamTrackMetadata): Promise<ResolvedAudioStream | null> {
    // 1. If YouTube track
    if (track.source === 'youtube' || track.id.startsWith('yt:')) {
      const videoId = track.id.replace(/^yt:/, '');
      const ytStream = await this.resolveYouTubeStream(videoId);
      if (ytStream) return ytStream;
    }

    // 2. If Internet Archive Audiobook
    if (track.source === 'audiobook' && track.id.startsWith('ia:')) {
      const iaStream = await this.resolveInternetArchiveStream(track.id);
      if (iaStream) return iaStream;
    }

    // 3. If Spotube / Spotify track without streamUrl or with previewUrl
    if (track.source === 'spotube' || track.source === 'spotify') {
      const spStream = await this.resolveSpotubeStream(track);
      if (spStream) return spStream;
    }

    // 4. Fallback to existing streamUrl if set
    if (track.streamUrl) {
      return {
        streamUrl: track.streamUrl,
        mimeType: 'audio/mp4',
        bitrate: track.bitrate,
        cached: false,
      };
    }

    const found = this.cache.get(track.id);
    if (found?.streamUrl) {
      return {
        streamUrl: found.streamUrl,
        mimeType: 'audio/mp4',
        bitrate: found.bitrate,
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
      album: track.album || (track.source === 'audiobook' ? 'Audiobook' : 'Streaming'),
      kind: track.source === 'audiobook' ? 'audiobook' : 'music',
      blob,
      streamUrl: track.streamUrl,
      coverUrl: track.coverUrl || track.artworkUrl,
      duration: track.duration,
      format: blob.type || 'audio/mp4',
      created: Date.now(),
      chapters: track.chapters?.map(c => ({ title: c.title, start: c.start })),
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

export async function searchMultiSource(
  query: string,
  options?: { service?: 'all' | 'youtube' | 'spotify' | 'audiobook'; limit?: number }
): Promise<StreamTrackMetadata[]> {
  return streamService.searchMultiSource(query, options);
}

export async function resolveYouTubeStream(videoId: string): Promise<ResolvedAudioStream | null> {
  return streamService.resolveYouTubeStream(videoId);
}

export async function resolveSpotubeStream(track: StreamTrackMetadata): Promise<ResolvedAudioStream | null> {
  return streamService.resolveSpotubeStream(track);
}

export async function searchAudiobooks(query: string, limit = 20): Promise<StreamTrackMetadata[]> {
  return streamService.searchAudiobooks(query, limit);
}

export async function resolveDirectUrl(
  url: string
): Promise<{ track: StreamTrackMetadata; stream: ResolvedAudioStream } | null> {
  return streamService.resolveDirectUrl(url);
}

export async function cacheStreamTrack(
  library: { put: (t: AudioTrack) => Promise<void> },
  track: StreamTrackMetadata,
  streamBlobOrUrl: Blob | string
): Promise<AudioTrack> {
  return streamService.cacheStreamTrack(library, track, streamBlobOrUrl);
}
