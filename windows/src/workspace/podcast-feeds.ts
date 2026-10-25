/** Podcast subscriptions via RSS. Substack and Catholic Answers are first-class patterns. */
export type PodcastEpisode = {
  id: string;
  title: string;
  summary: string;
  audioUrl: string;
  duration?: number;
  published?: string;
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

export function loadFeeds(): PodcastFeed[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(isFeed) : [];
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
  doc.querySelectorAll('item').forEach((item, index) => {
    const enclosure = item.querySelector('enclosure');
    const audioUrl = enclosure?.getAttribute('url') || '';
    if (!audioUrl) return;
    const durationRaw = text(item, 'itunes\\:duration') || text(item, 'duration');
    episodes.push({
      id: text(item, 'guid') || `${feedUrl}#${index}`,
      title: text(item, 'title') || `Episode ${index + 1}`,
      summary: strip(text(item, 'description') || text(item, 'itunes\\:summary') || ''),
      audioUrl,
      duration: parseDuration(durationRaw),
      published: text(item, 'pubDate') || undefined,
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

function parseDuration(value: string): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const parts = value.split(':').map(Number);
  if (parts.some(n => !Number.isFinite(n))) return undefined;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

export async function fetchFeed(url: string): Promise<PodcastFeed> {
  const response = await fetch(url);
  if (!response.ok) throw Error(`Feed request failed (${response.status}).`);
  return parseRss(await response.text(), url);
}
