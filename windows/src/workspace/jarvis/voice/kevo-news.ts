/**
 * Top headlines from BBC News RSS (free, no key, public feed).
 * For "what's the news", "headlines", "news briefing".
 * Only the request is sent; nothing personal.
 */

import { onlineGet, type LookupFetch } from './kevo-online';

export function isNewsRequest(lower: string): boolean {
  const said = lower.replace(/[.!?]+$/, '').trim().replace(/^kevo[\s,]+/, '');
  return /^(?:what'?s the news|news|headlines|news briefing|what'?s happening|top stories|bbc news)$/.test(said);
}

/**
 * Fetch and parse top 3 headlines from BBC News RSS.
 * Throws on network or parse failure so local model can fall back.
 */
export async function fetchHeadlines(fetchFn?: LookupFetch, timeoutMs = 3000): Promise<string> {
  const res = await onlineGet('http://feeds.bbci.co.uk/news/rss.xml', 'BBC News', fetchFn, {}, timeoutMs);
  if (!res.ok) throw new Error(`BBC News answered ${res.status}.`);
  const xml = await res.text();
  const titles: string[] = [];
  const re = /<title>([^<]+)<\/title>/g;
  let m: RegExpExecArray | null;
  // Skip the channel title (first match)
  re.exec(xml);
  while ((m = re.exec(xml)) && titles.length < 3) {
    const title = m[1].replace(/&/g, '&').replace(/</g, '<').trim();
    if (title && !title.toLowerCase().includes('bbc')) titles.push(title);
  }
  if (titles.length === 0) throw new Error('BBC News sent no headlines.');
  return `Top headlines: ${titles.map((t, i) => `${i + 1}. ${t}`).join(' ')}`;
}
