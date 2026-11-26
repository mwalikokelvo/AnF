/**
 * Kevo News: short headlines from a free public RSS feed (BBC News).
 * No key, local parsing. Inspired by assistant news briefings.
 */

export interface NewsItem {
  title: string;
  summary?: string;
}

export async function getTopNews(limit = 3): Promise<NewsItem[]> {
  try {
    const res = await fetch('https://feeds.bbci.co.uk/news/rss.xml');
    if (!res.ok) return [];
    const text = await res.text();
    const items: NewsItem[] = [];
    const titleRe = /<title>([^<]+)<\/title>/g;
    let m;
    let count = 0;
    while ((m = titleRe.exec(text)) && count < limit + 1) { // skip channel title
      if (count > 0) items.push({ title: m[1].replace(/&/g, '&').replace(/&#39;/g, "'") });
      count++;
    }
    return items.slice(0, limit);
  } catch {
    return [];
  }
}

export function formatNews(items: NewsItem[]): string {
  if (!items.length) return 'I could not fetch the news right now.';
  return 'Here are the top headlines: ' + items.map(i => i.title).join('. ') + '.';
}
