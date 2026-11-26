/**
 * Free news headlines for Kevo via public RSS (BBC World News).
 * No API key. Parses the top items offline after fetch.
 * Nothing is stored; results are spoken and discarded.
 */

export interface NewsItem {
  title: string;
  description?: string;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`News feed returned ${res.status}`);
  return res.text();
}

function parseRss(xml: string, limit = 3): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) && items.length < limit) {
    const block = m[1];
    const title = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(block)?.[1]?.trim() || '';
    const desc = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i.exec(block)?.[1]?.trim() || '';
    if (title) items.push({ title, description: desc.replace(/<[^>]+>/g, '').slice(0, 120) });
  }
  return items;
}

export async function topHeadlines(limit = 3): Promise<string> {
  try {
    const xml = await fetchText('https://feeds.bbci.co.uk/news/world/rss.xml');
    const items = parseRss(xml, limit);
    if (!items.length) return 'I could not find any headlines right now.';
    const lines = items.map((it, i) => `${i + 1}. ${it.title}${it.description ? ': ' + it.description : ''}`);
    return `Here are the top world headlines: ${lines.join(' ')}`;
  } catch (err) {
    return `I could not reach the news feed: ${String(err).replace(/^Error:\s*/, '')}`;
  }
}

export function isNewsRequest(text: string): boolean {
  return /\b(?:news|headlines|what(?:'s| is) happening|current events)\b/i.test(text) && !/\bweather\b/i.test(text);
}
