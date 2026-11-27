/**
 * Kevo News: top headlines from public RSS (BBC World), no key.
 * Matches assistant behavior of reading a short news briefing.
 */
export interface NewsItem { title: string; link: string; }

export async function getTopNews(limit = 5): Promise<{ items: NewsItem[]; error?: string }> {
  try {
    const url = 'https://feeds.bbci.co.uk/news/world/rss.xml';
    const res = await fetch(url);
    if (!res.ok) return { items: [], error: 'News feed unavailable.' };
    const text = await res.text();
    const items: NewsItem[] = [];
    const re = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>/gi;
    let m;
    while ((m = re.exec(text)) && items.length < limit) {
      items.push({ title: m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim(), link: m[2].trim() });
    }
    if (items.length === 0) return { items: [], error: 'No headlines found.' };
    return { items };
  } catch (e) {
    return { items: [], error: `News lookup failed: ${String(e)}` };
  }
}

export function formatNews(result: { items: NewsItem[]; error?: string }): string {
  if (result.error) return result.error;
  return 'Top world headlines: ' + result.items.map((it, i) => `${i + 1}. ${it.title}`).join('. ') + '.';
}
