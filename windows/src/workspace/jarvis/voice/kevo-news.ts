/**
 * Kevo News Headlines — public RSS (BBC World as example).
 * Trigger: "what's in the news", "top headlines"
 * Inputs: optional category
 * Processing: fetch and parse RSS
 * Outputs: 3 top headlines
 * Failure: network → fallback message
 * Differences: no personalized feed, no paid sources, short summaries only.
 */
export async function fetchHeadlines(): Promise<string[]> {
  try {
    const res = await fetch('https://feeds.bbci.co.uk/news/world/rss.xml');
    const text = await res.text();
    // Simple parse for demo
    const titles = [...text.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)].slice(1, 4).map(m => m[1]);
    return titles.length ? titles : ['No headlines available right now.'];
  } catch {
    return ['Could not fetch news, sir.'];
  }
}

export function formatNews(headlines: string[]): string {
  return 'Top headlines: ' + headlines.slice(0, 3).join('. ') + ', sir.';
}
