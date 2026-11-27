/**
 * Kevo news headlines using the free Hacker News Firebase API.
 * No key. Returns top story titles.
 * Example: "what's in the news" or "top headlines".
 */

import type { LookupFetch } from './kevo-online';
import { onlineGet } from './kevo-online';

export interface NewsHeadline {
  title: string;
  url?: string;
  score?: number;
}

/**
 * Fetches up to `limit` top stories from Hacker News.
 * Uses the public Firebase REST API documented at https://github.com/HackerNews/API.
 */
export async function getTopHeadlines(limit = 3, fetchFn?: LookupFetch): Promise<NewsHeadline[]> {
  const topRes = await onlineGet('https://hacker-news.firebaseio.com/v0/topstories.json', 'the news service', fetchFn);
  if (!topRes.ok) throw new Error(`the news service answered ${topRes.status}.`);
  const ids = (await topRes.json()) as number[];
  if (!Array.isArray(ids)) return [];
  const selected = ids.slice(0, Math.min(limit, 5));
  const stories: NewsHeadline[] = [];
  for (const id of selected) {
    try {
      const itemRes = await onlineGet(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, 'the news service', fetchFn);
      if (!itemRes.ok) continue;
      const item = (await itemRes.json()) as { title?: string; url?: string; score?: number };
      if (item.title) {
        stories.push({ title: item.title, url: item.url, score: item.score });
      }
    } catch {
      /* skip failed item */
    }
  }
  return stories;
}

export function formatHeadlines(headlines: NewsHeadline[]): string {
  if (headlines.length === 0) return 'No headlines available right now.';
  const lines = headlines.map((h, i) => `${i + 1}. ${h.title}${h.score ? ` (${h.score} points)` : ''}`);
  return `Top headlines: ${lines.join('; ')}.`;
}
