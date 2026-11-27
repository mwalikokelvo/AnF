/**
 * Kevo News: top stories via free no-key sources.
 * Uses Hacker News top stories for tech (Algolia API, no key) and a simple RSS fallback idea.
 * Inspired by voice assistants' "what's the news" / "news briefing".
 * Observable behavior recovered from public docs: trigger on "news"/"headlines", return 3-5 titles + sources.
 */

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  points?: number;
}

const HN_TOP = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const HN_ITEM = (id: number) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;

export async function getTopNews(limit = 5): Promise<NewsItem[] | { error: string }> {
  try {
    const res = await fetch(HN_TOP);
    if (!res.ok) return { error: 'News service unavailable' };
    const ids: number[] = await res.json();
    const top = ids.slice(0, limit);
    const items = await Promise.all(
      top.map(async (id) => {
        const itemRes = await fetch(HN_ITEM(id));
        if (!itemRes.ok) return null;
        const item = await itemRes.json();
        return {
          title: item.title || 'Untitled',
          url: item.url || `https://news.ycombinator.com/item?id=${id}`,
          source: 'Hacker News',
          points: item.score,
        } as NewsItem;
      })
    );
    return items.filter((x): x is NewsItem => x !== null);
  } catch (err) {
    return { error: String(err) };
  }
}

export function formatNews(items: NewsItem[]): string {
  if (!items.length) return 'No news available right now.';
  const lines = items.map((item, i) => `${i + 1}. ${item.title} (${item.source}${item.points ? `, ${item.points} points` : ''}).`);
  return `Top stories: ${lines.join(' ')}`;
}
