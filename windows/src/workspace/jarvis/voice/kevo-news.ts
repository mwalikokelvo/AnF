/**
 * Kevo News Headlines (free public RSS, no key).
 * "What's the news?", "news headlines", "top news".
 * Fetches from BBC World News RSS. Nothing stored; one-shot.
 */

import { bareRequest } from './kevo-fun';

export function isNewsRequest(lower: string): boolean {
  return /^(?:what(?:'s| is) the |whats the )?(?:top |latest |world )?news(?: headlines)?(?: today)?$|^news headlines$|^tell me the news$/.test(bareRequest(lower));
}

export async function fetchNewsHeadlines(limit = 3): Promise<string> {
  try {
    const res = await fetch('https://feeds.bbci.co.uk/news/world/rss.xml');
    if (!res.ok) throw new Error('RSS fetch failed');
    const text = await res.text();
    const titles = [...text.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)].slice(1, limit + 1).map(m => m[1].trim());
    if (titles.length === 0) return 'No news headlines available right now.';
    return `Here are the top news headlines: ${titles.map((t, i) => `${i + 1}. ${t}`).join('. ')}.`;
  } catch {
    return 'I could not fetch the news right now. Please try again later.';
  }
}
