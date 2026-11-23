/**
 * Top news headlines for Kevo, from the free BBC News RSS (no key). Only the request is sent.
 * Uses the shared online lookups switch.
 */

import { onlineGet, type LookupFetch } from './kevo-online';

/** "news", "headlines", "what's in the news", "top stories", with or without "please" or "kevo". */
export function isNewsRequest(lower: string): boolean {
  const said = lower
    .replace(/[.!?]+$/, '')
    .trim()
    .replace(/^kevo[\s,]+/, '')
    .replace(/^(?:(?:can|could|would|will) you(?: please)?|please)[\s,]+/, '')
    .replace(/[\s,]+(?:please|kevo)$/, '');
  return /^(?:(?:top |latest )?(?:news|headlines|stories)|what(?:'s| is) (?:in the )?news|tell me the news)$/.test(said);
}

/**
 * Three short headlines as plain text. Throws when the service does not answer within 3 seconds.
 */
export async function fetchHeadlines(fetchFn?: LookupFetch, timeoutMs = 3000): Promise<string> {
  const url = 'https://api.rss2json.com/v1/api.json?rss_url=https://feeds.bbci.co.uk/news/rss.xml&count=3';
  const res = await onlineGet(url, 'the news service', fetchFn, undefined, timeoutMs);
  if (!res.ok) throw new Error(`the news service answered ${res.status}.`);
  const data = (await res.json()) as { items?: Array<{ title?: string }> };
  const titles = (data.items ?? []).map(i => (i.title ?? '').trim()).filter(Boolean).slice(0, 3);
  if (!titles.length) throw new Error('the news service sent no headlines.');
  return `Top stories: ${titles.join('. ')}.`;
}
