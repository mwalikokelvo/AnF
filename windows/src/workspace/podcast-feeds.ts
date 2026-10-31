/** Podcast subscriptions via RSS. Substack and Catholic Answers are first-class patterns. */
import type { AudioTrack } from './audio-library';

export type PodcastEpisode = {
  id: string;
  title: string;
  summary: string;
  audioUrl: string;
  duration?: number;
  published?: string;
  feedUrl?: string;
  played?: boolean;
  playbackPosition?: number;
  downloadStatus?: 'none' | 'downloading' | 'downloaded' | 'error';
  enclosureLength?: number;
  enclosureType?: string;
  image?: string;
  episodeNo?: number;
  seasonNo?: number;
};

export type PodcastFeed = {
  id: string;
  title: string;
  url: string;
  image?: string;
  episodes: PodcastEpisode[];
  updated: number;
};

const KEY = 'anf-podcast-feeds';
const EPISODE_STATE_KEY = 'anf-podcast-episode-states';

type EpisodeStateRecord = Record<string, { position: number; played: boolean; updated: number }>;

function loadEpisodeStates(): EpisodeStateRecord {
  try {
    const raw = JSON.parse(localStorage.getItem(EPISODE_STATE_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function saveEpisodeStates(states: EpisodeStateRecord) {
  try {
    localStorage.setItem(EPISODE_STATE_KEY, JSON.stringify(states));
  } catch {
    // Non-fatal if storage full
  }
}

export function getEpisodeState(episodeId: string): { position: number; played: boolean } {
  const states = loadEpisodeStates();
  const found = states[episodeId];
  return found ? { position: found.position || 0, played: !!found.played } : { position: 0, played: false };
}

export function updateEpisodePosition(episodeId: string, position: number): void {
  const states = loadEpisodeStates();
  const current = states[episodeId] || { position: 0, played: false, updated: Date.now() };
  current.position = Math.max(0, position);
  current.updated = Date.now();
  states[episodeId] = current;
  saveEpisodeStates(states);
}

export function markEpisodePlayed(episodeId: string, played: boolean): void {
  const states = loadEpisodeStates();
  const current = states[episodeId] || { position: 0, played: false, updated: Date.now() };
  current.played = played;
  current.updated = Date.now();
  states[episodeId] = current;
  saveEpisodeStates(states);
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
          ep.playbackPosition = s.position;
          ep.played = s.played;
        }
      }
    }
    return feeds;
  } catch {
    return [];
  }
}

export function saveFeeds(feeds: PodcastFeed[]) {
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

export function parseRss(xml: string, feedUrl: string): PodcastFeed {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const channel = doc.querySelector('channel');
  const title = text(channel, 'title') || new URL(feedUrl).hostname;
  const image = channel?.querySelector('image url')?.textContent?.trim()
    || channel?.querySelector('itunes\\:image, image')?.getAttribute('href')
    || undefined;
  const episodes: PodcastEpisode[] = [];
  const states = loadEpisodeStates();

  doc.querySelectorAll('item').forEach((item, index) => {
    const enclosure = item.querySelector('enclosure');
    const audioUrl = enclosure?.getAttribute('url') || '';
    if (!audioUrl) return;
    const durationRaw = text(item, 'itunes\\:duration') || text(item, 'duration');
    const epId = text(item, 'guid') || `${feedUrl}#${index}`;
    const state = states[epId];
    const epNum = parseInt(text(item, 'itunes\\:episode'), 10);
    const seasonNum = parseInt(text(item, 'itunes\\:season'), 10);

    episodes.push({
      id: epId,
      feedUrl,
      title: text(item, 'title') || `Episode ${index + 1}`,
      summary: strip(text(item, 'description') || text(item, 'itunes\\:summary') || ''),
      audioUrl,
      duration: parseDuration(durationRaw),
      published: text(item, 'pubDate') || undefined,
      enclosureLength: Number(enclosure?.getAttribute('length')) || undefined,
      enclosureType: enclosure?.getAttribute('type') || undefined,
      image: item.querySelector('itunes\\:image, image')?.getAttribute('href') || image,
      episodeNo: Number.isFinite(epNum) ? epNum : undefined,
      seasonNo: Number.isFinite(seasonNum) ? seasonNum : undefined,
      playbackPosition: state?.position || 0,
      played: !!state?.played,
      downloadStatus: 'none',
    });
  });

  return { id: feedUrl, title, url: feedUrl, image, episodes: episodes.slice(0, 200), updated: Date.now() };
}

function text(parent: Element | null | undefined, selector: string): string {
  return parent?.querySelector(selector)?.textContent?.trim() || '';
}

function strip(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
}

export function parseDuration(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const clean = value.trim();
  if (!clean) return undefined;
  if (/^\d+(\.\d+)?$/.test(clean)) return Math.round(Number(clean));
  const parts = clean.split(':').map(Number);
  if (parts.some(n => !Number.isFinite(n))) return undefined;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** Download a podcast episode audio enclosure and save it directly into the local audio library */
export async function downloadPodcastEnclosure(
  library: { put: (track: AudioTrack) => Promise<void> },
  episode: PodcastEpisode,
  feedTitle?: string
): Promise<AudioTrack> {
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
  return track;
}

export async function removeDownloadedPodcast(
  library: { remove: (id: string) => Promise<void> },
  episodeId: string
): Promise<void> {
  await library.remove('podcast:' + episodeId);
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
