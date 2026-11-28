/**
 * Kevo News: Daily headlines from free public RSS feeds (BBC World).
 * No API key required. Fetches and parses simple RSS for top stories.
 */

const BBC_WORLD_RSS = 'https://feeds.bbci.co.uk/news/world/rss.xml';

export async function fetchTopHeadlines(count = 3): Promise<string[]> {
  try {
    const res = await fetch(BBC_WORLD_RSS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const titles: string[] = [];
    const re = /<title>([^<]+)<\/title>/g;
    let m;
    while ((m = re.exec(text)) && titles.length < count + 1) {
      const t = m[1].trim();
      if (t && !t.includes('BBC') && t.length > 10) titles.push(t);
    }
    return titles.slice(0, count);
  } catch (e) {
    console.error('News fetch failed', e);
    return [];
  }
}

export function formatHeadlines(headlines: string[]): string {
  if (!headlines.length) return 'I could not fetch the news right now.';
  return 'Top world headlines: ' + headlines.map((h, i) => `${i + 1}. ${h}`).join('. ') + '.';
}
