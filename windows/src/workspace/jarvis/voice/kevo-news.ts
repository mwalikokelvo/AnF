/**
 * Top headlines from a free public RSS feed (BBC World News), for "what's in the news".
 * No API key. Requires online lookups on. From Grok research into voice assistants.
 */

import { onlineGet, type LookupFetch } from './kevo-online';
import { bareRequest } from './kevo-fun';

export function isNewsRequest(lower: string): boolean {
  const said = bareRequest(lower);
  return /^(?:what'?s|what is|tell me|give me|read me) (?:the )?(?:top |latest |world )?(?:news|headlines)(?: today)?$|^news(?: headlines)?$|^what'?s happening$/.test(said);
}

/** Parse simple RSS titles. Returns up to 5 titles. */
export async function topHeadlines(fetchFn?: LookupFetch): Promise<string[]> {
  const url = 'https://feeds.bbci.co.uk/news/world/rss.xml';
  const res = await onlineGet(url, 'the news service', fetchFn);
  if (!res.ok) throw new Error(`the news service answered ${res.status}.`);
  const text = await res.text();
  const titles: string[] = [];
  const re = /<title>([^<]+)<\/title>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && titles.length < 6) {
    const t = m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    if (t && !t.includes('BBC') && t.length > 10) titles.push(t);
  }
  return titles.slice(0, 5);
}

export function formatHeadlines(titles: string[]): string {
  if (!titles.length) return 'I could not get the latest headlines, sir.';
  return `Top headlines: ${titles.map((t, i) => `${i + 1}. ${t}`).join('. ')}.`;
}
