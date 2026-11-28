/**
 * Kevo News — top headlines from BBC World RSS (free, no key).
 * Returns 3 short headlines for voice.
 */
export interface NewsItem { title: string; link: string; }
export interface NewsResult { items: NewsItem[]; speech: string; }

export async function getTopNews(limit = 3): Promise<NewsResult | null> {
  const url = 'https://feeds.bbci.co.uk/news/world/rss.xml';
  const res = await fetch(url);
  if (!res.ok) return null;
  const xml = await res.text();
  const titles = [...xml.matchAll(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/g)]
    .map(m => m[1].trim())
    .filter(t => t && !t.startsWith('BBC'))
    .slice(0, limit);
  if (!titles.length) return null;
  const items = titles.map(title => ({ title, link: '' }));
  const speech = `Here are the top world headlines: ${titles.map((t, i) => `${i + 1}. ${t}`).join('. ')}.`;
  return { items, speech };
}
