/**
 * Kevo news headlines from the free BBC World RSS feed.
 * "What's in the news?", "news headlines".
 * Only the public feed is requested.
 */

import { onlineGet, type LookupFetch } from './kevo-online';

export async function fetchHeadlines(limit = 3, fetchFn?: LookupFetch): Promise<string[]> {
  const res = await onlineGet('https://feeds.bbci.co.uk/news/world/rss.xml', 'BBC news', fetchFn, { Accept: 'application/rss+xml' });
  if (!res.ok) throw new Error(`news feed answered ${res.status}`);
  const xml = await res.text();
  const titles: string[] = [];
  const re = /<title>([^<]+)<\/title>/g;
  let m: RegExpExecArray | null;
  // Skip the channel title (first match)
  re.exec(xml);
  while ((m = re.exec(xml)) && titles.length < limit) {
    const title = m[1].replace(/&/g, '&').replace(/</g, '<').trim();
    if (title && !title.includes('BBC News')) titles.push(title);
  }
  return titles;
}

export function formatHeadlines(titles: string[]): string {
  if (!titles.length) return 'I could not get the latest headlines just now.';
  return 'Here are the latest headlines: ' + titles.map((t, i) => `${i + 1}. ${t}`).join('. ') + '.';
}
