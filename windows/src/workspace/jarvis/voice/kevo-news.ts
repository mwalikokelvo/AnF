/**
 * Kevo News: top headlines from a free public RSS feed (BBC or similar, no key).
 * "What's the news", "headlines".
 */

import { onlineGet, type LookupFetch } from './kevo-online';

export async function getHeadlines(fetchFn?: LookupFetch): Promise<string[]> {
  const url = 'https://feeds.bbci.co.uk/news/rss.xml';
  const res = await onlineGet(url, 'the news service', fetchFn);
  if (!res.ok) throw new Error('news service unavailable');
  const text = await res.text();
  const titles: string[] = [];
  const re = /<title>([^<]+)<\/title>/g;
  let m;
  let count = 0;
  while ((m = re.exec(text)) && count < 5) {
    const title = m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    if (title && !title.includes('BBC News') && title.length > 10) {
      titles.push(title);
      count++;
    }
  }
  return titles;
}

export function formatHeadlines(titles: string[]): string {
  if (!titles.length) return 'No headlines available right now.';
  return 'Top headlines: ' + titles.slice(0, 3).join('. ') + '.';
}
