/**
 * Kevo News: Top headlines from free BBC RSS.
 * Uses public RSS feeds – no API key.
 */

export interface NewsItem {
  title: string;
  link: string;
}

export async function getTopNews(limit = 3): Promise<{ speech: string; items: NewsItem[] } | null> {
  try {
    const rssUrl = 'https://feeds.bbci.co.uk/news/rss.xml';
    const res = await fetch(rssUrl);
    if (!res.ok) return null;
    const text = await res.text();
    const titles = [...text.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)].slice(1, limit + 1).map(m => m[1]);
    if (titles.length === 0) return null;
    const items = titles.map(title => ({ title, link: '' }));
    const speech = `Here are the top headlines: ${titles.join('. ')}.`;
    return { speech, items };
  } catch {
    return null;
  }
}
