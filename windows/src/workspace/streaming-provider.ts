/**
 * Decoupled streaming audio provider supporting YouTube / Piped, Spotify / Spotube,
 * LibriVox / Internet Archive Audiobooks, and Direct Audio Streams.
 */
import type { AudioTrack } from './audio-library';

import { gatedFetch, ONLINE_LOOKUPS_OFF, onlineLookupsEnabled, safeHttpsUrl } from './online-lookups';
import { loadRemoteAudio, needsRustFetch } from './stream-source';

export type StreamErrorCode = 'lookups-off' | 'youtube-unresolved' | 'not-audio' | 'unsupported-url' | 'invalid-url' | 'preview-only' | 'youtube-unavailable' | 'youtube-no-audio';

/** A resolution failure with a message that is safe to show to the user as-is. */
export class StreamResolutionError extends Error {
  readonly code: StreamErrorCode;
  constructor(code: StreamErrorCode, message: string) {
    super(message);
    this.name = 'StreamResolutionError';
    this.code = code;
  }
  /** Generic handlers print String(err); keep that readable. */
  override toString(): string { return this.message; }
}

/** Error for a search result whose stream could not be resolved, worded by cause. */
export function unresolvedStreamError(track: { title: string; source?: string; id: string }): Error {
  if (track.source === 'youtube' || track.id.startsWith('yt:')) {
    return onlineLookupsEnabled()
      ? youtubeFailureError(lastYouTubeFailure.get(track.id.replace(/^yt:/, '')) ?? 'unreachable')
      : new StreamResolutionError('lookups-off', YOUTUBE_LOOKUPS_OFF_MESSAGE);
  }
  return Error('Could not resolve a stream for ' + track.title + '.');
}

export type YouTubeLookupFailure = 'unreachable' | 'unavailable' | 'no-audio';
/** Why the last lookup of a video id failed, so a result card can say the real reason. */
const lastYouTubeFailure = new Map<string, YouTubeLookupFailure>();
function youtubeFailureError(why: YouTubeLookupFailure): StreamResolutionError {
  return why === 'unavailable' ? new StreamResolutionError('youtube-unavailable', YOUTUBE_UNAVAILABLE_MESSAGE)
    : why === 'no-audio' ? new StreamResolutionError('youtube-no-audio', YOUTUBE_NO_AUDIO_MESSAGE)
    : new StreamResolutionError('youtube-unresolved', YOUTUBE_UNRESOLVED_MESSAGE);
}

export const YOUTUBE_LOOKUPS_OFF_MESSAGE =
  'YouTube links need Online lookups. Turn on "Online lookups" in the Music Hub header, then try again.';
const FULL_SOURCE_ROUTES = 'paste a direct audio link (MP3, M4A, Opus), or import the audio files into your library.';
/** Every lookup service failed to answer (down, busy, rate limited or blocked). */
export const YOUTUBE_UNRESOLVED_MESSAGE =
  'YouTube stream could not be resolved right now: none of the lookup services answered (public ones are often down or busy). Try again in a moment, ' + FULL_SOURCE_ROUTES;
/** A lookup service answered that the video itself cannot be played. */
export const YOUTUBE_UNAVAILABLE_MESSAGE =
  'That YouTube video is unavailable (private, removed, age-restricted or blocked), so there is no audio to play. Try another video, ' + FULL_SOURCE_ROUTES;
/** A lookup service answered but offered no audio stream (for example a live stream or a premiere). */
export const YOUTUBE_NO_AUDIO_MESSAGE =
  'That YouTube link has no playable audio stream (it may be a live stream or a premiere that has not started). Try another video, ' + FULL_SOURCE_ROUTES;
/** Shown when only the 30 s clip a catalogue offers for a song could be found, and when someone tries to save such a clip. */
export const PREVIEW_ONLY_MESSAGE =
  'Only a 30 s preview of this song is available here, so it is not saved to your library. For the full song, paste its YouTube link (with Online lookups on), paste a direct audio link (MP3, M4A, Opus), or import the audio file into your library.';
export const NOT_AUDIO_MESSAGE =
  'That link is a web page or file, not audio, so it was not played or saved. Paste a direct audio link (MP3, M4A, Opus) or a YouTube video link.';

/** Plain-language text for any error raised while resolving, playing or saving a stream. */
export function describeStreamError(err: unknown): string {
  if (err instanceof StreamResolutionError) return err.message;
  const text = err instanceof Error ? err.message : String(err);
  if (/Online lookups are off/i.test(text)) return text;
  // The desktop download (Rust safe_fetch_audio) refuses pages and other non-audio answers with this sentence.
  if (/did not return audio/i.test(text)) return NOT_AUDIO_MESSAGE;
  return 'Could not play that link: ' + text.replace(/^Error:\s*/, '');
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOST = /^(?:(?:www|m|music)\.)?youtube(?:-nocookie)?\.com$/i;

/** True for any youtube.com / youtu.be host, with or without a usable video id. */
export function isYouTubeUrl(input: string): boolean {
  const u = parseWebUrl(input);
  return !!u && (YOUTUBE_HOST.test(u.hostname) || /^youtu\.be$/i.test(u.hostname));
}

function parseWebUrl(input: string): URL | null {
  const raw = input.trim();
  if (!raw) return null;
  try { return new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : 'https://' + raw); } catch { return null; }
}

