/**
 * Top news headlines for Kevo from the free BBC World News RSS feed.
 * No API key, only the public feed URL is requested.
 */

import { bareRequest } from './kevo-fun';
import { onlineGet, type LookupFetch } from './kevo-online';

export function isNewsRequest(lower: string): boolean {
  const said = bareRequest(lower);
  return /^(?:(?:what(?:'s| is) (?:in )?the news|top headlines|news headlines|latest news|world news|tell me the news))$/.test(said);
}

interface RssItem {
  title?: string;
  description?: string;
}

/** Parses a simple RSS <item> list. Limited to avoid heavy XML deps. */
function extractItems(xml: string, max = 5): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) && items.length < max) {
    const block = m[1];
    const title = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(block)?.[1]?.trim();
    const description = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i.exec(block)?.[1]?.trim();
    if (title) items.push({ title: title.replace(/<[^>]+>/g, ''), description: description?.replace(/<[^>]+>/g, '') });
  }
  return items;
}

export async function topHeadlines(fetchFn?: LookupFetch): Promise<string | null> {
  const res = await onlineGet(
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'BBC News',
    fetchFn,
    undefined,
    2000
  );
  if (!res.ok) throw new Error(`the news feed answered ${res.status}.`);
  const xml = await res.text();
  const items = extractItems(xml, 4);
  if (!items.length) return null;
  const spoken = items
    .map((it, i) => `${i + 1}. ${it.title}`)
    .join('. ');
  return spoken.endsWith('.') ? spoken : spoken + '.';
}
