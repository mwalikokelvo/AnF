/** Podcast subscriptions via RSS. Substack and Catholic Answers are first-class patterns. */
import type { AudioTrack } from './audio-library';

export type EpisodeDownloadStatus = 'none' | 'downloading' | 'downloaded' | 'error';

export interface PodcastEpisode {
  id: string;
  feedUrl: string;
  title: string;
  summary: string;
  audioUrl: string;
  localAudioPath?: string;
  localTrackId?: string;
  duration?: number;
  published?: string;
  played: boolean;
  playbackPosition: number;
  downloadStatus: EpisodeDownloadStatus;
  enclosureLength?: number;
  enclosureType?: string;
  image?: string;
  episodeNo?: number;
  seasonNo?: number;
  link?: string;
}

export interface PodcastFeed {
  id: string;
  title: string;
  url: string;
  description?: string;
  image?: string;
  link?: string;
  author?: string;
  episodes: PodcastEpisode[];
  updated: number;
}

export interface PodcastManager {
  subscribe(feedUrl: string): Promise<PodcastFeed>;
  refreshFeeds(): Promise<void>;
  downloadEpisode(episodeId: string): Promise<void>;
  updatePlaybackPosition(episodeId: string, position: number): Promise<void>;
}

const KEY = 'anf-podcast-feeds';
const EPISODE_STATE_KEY = 'anf-podcast-episode-states';

export type EpisodeState = {
  position?: number;
  played?: boolean;
  downloadStatus?: EpisodeDownloadStatus;
  localTrackId?: string;
  updated?: number;
  lastUpdated?: number;
};

export type EpisodeStateRecord = Record<string, EpisodeState>;

