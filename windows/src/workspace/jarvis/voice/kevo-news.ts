/**
 * Top headlines for Kevo from BBC News RSS. No API key. Parsed lightly for spoken reply.
 */

export async function fetchHeadlines(limit = 3, fetchFn = fetch): Promise<string[]> {
  try {
    const res = await fetchFn('https://feeds.bbci.co.uk/news/rss.xml');
    if (!res.ok) return [];
    const xml = await res.text();
    const titles = [...xml.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)].slice(1, limit + 1).map(m => m[1].trim());
    return titles.filter(Boolean);
  } catch {
    return [];
  }
}

export function isNewsRequest(lower: string): boolean {
  return /^(?:(?:tell|give|what(?:'s| is) the) )?(?:top |latest |current )?(?:news|headlines|news headlines)(?: today)?$/.test(lower.trim());
}

export function formatHeadlines(titles: string[]): string {
  if (!titles.length) return 'I could not fetch the news right now.';
  return `Here are the top headlines: ${titles.map((t, i) => `${i + 1}. ${t}`).join(' ')}`;
}