/**
 * Video id from a YouTube watch, youtu.be, shorts, embed, live or music URL.
 * Parsed with URL (host and path checked), never by scanning the text for an id.
 */
export function parseYouTubeVideoId(input: string): string | null {
  const u = parseWebUrl(input);
  if (!u || (u.protocol !== 'https:' && u.protocol !== 'http:')) return null;
  const host = u.hostname.toLowerCase();
  const segs = u.pathname.split('/').filter(Boolean);
  let id: string | null | undefined;
  if (host === 'youtu.be') id = segs[0];
  else if (YOUTUBE_HOST.test(host)) {
    if (segs[0] === 'watch') id = u.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(segs[0])) id = segs[1];
  } else if (/^piped\./.test(host) && segs[0] === 'watch') id = u.searchParams.get('v');
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/**
 * Whether a Content-Type is something the audio element can be given. Unknown (missing)
 * and octet-stream are allowed because CDNs often serve audio that way; the player's
 * error handler covers those. Pages, JSON, images and archives are refused.
 */
export function isAudioContentType(contentType: string | null | undefined): boolean {
  const type = (contentType || '').split(';')[0].trim().toLowerCase();
  if (!type) return true;
  return type.startsWith('audio/') || ['application/ogg', 'application/octet-stream', 'binary/octet-stream', 'video/mp4', 'video/webm', 'video/ogg'].includes(type);
}

/** Placeholder title and artist the direct-link resolver gave pasted pages before PR #64. */
const BROKEN_STREAM_TITLE = 'Web Audio Stream';
const BROKEN_STREAM_ARTIST = 'Direct Stream';

/**
 * True only for a library entry that is provably a mistaken web page: the exact direct-stream
 * placeholder title and artist, plus a stored type that was explicitly not audio (text/html etc.).
 * Entries with no recorded type, an audio type, or any other title or artist never match.
 */
export function isBrokenStreamEntry(t: { title?: unknown; artist?: unknown; format?: unknown; blob?: { type?: unknown } | null }): boolean {
  if (t.title !== BROKEN_STREAM_TITLE || t.artist !== BROKEN_STREAM_ARTIST) return false;
  const types = [t.blob?.type, t.format].filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  return types.length > 0 && types.some(type => !isAudioContentType(type));
}

export function findBrokenStreamEntries<T extends Parameters<typeof isBrokenStreamEntry>[0] & { id: string }>(tracks: T[]): T[] {
  return tracks.filter(isBrokenStreamEntry);
}

/**
 * Best-effort HEAD check of a direct link before it is handed to the audio element.
 * Refuses when the server answers with a non-audio type (for example text/html). A network
 * or policy failure is inconclusive and lets the player's own error handling decide.
 */
export async function verifyAudioUrl(url: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  // Desktop, host outside the CSP: fetch() cannot reach it; Rust checks the content type when it downloads.
  if (needsRustFetch(url)) return;
  let res: Response;
  try {
    res = await fetchImpl(url, { method: 'HEAD', redirect: 'follow', signal: getTimeoutSignal(5000) });
  } catch {
    return;
  }
  if (res.ok && !isAudioContentType(res.headers.get('content-type'))) {
    throw new StreamResolutionError('not-audio', NOT_AUDIO_MESSAGE);
  }
}

const NON_AUDIO_EXTENSION = /\.(?:html?|php|aspx?|jsp|json|xml|txt|pdf|zip|jpe?g|png|gif|webp|svg)$/i;
export interface StreamTrackMetadata {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  coverUrl?: string;
  artworkUrl?: string;
  streamUrl?: string;
  /** A catalogue's 30 s clip (iTunes / Spotify embed). It is not the song: it is only played, labelled, when no full source is found. */
  previewUrl?: string;
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
  /** True when this is only a 30 s preview clip, not the full track. */
  preview?: boolean;
}

export interface StreamingMetadataProvider {
  searchTracks(query: string, options?: { limit?: number }): Promise<StreamTrackMetadata[]>;
  getTrack(id: string): Promise<StreamTrackMetadata | null>;
}

export interface StreamResolver {
  resolveStream(track: StreamTrackMetadata): Promise<ResolvedAudioStream | null>;
}

export interface ParsedCollectionUrl {
  platform: 'youtube' | 'spotify';
  type: 'playlist' | 'album';
  id: string;
}

export interface BatchResolvedCollection {
  id: string;
  title: string;
  artist?: string;
  type: 'playlist' | 'album';
  source: 'youtube' | 'spotify' | 'custom';
  itemCount: number;
  artworkUrl?: string;
  tracks: StreamTrackMetadata[];
}