export function loadEpisodeStates(): EpisodeStateRecord {
  try {
    const raw = JSON.parse(localStorage.getItem(EPISODE_STATE_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export function saveEpisodeStates(states: EpisodeStateRecord): void {
  try {
    localStorage.setItem(EPISODE_STATE_KEY, JSON.stringify(states));
  } catch {
    // Non-fatal if storage full
  }
}

export function saveEpisodeState(episodeId: string, patch: Partial<EpisodeState>): void {
  const states = loadEpisodeStates();
  const current = states[episodeId] || { position: 0, played: false, updated: Date.now() };
  states[episodeId] = {
    ...current,
    ...patch,
    updated: Date.now(),
    lastUpdated: Date.now(),
  };
  saveEpisodeStates(states);
}

export function getEpisodeState(episodeId: string): { position: number; played: boolean; downloadStatus?: EpisodeDownloadStatus; localTrackId?: string } {
  const states = loadEpisodeStates();
  const found = states[episodeId];
  return found
    ? { position: found.position || 0, played: !!found.played, downloadStatus: found.downloadStatus, localTrackId: found.localTrackId }
    : { position: 0, played: false };
}

export function updateEpisodePosition(episodeId: string, position: number): void {
  saveEpisodeState(episodeId, { position: Math.max(0, position) });
}

export function markEpisodePlayed(episodeId: string, played: boolean): void {
  saveEpisodeState(episodeId, { played });
}

export function loadFeeds(): PodcastFeed[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    const states = loadEpisodeStates();
    const feeds = Array.isArray(raw) ? raw.filter(isFeed) : [];
    // Hydrate episode states
    for (const f of feeds) {
      for (const ep of f.episodes) {
        const s = states[ep.id];
        if (s) {
          if (typeof s.position === 'number') ep.playbackPosition = s.position;
          if (typeof s.played === 'boolean') ep.played = s.played;
          if (s.downloadStatus) ep.downloadStatus = s.downloadStatus;
          if (s.localTrackId) ep.localTrackId = s.localTrackId;
        }
      }
    }
    return feeds;
  } catch {
    return [];
  }
}

export function saveFeeds(feeds: PodcastFeed[]): void {
  localStorage.setItem(KEY, JSON.stringify(feeds.slice(0, 40)));
}

function isFeed(value: unknown): value is PodcastFeed {
  if (!value || typeof value !== 'object') return false;
  const v = value as PodcastFeed;
  return typeof v.id === 'string' && typeof v.url === 'string' && Array.isArray(v.episodes);
}

/** Normalize a Substack publication URL to its feed. */
export function substackFeedUrl(input: string): string | undefined {
  try {
    const u = new URL(input.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    if (!/\.substack\.com$/i.test(u.hostname) && u.hostname !== 'substack.com') return undefined;
    if (u.pathname.endsWith('/feed')) return u.href;
    return `${u.origin}/feed`;
  } catch {
    return undefined;
  }
}

export function parseDuration(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const clean = value.trim();
  if (!clean) return undefined;
  if (/^\d+(\.\d+)?$/.test(clean)) {
    const num = Math.round(Number(clean));
    return num >= 0 ? num : undefined;
  }
  const rawParts = clean.split(':');
  if (rawParts.length < 2 || rawParts.length > 3) return undefined;
  if (rawParts.some(p => p.trim() !== '' && !/^\d+(\.\d+)?$/.test(p.trim()))) return undefined;
  const parts = rawParts.map(p => Number(p.trim()));
  if (parts.some(n => !Number.isFinite(n) || n < 0)) return undefined;
  return parts.reduce((total, part) => total * 60 + Math.round(part), 0);
}

export function parseRss(xml: string, feedUrl: string): PodcastFeed {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const channel = doc.querySelector('channel');
  const title = text(channel, 'title') || new URL(feedUrl).hostname;
  const description = strip(text(channel, 'description') || text(channel, 'itunes\\:summary') || '');
  const image = channel?.querySelector('image url')?.textContent?.trim()
    || channel?.querySelector('itunes\\:image, image')?.getAttribute('href')
    || undefined;
  const link = text(channel, 'link') || undefined;
  const author = text(channel, 'itunes\\:author') || text(channel, 'author') || undefined;

  const states = loadEpisodeStates();
  const episodes: PodcastEpisode[] = [];

  doc.querySelectorAll('item').forEach((item, index) => {
    const enclosure = item.querySelector('enclosure');
    const audioUrl = enclosure?.getAttribute('url') || '';
    if (!audioUrl) return;

    const lengthAttr = enclosure?.getAttribute('length');
    const enclosureLength = lengthAttr && /^\d+$/.test(lengthAttr.trim()) ? Number(lengthAttr.trim()) : undefined;
    const enclosureType = enclosure?.getAttribute('type')?.trim() || undefined;

    const durationRaw = text(item, 'itunes\\:duration') || text(item, 'duration');
    const guid = text(item, 'guid') || `${feedUrl}#${index}`;
    const epImage = item.querySelector('itunes\\:image, image')?.getAttribute('href') || image;
    const epNo = parseInt(text(item, 'itunes\\:episode'), 10);
    const seasonNo = parseInt(text(item, 'itunes\\:season'), 10);

    const state = states[guid] || {};

    episodes.push({
      id: guid,
      feedUrl,
      title: text(item, 'title') || `Episode ${index + 1}`,
      summary: strip(text(item, 'description') || text(item, 'itunes\\:summary') || text(item, 'content\\:encoded') || ''),
      audioUrl,
      duration: parseDuration(durationRaw),
      published: text(item, 'pubDate') || undefined,
      played: Boolean(state.played),
      playbackPosition: typeof state.position === 'number' ? state.position : 0,
      downloadStatus: (state.downloadStatus as EpisodeDownloadStatus) || 'none',
      localTrackId: state.localTrackId,
      enclosureLength,
      enclosureType,
      image: epImage,
      episodeNo: Number.isFinite(epNo) ? epNo : undefined,
      seasonNo: Number.isFinite(seasonNo) ? seasonNo : undefined,
      link: text(item, 'link') || undefined,
    });
  });

  return {
    id: feedUrl,
    title,
    url: feedUrl,
    description,
    image,
    link,
    author,
    episodes: episodes.slice(0, 300),
    updated: Date.now(),
  };
}

function text(parent: Element | null | undefined, selector: string): string {
  return parent?.querySelector(selector)?.textContent?.trim() || '';
}

function strip(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
}

/** Download a podcast episode audio enclosure and save it directly into the local audio library */
export async function downloadPodcastEnclosure(
  library: { put: (track: AudioTrack) => Promise<void>; remove?: (id: string) => Promise<void> },
  episode: PodcastEpisode,
  feedTitle?: string
): Promise<AudioTrack> {
  saveEpisodeState(episode.id, { downloadStatus: 'downloading' });
  try {
    const res = await fetch(episode.audioUrl);
    if (!res.ok) throw Error(`Failed to download podcast audio (${res.status})`);
    const blob = await res.blob();
    const trackId = 'podcast:' + episode.id;

    const track: AudioTrack = {
      id: trackId,
      title: episode.title,
      artist: feedTitle || 'Podcast',
      name: episode.title,
      album: feedTitle || 'Podcast',
      blob,
      created: Date.now(),
      duration: episode.duration,
      kind: 'podcast',
      format: episode.enclosureType || blob.type || 'audio/mpeg',
    };

    await library.put(track);
    episode.downloadStatus = 'downloaded';
    episode.localTrackId = trackId;
    saveEpisodeState(episode.id, { downloadStatus: 'downloaded', localTrackId: trackId });
    return track;
  } catch (err) {
    episode.downloadStatus = 'error';
    saveEpisodeState(episode.id, { downloadStatus: 'error' });
    throw err;
  }
}

export async function removeDownloadedPodcast(
  library: { remove: (id: string) => Promise<void> },
  episodeId: string
): Promise<void> {
  const state = loadEpisodeStates()[episodeId];
  const trackId = state?.localTrackId || ('podcast:' + episodeId);
  await library.remove(trackId);
  saveEpisodeState(episodeId, { downloadStatus: 'none', localTrackId: undefined });
}

type AndroidBridge = { fetchRss?: (id: string, url: string) => void };

export async function fetchFeed(url: string): Promise<PodcastFeed> {
  const xml = await fetchFeedText(url);
  return parseRss(xml, url);
}

async function fetchFeedText(url: string): Promise<string> {
  const bridge = (window as unknown as { AnFAndroid?: AndroidBridge }).AnFAndroid;
  if (bridge?.fetchRss) {
    return new Promise((resolve, reject) => {
      const id = String(Date.now());
      const win = window as unknown as { coucouFeedResult?: (id: string, text: string, error: string) => void };
      win.coucouFeedResult = (rid, text, error) => {
        if (rid !== id) return;
        if (error) reject(Error(error));
        else resolve(text);
      };
      try { bridge.fetchRss!(id, url); }
      catch (e) { reject(e instanceof Error ? e : Error('Native feed fetch failed.')); }
    });
  }
  try {
    const response = await fetch(url);
    if (!response.ok) throw Error(`Feed request failed (${response.status}).`);
    return await response.text();
  } catch {
    throw Error('Could not load that feed. On Android the next build can fetch it natively. On desktop, the feed may block browser requests — try the direct /feed URL.');
  }
}
