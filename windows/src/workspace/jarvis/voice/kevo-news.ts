/**
 * News headlines for Kevo from public RSS feeds.
 * Uses BBC World News RSS (no key, public). Only the request is sent; nothing private.
 * Inspired by voice assistants that surface daily news without proprietary APIs.
 */

import { onlineGet, type LookupFetch } from './kevo-online';

export interface NewsItem {
  title: string;
  description?: string;
}

/** "news", "headlines", "what's in the news", "top stories" */
export function isNewsRequest(lower: string): boolean {
  const said = lower.replace(/^(kevo|hey kevo|jarvis)\s*/i, '').trim();
  return /^(?:(?:top |latest |world )?news|headlines|what(?:'s| is) in the news|top stories|news headlines)$/.test(said);
}

export async function topNews(fetchFn?: LookupFetch): Promise<string | null> {
  const res = await onlineGet(
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'BBC News',
    fetchFn,
    undefined,
    2000
  );
  if (!res.ok) throw new Error(`News feed answered ${res.status}.`);
  const text = await res.text();
  // Simple RSS title extraction (no full parser dependency)
  const titles = [...text.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)]
    .slice(1, 4) // skip channel title
    .map(m => m[1].replace(/&/g, '&').trim());
  if (!titles.length) return null;
  return 'Top stories: ' + titles.join('. ') + '.';
}