export function parsePlaylistOrAlbumUrl(url: string): ParsedCollectionUrl | null {
  const raw = url.trim();
  if (!raw) return null;

  // 1. YouTube playlist: list=PL... / UU... / OLAK... on a YouTube (or Piped) host. Auto-generated radio mixes
  // (list=RD<video id>, RDMM, RDEM ... with start_radio) are endless and not importable, so a watch link carrying one
  // stays a single video. RDCLAK... are real curated YouTube Music playlists and still import.
  const web = parseWebUrl(raw);
  if (web && (web.protocol === 'https:' || web.protocol === 'http:') && (YOUTUBE_HOST.test(web.hostname) || /^piped\./i.test(web.hostname))) {
    const list = web.searchParams.get('list');
    if (list && /^[a-zA-Z0-9_-]+$/.test(list) && !/^RD(?!CLAK)/.test(list)) {
      return { platform: 'youtube', type: 'playlist', id: list };
    }
  }

  // 2. Spotify Playlist or Album
  const spMatch = raw.match(
    /(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(playlist|album)\/|spotify:(playlist|album):)([a-zA-Z0-9]+)/i
  );
  if (spMatch) {
    const type = (spMatch[1] || spMatch[2]).toLowerCase() as 'playlist' | 'album';
    const id = spMatch[3];
    return {
      platform: 'spotify',
      type,
      id,
    };
  }

  return null;
}

/** Each instance speaks one API: Piped (`/search`, `/streams/ID`, `/playlists/ID`) or Invidious (`/api/v1/...`). */
export interface StreamInstance { url: string; kind: 'piped' | 'invidious' }
/**
 * Public instances change often. Checked 2026-11-02 against the Piped documentation's public-instances page and the
 * Invidious documentation's instances list (the hosts below are on those lists); liveness could not be tested from the
 * build sandbox. Every host here must also be in `connect-src` of tauri.conf.json (csp and devCsp); tests/stream-resolution.test.ts pins both.
 */
export const STREAM_INSTANCES: StreamInstance[] = [
  { url: 'https://pipedapi.kavin.rocks', kind: 'piped' },
  { url: 'https://pipedapi.leptons.xyz', kind: 'piped' },
  { url: 'https://piped-api.privacy.com.de', kind: 'piped' },
  { url: 'https://pipedapi.adminforge.de', kind: 'piped' },
  { url: 'https://inv.nadeko.net', kind: 'invidious' },
  { url: 'https://invidious.nerdvpn.de', kind: 'invidious' },
];
/** A failed instance goes to the back of the line for this long (it is still tried when nothing else answers). */
const INSTANCE_COOLDOWN_MS = 2 * 60_000;
/** Per-request timeout and the time after which no new instance is started in one lookup. */
const INSTANCE_TIMEOUT_MS = 4000;
const LOOKUP_BUDGET_MS = 16_000;
const instanceFailedAt = new Map<string, number>();
export function resetInstanceHealth(): void { instanceFailedAt.clear(); }
/** Healthy instances first in list order, then recently failed ones, the longest-failed first. */
function orderedInstances(): StreamInstance[] {
  const now = Date.now();
  const cooling = (i: StreamInstance) => { const t = instanceFailedAt.get(i.url); return t !== undefined && now - t < INSTANCE_COOLDOWN_MS; };
  const failedAt = (i: StreamInstance) => instanceFailedAt.get(i.url) ?? 0;
  return [...STREAM_INSTANCES.filter(i => !cooling(i)), ...STREAM_INSTANCES.filter(cooling).sort((a, b) => failedAt(a) - failedAt(b))];
}
function noteInstance(i: StreamInstance, answered: boolean): void { if (answered) instanceFailedAt.delete(i.url); else instanceFailedAt.set(i.url, Date.now()); }

const BOT_BLOCK = /\b(bot|captcha|sign in to confirm|rate.?limit|too many requests)\b/i;
const VIDEO_GONE = /\b(unavailable|not available|private|removed|deleted|terminated|age.?restricted|members.?only|copyright)\b/i;
/** What an error answer means: the video cannot be played, or this instance is blocked/failing. */
async function failureCause(res: Response): Promise<'unavailable' | 'instance'> {
  if (res.status === 404 || res.status === 410) return 'unavailable';
  let text = '';
  try { const body: any = JSON.parse((await res.text()).slice(0, 4000)); text = [body?.error, body?.message].filter(x => typeof x === 'string').join(' '); } catch { /* not JSON */ }
  if (text && BOT_BLOCK.test(text)) return 'instance';
  return text && VIDEO_GONE.test(text) ? 'unavailable' : 'instance';
}
export const PIPED_INSTANCES = STREAM_INSTANCES.map(i => i.url);

interface InstanceVideo { videoId: string; title?: string; artist?: string; duration?: number; thumbnail?: string }
interface InstanceAudio { url: string; mimeType?: string; bitrate: number }

const videoIdOf = (item: any): string => {
  if (typeof item?.videoId === 'string') return item.videoId;
  let id = '';
  if (typeof item?.url === 'string') {
    const m = item.url.match(/v=([a-zA-Z0-9_-]{11})/);
    if (m) id = m[1];
  }
  if (!id && item?.id) id = String(item.id).replace('/watch?v=', '');
  return id;
};
/** Instances and their proxies serve thumbnails from their own hosts, which the img-src CSP blocks; only i.ytimg.com is allowed. */
const ytimgThumb = (u: unknown): string | undefined => { const s = safeHttpsUrl(u); return s && new URL(s).hostname === 'i.ytimg.com' ? s : undefined; };
const positive = (n: unknown): number | undefined => (typeof n === 'number' && n > 0 ? n : undefined);

