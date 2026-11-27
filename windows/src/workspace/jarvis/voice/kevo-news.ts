/**
 * Top BBC News headlines for "what's in the news", "news headlines", "top news".
 * Free RSS, no key. Sends nothing about the owner.
 */

import { onlineGet, type LookupFetch } from './kevo-online';

export function isNewsRequest(lower: string): boolean {
  const said = lower.replace(/[.!?]+$/, '').trim().replace(/^kevo[\s,]+/, '');
  return /^(?:what(?:'s| is) (?:in )?the news|news(?: headlines)?|top news|latest news)$/.test(said);
}

export async function fetchNewsHeadlines(count = 3, fetchFn?: LookupFetch): Promise<string> {
  const res = await onlineGet('https://feeds.bbci.co.uk/news/rss.xml', 'BBC News', fetchFn);
  if (!res.ok) throw new Error(`BBC News answered ${res.status}.`);
  const text = await (res as any).text?.() ?? '';
  const titles: string[] = [];
  const re = /<title>([^<]+)<\/title>/g;
  let m: RegExpExecArray | null;
  let skip = true;
  while ((m = re.exec(text)) && titles.length < count) {
    if (skip) { skip = false; continue; }
    const t = m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
    if (t && !t.includes('BBC News')) titles.push(t);
  }
  if (!titles.length) throw new Error('No headlines found.');
  return 'Top headlines: ' + titles.slice(0, count).join('. ');
}
