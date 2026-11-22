/**
 * Kevo News Headlines (free, no-key Actually Relevant API).
 * "what's the news", "news headlines", "tell me the news".
 */

import { onlineGet, type LookupFetch } from './kevo-online';

export interface NewsStory {
  title: string;
  summary?: string;
  url?: string;
}

export function parseNewsRequest(lower: string): boolean {
  const said = lower.replace(/[.!?]+$/, '').trim();
  return /^(?:what(?:'s| is) the news|news headlines?|tell me the news|latest news)$/.test(said);
}

export async function fetchNewsHeadlines(fetchFn?: LookupFetch): Promise<NewsStory[]> {
  const url = 'https://api.actuallyrelevant.news/api/stories?limit=5';
  const res = await onlineGet(url, 'the news service', fetchFn);
  if (!res.ok) throw new Error(`the news service answered ${res.status}.`);
  const data = (await res.json()) as { stories?: Array<{ title: string; summary?: string; url?: string }> };
  return (data.stories || []).slice(0, 5).map(s => ({
    title: s.title,
    summary: s.summary,
    url: s.url,
  }));
}

export function formatNewsReply(stories: NewsStory[]): string {
  if (!stories.length) return 'I could not find any news headlines right now, sir.';
  const lines = stories.map((s, i) => `${i + 1}. ${s.title}`);
  return `Here are the top headlines, sir:\n${lines.join('\n')}`;
}