function searchUrl(i: StreamInstance, q: string, filter: 'music_songs' | 'all'): string {
  return i.kind === 'invidious'
    ? `${i.url}/api/v1/search?q=${encodeURIComponent(q)}&type=video`
    : `${i.url}/search?q=${encodeURIComponent(q)}&filter=${filter}`;
}
function streamsUrl(i: StreamInstance, id: string): string {
  return i.kind === 'invidious' ? `${i.url}/api/v1/videos/${id}?fields=title,author,lengthSeconds,adaptiveFormats` : `${i.url}/streams/${id}`;
}
function playlistUrl(i: StreamInstance, id: string): string {
  return i.kind === 'invidious' ? `${i.url}/api/v1/playlists/${encodeURIComponent(id)}` : `${i.url}/playlists/${id}`;
}
/** Search results or playlist videos, in one shape for both APIs. */
function videosOf(i: StreamInstance, items: unknown): InstanceVideo[] {
  if (!Array.isArray(items)) return [];
  const out: InstanceVideo[] = [];
  for (const item of items as any[]) {
    if (i.kind === 'invidious' && item?.type && item.type !== 'video') continue;
    const videoId = videoIdOf(item);
    if (!videoId) continue;
    const thumb = i.kind === 'invidious' ? item.videoThumbnails?.find((t: any) => ytimgThumb(t?.url))?.url : item.thumbnail;
    out.push({
      videoId,
      title: item.title,
      artist: item.uploaderName || item.uploader || item.author,
      duration: positive(item.duration) ?? positive(item.lengthSeconds),
      thumbnail: ytimgThumb(thumb),
    });
  }
  return out;
}
function searchVideos(i: StreamInstance, data: any): InstanceVideo[] {
  return videosOf(i, Array.isArray(data) ? data : (data?.items || []));
}
function playlistVideos(i: StreamInstance, data: any): InstanceVideo[] {
  return videosOf(i, i.kind === 'invidious' ? data?.videos : (Array.isArray(data?.relatedStreams) ? data.relatedStreams : data?.items));
}
function videoDetails(i: StreamInstance, data: any): { title?: string; uploader?: string; duration?: number; audio: InstanceAudio[] } {
  const raw: any[] = i.kind === 'invidious' ? (data?.adaptiveFormats ?? []) : (data?.audioStreams ?? []);
  const audio: InstanceAudio[] = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    const mimeType: string | undefined = i.kind === 'invidious' ? x?.type : x?.mimeType;
    const url = safeHttpsUrl(x?.url);
    if (!url || (i.kind === 'invidious' ? !String(mimeType).startsWith('audio/') : mimeType && !String(mimeType).startsWith('audio/'))) continue;
    const bitrate = Number(x.bitrate) || (x.quality ? parseInt(x.quality, 10) * 1000 : 0) || 128000;
    audio.push({ url, mimeType, bitrate });
  }
  return { title: data?.title, uploader: i.kind === 'invidious' ? data?.author : data?.uploader, duration: positive(data?.duration) ?? positive(data?.lengthSeconds), audio };
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
      if (typeof localStorage === 'undefined') return;
      const stored: StreamTrackMetadata[] = JSON.parse(localStorage.getItem(this.cacheKey) || '[]');
      for (const t of stored) {
        if (!t || !t.id) continue;
        // Older versions kept the catalogue's 30 s clip in streamUrl; it was never the full song.
        if ((t.source === 'spotube' || t.source === 'spotify') && t.streamUrl && !t.previewUrl) {
          t.previewUrl = t.streamUrl;
          delete t.streamUrl;
        }
        this.cache.set(t.id, t);
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
      const res = await gatedFetch(
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
          previewUrl: safeHttpsUrl(item.previewUrl),
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

    let rawItems: InstanceVideo[] = [];
    // Music filter first (Piped only has it); then the general search. Invidious has one search, so it is not asked twice.
    const failedHere = new Set<string>();
    for (const pass of ['music_songs', 'all'] as const) {
      for (const instance of orderedInstances()) {
        if (pass === 'all' && (instance.kind === 'invidious' || failedHere.has(instance.url))) continue;
        try {
          const res = await gatedFetch(searchUrl(instance, q, pass), { signal: getTimeoutSignal(INSTANCE_TIMEOUT_MS) });
          noteInstance(instance, res.ok);
          if (!res.ok) { failedHere.add(instance.url); continue; }
          const items = searchVideos(instance, await res.json());
          if (items.length > 0) { rawItems = items; break; }
        } catch {
          noteInstance(instance, false);
          failedHere.add(instance.url);
        }
      }
      if (rawItems.length > 0) break;
    }

    const results: StreamTrackMetadata[] = [];
    for (const item of rawItems) {
      const videoId = item.videoId;
      const thumb = item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      const track: StreamTrackMetadata = {
        id: `yt:${videoId}`,
        title: item.title || 'Unknown Title',
        artist: item.artist || 'YouTube Artist',
        album: 'YouTube Music',
        duration: item.duration,
        artworkUrl: thumb,
        coverUrl: thumb,
        source: 'youtube',
      };
      this.registerMetadata(track);
      results.push(track);
      if (results.length >= limit) break;
    }

    return results;
  }

  /** Title, uploader and best audio stream of one video, or why none could be had. Instances are tried in order of health. */
  async lookupYouTubeDetailed(videoId: string): Promise<
    | { ok: true; title?: string; uploader?: string; duration?: number; stream: ResolvedAudioStream }
    | { ok: false; why: YouTubeLookupFailure }
  > {
    const cleanId = videoId.replace(/^yt:/, '');
    if (!YOUTUBE_ID.test(cleanId) || !onlineLookupsEnabled()) return { ok: false, why: 'unreachable' };
    const started = Date.now();
    let noAudio = false;
    for (const instance of orderedInstances()) {
      if (Date.now() - started > LOOKUP_BUDGET_MS) break;
      try {
        const res = await gatedFetch(streamsUrl(instance, cleanId), { signal: getTimeoutSignal(INSTANCE_TIMEOUT_MS) });
        if (!res.ok) {
          const cause = await failureCause(res);
          noteInstance(instance, cause === 'unavailable');
          if (cause === 'unavailable') { lastYouTubeFailure.set(cleanId, 'unavailable'); return { ok: false, why: 'unavailable' }; }
          continue;
        }
        const data = videoDetails(instance, await res.json());
        noteInstance(instance, true);
        if (data.audio.length === 0) { noAudio = true; continue; }
        // Pick highest bitrate audio stream
        const best = [...data.audio].sort((a, b) => b.bitrate - a.bitrate)[0];
        lastYouTubeFailure.delete(cleanId);
        return {
          ok: true,
          title: typeof data.title === 'string' && data.title.trim() ? data.title.trim().slice(0, 200) : undefined,
          uploader: typeof data.uploader === 'string' && data.uploader.trim() ? data.uploader.trim().slice(0, 120) : undefined,
          duration: data.duration,
          stream: { streamUrl: best.url, mimeType: best.mimeType || 'audio/mp4', bitrate: best.bitrate, cached: false },
        };
      } catch {
        noteInstance(instance, false);
      }
    }
    const why: YouTubeLookupFailure = noAudio ? 'no-audio' : 'unreachable';
    lastYouTubeFailure.set(cleanId, why);
    return { ok: false, why };
  }

  /** Title, uploader and best audio stream of one video, from the first allow-listed instance that answers. */
  async lookupYouTube(videoId: string): Promise<{ title?: string; uploader?: string; duration?: number; stream: ResolvedAudioStream } | null> {
    const r = await this.lookupYouTubeDetailed(videoId);
    return r.ok ? r : null;
  }

  /** Resolve direct YouTube stream URL using multi-instance fallback */
  async resolveYouTubeStream(videoId: string): Promise<ResolvedAudioStream | null> {
    return (await this.lookupYouTube(videoId))?.stream ?? null;
  }

  /** Spotube Resolver: matches Spotify/iTunes track with YouTube audio stream */
  async resolveSpotubeStream(track: StreamTrackMetadata): Promise<ResolvedAudioStream | null> {
    try {
      const q = `${track.artist} - ${track.title}`;
      const ytCandidates = await this.searchYouTube(q, 3);
      if (ytCandidates.length > 0) {
        const resolved = await this.resolveYouTubeStream(ytCandidates[0].id);
        if (resolved) {
          track.bitrate = resolved.bitrate;
          this.registerMetadata(track);
          return resolved;
        }
      }
    } catch {
      // YouTube fallback failed
    }

    // No full source: the catalogue's 30 s clip, flagged so the UI can label it and never save it as the song.
    const preview = safeHttpsUrl(track.previewUrl);
    if (preview) return { streamUrl: preview, mimeType: 'audio/mp4', cached: false, preview: true };
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
      const res = await gatedFetch(archiveUrl, { signal: getTimeoutSignal(6000) });
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
      const metaRes = await gatedFetch(`https://archive.org/metadata/${encodeURIComponent(cleanId)}/files`, {
        signal: getTimeoutSignal(5000),
      });
      if (metaRes.ok) {
        const data = await metaRes.json();
        const files: any[] = data?.result || data?.files || [];
        const mp3s = files.filter(f => typeof f.name === 'string' && /\.mp3$/i.test(f.name));
        if (mp3s.length > 0) {
          const streamUrl = `https://archive.org/download/${cleanId}/${encodeURIComponent(mp3s[0].name)}`;
          // Each file is its own recording, so there are no chapter start times inside this one stream.
          const track = this.cache.get(`ia:${cleanId}`);
          if (track) {
            track.streamUrl = streamUrl;
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

    // No playable file list: a ZIP of the whole book is not audio, so there is nothing to play.
    return null;
  }

  /** Direct URL Resolver: parse YouTube URLs or direct audio media URLs */
  async resolveDirectUrl(url: string): Promise<{ track: StreamTrackMetadata; stream: ResolvedAudioStream } | null> {
    const raw = url.trim();
    if (!raw) return null;

    // 1. YouTube URLs (watch, youtu.be, shorts, embed, live, music): only through the allow-listed instances, only with Online lookups on
    const videoId = parseYouTubeVideoId(raw);
    if (videoId) {
      if (!onlineLookupsEnabled()) throw new StreamResolutionError('lookups-off', YOUTUBE_LOOKUPS_OFF_MESSAGE);
      const video = await this.lookupYouTubeDetailed(videoId);
      if (!video.ok) throw youtubeFailureError(video.why);
      const track: StreamTrackMetadata = {
        id: `yt:${videoId}`,
        title: video.title || 'YouTube Stream',
        artist: video.uploader || 'YouTube',
        album: 'YouTube Audio',
        duration: video.duration,
        artworkUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        coverUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        streamUrl: video.stream.streamUrl,
        bitrate: video.stream.bitrate,
        source: 'youtube',
      };
      this.registerMetadata(track);
      return { track, stream: video.stream };
    }
    if (isYouTubeUrl(raw)) {
      throw new StreamResolutionError('unsupported-url', 'That YouTube link does not point to a single video. Paste a watch, youtu.be or shorts link.');
    }

    const web = parseWebUrl(raw);
    if (!web || !web.hostname.includes('.')) throw new StreamResolutionError('invalid-url', 'That does not look like a web link. Paste a full https:// address.');
    if (web.protocol !== 'https:') throw new StreamResolutionError('unsupported-url', 'Only https links can be played. Paste an https:// audio link.');
    if (/(^|\.)spotify\.com$/i.test(web.hostname) || NON_AUDIO_EXTENSION.test(web.pathname)) {
      throw new StreamResolutionError('not-audio', NOT_AUDIO_MESSAGE);
    }

    // 2. Direct audio URL (.mp3, .m4a, .ogg, .opus, .wav, .flac)
    try {
      const pathname = web.pathname;
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
        streamUrl: web.href,
        source: 'custom',
      };
      const stream: ResolvedAudioStream = {
        streamUrl: web.href,
        mimeType,
        cached: false,
      };
      this.registerMetadata(track);
      return { track, stream };
    } catch {
      return null;
    }
  }

  /** Parse playlist or album URL */
  parseCollectionUrl(url: string): ParsedCollectionUrl | null {
    return parsePlaylistOrAlbumUrl(url);
  }

  /**
   * Resolve YouTube playlist into a batch collection of tracks using Piped API instances
   * with fallback to YouTube public initial-state parsing.
   */
  async resolveYouTubePlaylist(playlistId: string, limit = 100): Promise<BatchResolvedCollection | null> {
    const cleanId = playlistId.trim().replace(/^yt:playlist:/, '');
    if (!cleanId) return null;

    // 1. Try Piped API instances
    for (const instance of orderedInstances()) {
      try {
        const res = await gatedFetch(playlistUrl(instance, cleanId), { signal: getTimeoutSignal(INSTANCE_TIMEOUT_MS) });
        noteInstance(instance, res.ok);
        if (res.ok) {
          const data = await res.json();
          const videos = playlistVideos(instance, data);
          if (videos.length > 0) {
            const title = data.name || data.title || 'YouTube Playlist';
            const tracks: StreamTrackMetadata[] = [];
            for (const item of videos) {
              const thumb = item.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`;
              const track: StreamTrackMetadata = {
                id: `yt:${item.videoId}`,
                title: item.title || 'Unknown Title',
                artist: item.artist || 'YouTube Artist',
                album: title,
                duration: item.duration,
                artworkUrl: thumb,
                coverUrl: thumb,
                source: 'youtube',
              };
              this.registerMetadata(track);
              tracks.push(track);
              if (tracks.length >= limit) break;
            }
            return {
              id: `yt:playlist:${cleanId}`,
              title,
              artist: data.uploader || data.author || 'YouTube',
              type: 'playlist',
              source: 'youtube',
              itemCount: tracks.length,
              artworkUrl: data.bannerUrl || data.thumbnailUrl || tracks[0]?.coverUrl,
              tracks,
            };
          }
        }
      } catch {
        noteInstance(instance, false);
      }
    }

    // 2. Fallback: Parse YouTube public playlist page
    try {
      const res = await gatedFetch(`https://www.youtube.com/playlist?list=${cleanId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: getTimeoutSignal(6000),
      });
      if (res.ok) {
        const text = await res.text();
        const m = text.match(/var ytInitialData = (\{.+?\});<\/script>/);
        if (m) {
          const d = JSON.parse(m[1]);
          const title = d.metadata?.playlistMetadataRenderer?.title ||
            d.header?.playlistHeaderRenderer?.title?.simpleText ||
            d.header?.playlistHeaderRenderer?.title?.runs?.[0]?.text ||
            'YouTube Playlist';

          const tracks: StreamTrackMetadata[] = [];
          const seen = new Set<string>();

          const parseDurationSec = (str?: string): number | undefined => {
            if (!str) return undefined;
            const parts = str.trim().split(':').map(Number);
            if (parts.some(isNaN)) return undefined;
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
            if (parts.length === 2) return parts[0] * 60 + parts[1];
            return undefined;
          };

          const extractVideos = (obj: any): void => {
            if (!obj || typeof obj !== 'object' || tracks.length >= limit) return;
            if (obj.lockupViewModel && obj.lockupViewModel.contentId) {
              const lk = obj.lockupViewModel;
              const videoId = lk.contentId;
              if (videoId && !seen.has(videoId)) {
                seen.add(videoId);
                const label = lk.rendererContext?.accessibilityContext?.label || '';
                const titlePart = label.split(/\s+\d+\s+hours|\s+\d+\s+minutes|\s+\d+\s+seconds/)[0]?.trim() || 'YouTube Track';
                const badgeText = lk.contentImage?.thumbnailViewModel?.overlays?.[0]?.thumbnailBottomOverlayViewModel?.badges?.[0]?.thumbnailBadgeViewModel?.text;
                const duration = parseDurationSec(badgeText);
                const thumb = lk.contentImage?.thumbnailViewModel?.image?.sources?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
                const track: StreamTrackMetadata = {
                  id: `yt:${videoId}`,
                  title: titlePart,
                  artist: 'YouTube',
                  album: title,
                  duration,
                  artworkUrl: thumb,
                  coverUrl: thumb,
                  source: 'youtube',
                };
                this.registerMetadata(track);
                tracks.push(track);
              }
            } else if (obj.playlistVideoRenderer && obj.playlistVideoRenderer.videoId) {
              const vr = obj.playlistVideoRenderer;
              const videoId = vr.videoId;
              if (videoId && !seen.has(videoId)) {
                seen.add(videoId);
                const vTitle = vr.title?.runs?.[0]?.text || vr.title?.simpleText || 'YouTube Track';
                const artist = vr.shortBylineText?.runs?.[0]?.text || 'YouTube';
                const durSec = parseInt(vr.lengthSeconds, 10);
                const thumb = vr.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
                const track: StreamTrackMetadata = {
                  id: `yt:${videoId}`,
                  title: vTitle,
                  artist,
                  album: title,
                  duration: !isNaN(durSec) && durSec > 0 ? durSec : undefined,
                  artworkUrl: thumb,
                  coverUrl: thumb,
                  source: 'youtube',
                };
                this.registerMetadata(track);
                tracks.push(track);
              }
            } else {
              for (const key of Object.keys(obj)) {
                if (obj[key] && typeof obj[key] === 'object') {
                  extractVideos(obj[key]);
                  if (tracks.length >= limit) break;
                }
              }
            }
          };

          extractVideos(d);
          if (tracks.length > 0) {
            return {
              id: `yt:playlist:${cleanId}`,
              title,
              artist: 'YouTube',
              type: 'playlist',
              source: 'youtube',
              itemCount: tracks.length,
              artworkUrl: tracks[0]?.coverUrl,
              tracks,
            };
          }
        }
      }
    } catch {
      // Parsing fallback failed
    }

    return null;
  }

  /**
   * Resolve Spotify playlist or album into a batch collection of tracks using public embed state.
   */
  async resolveSpotifyCollection(
    type: 'playlist' | 'album',
    id: string,
    limit = 100
  ): Promise<BatchResolvedCollection | null> {
    const cleanId = id.trim();
    if (!cleanId) return null;

    try {
      const embedUrl = `https://open.spotify.com/embed/${type}/${cleanId}`;
      const res = await gatedFetch(embedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: getTimeoutSignal(6000),
      });
      if (res.ok) {
        const html = await res.text();
        let entity: any = null;

        const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (nextDataMatch) {
          try {
            const json = JSON.parse(nextDataMatch[1]);
            entity = json.props?.pageProps?.state?.data?.entity;
          } catch {}
        }

        if (!entity) {
          const initStateMatch = html.match(/<script id="initial-state"[^>]*>([\s\S]*?)<\/script>/);
          if (initStateMatch) {
            try {
              const decoded = typeof atob === 'function'
                ? atob(initStateMatch[1])
                : (globalThis as any).Buffer?.from(initStateMatch[1], 'base64').toString('utf8');
              if (decoded) {
                const json = JSON.parse(decoded);
                entity = json.data?.entity;
              }
            } catch {}
          }
        }

        if (entity && Array.isArray(entity.trackList)) {
          const title = entity.name || entity.title || `Spotify ${type === 'album' ? 'Album' : 'Playlist'}`;
          const artist = entity.subtitle || entity.artists?.[0]?.name || 'Spotify';
          const artworkUrl = entity.coverArt?.sources?.[0]?.url || entity.visualIdentity?.image?.[0]?.url;

          const tracks: StreamTrackMetadata[] = [];
          for (const item of entity.trackList) {
            const trackId = item.uri
              ? String(item.uri).replace('spotify:track:', '')
              : (item.id || crypto.randomUUID());
            const trackTitle = item.title || 'Unknown Title';
            const trackArtist = item.subtitle || artist || 'Spotify Artist';
            const duration = typeof item.duration === 'number' && item.duration > 0
              ? Math.round(item.duration / 1000)
              : undefined;
            const previewUrl = safeHttpsUrl(item.audioPreview?.url);

            const track: StreamTrackMetadata = {
              id: `sp:${trackId}`,
              title: trackTitle,
              artist: trackArtist,
              album: title,
              duration,
              artworkUrl,
              coverUrl: artworkUrl,
              source: 'spotube',
              previewUrl,
            };
            this.registerMetadata(track);
            tracks.push(track);
            if (tracks.length >= limit) break;
          }

          return {
            id: `sp:${type}:${cleanId}`,
            title,
            artist,
            type,
            source: 'spotify',
            itemCount: tracks.length,
            artworkUrl,
            tracks,
          };
        }
      }
    } catch {
      // Embed fetch error
    }

    // Fallback: search for album by query
    if (type === 'album') {
      try {
        const candidates = await this.searchTracks(cleanId, { limit });
        if (candidates.length > 0) {
          return {
            id: `sp:album:${cleanId}`,
            title: candidates[0].album || 'Album',
            artist: candidates[0].artist,
            type: 'album',
            source: 'spotify',
            itemCount: candidates.length,
            artworkUrl: candidates[0].artworkUrl,
            tracks: candidates,
          };
        }
      } catch {}
    }

    return null;
  }

  /**
   * Unified batch URL resolver: parses YouTube playlist URLs or Spotify playlist/album URLs
   * and extracts track metadata.
   */
  async resolveBatchUrl(url: string, limit = 100): Promise<BatchResolvedCollection | null> {
    const parsed = parsePlaylistOrAlbumUrl(url);
    if (!parsed) return null;

    if (parsed.platform === 'youtube' && parsed.type === 'playlist') {
      return this.resolveYouTubePlaylist(parsed.id, limit);
    }

    if (parsed.platform === 'spotify') {
      return this.resolveSpotifyCollection(parsed.type, parsed.id, limit);
    }

    return null;
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

    // A pasted link is resolved, never searched as text.
    if (/^https?:\/\//i.test(q) || parseYouTubeVideoId(q)) {
      const batch = await this.resolveBatchUrl(q, limit).catch(() => null);
      if (batch && batch.tracks.length > 0) return batch.tracks;
      const direct = await this.resolveDirectUrl(q);
      return direct ? [direct.track] : [];
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
    const seenIds = new Set<string>();
    const add = (t: StreamTrackMetadata | undefined) => {
      if (t && merged.length < limit && !seenIds.has(t.id)) { seenIds.add(t.id); merged.push(t); }
    };
    const maxLen = Math.max(ytItems.length, spItems.length, abItems.length);
    for (let i = 0; i < maxLen; i++) {
      add(spItems[i]);
      add(ytItems[i]);
      add(abItems[i]);
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
      const safe = safeHttpsUrl(streamBlobOrUrl);
      if (!safe) throw Error('Stream audio must be an https URL.');
      if (safe === safeHttpsUrl(track.previewUrl)) throw new StreamResolutionError('preview-only', PREVIEW_ONLY_MESSAGE);
      if (needsRustFetch(safe)) {
        // Desktop: the CSP does not allow this host for fetch(); Rust downloads it (audio content types only).
        if (!onlineLookupsEnabled()) throw new Error(ONLINE_LOOKUPS_OFF);
        blob = await loadRemoteAudio(safe);
      } else {
        const res = await gatedFetch(safe);
        if (!res.ok) throw Error(`Stream audio download failed (${res.status})`);
        if (!isAudioContentType(res.headers.get('content-type'))) throw new StreamResolutionError('not-audio', NOT_AUDIO_MESSAGE);
        blob = await res.blob();
      }
    } else {
      blob = streamBlobOrUrl;
    }
    if (!isAudioContentType(blob.type)) throw new StreamResolutionError('not-audio', NOT_AUDIO_MESSAGE);

    const audioTrack: AudioTrack = {
      id: 'stream:' + track.id,
      title: track.title,
      artist: track.artist,
      name: track.title,
      album: track.album || (track.source === 'audiobook' ? 'Audiobook' : 'Streaming'),
      kind: track.source === 'audiobook' ? 'audiobook' : 'music',
      blob,
      streamUrl: safeHttpsUrl(track.streamUrl),
      coverUrl: safeHttpsUrl(track.coverUrl) || safeHttpsUrl(track.artworkUrl),
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

export async function resolveBatchUrl(
  url: string,
  limit = 100
): Promise<BatchResolvedCollection | null> {
  return streamService.resolveBatchUrl(url, limit);
}

export async function resolveYouTubePlaylist(
  playlistId: string,
  limit = 100
): Promise<BatchResolvedCollection | null> {
  return streamService.resolveYouTubePlaylist(playlistId, limit);
}

export async function resolveSpotifyCollection(
  type: 'playlist' | 'album',
  id: string,
  limit = 100
): Promise<BatchResolvedCollection | null> {
  return streamService.resolveSpotifyCollection(type, id, limit);
}
