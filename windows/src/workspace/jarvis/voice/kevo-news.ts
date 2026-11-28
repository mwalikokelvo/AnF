/**
 * Kevo news briefing from free public RSS feeds (BBC, no API key required).
 * Respects the online lookups switch.
 */

import { ONLINE_LOOKUPS_OFF } from './kevo-online';

export type NewsItem = { title: string };

const BBC_WORLD = 'https://feeds.bbci.co.uk/news/world/rss.xml';
const BBC_TECH = 'https://feeds.bbci.co.uk/news/technology/rss.xml';

/** Parse simple RSS titles from XML text. Skips the channel <title>. */
export function parseRssTitles(xml: string, limit = 5): NewsItem[] {
  const titles: NewsItem[] = [];
  const re = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/gi;
  let m: RegExpExecArray | null;
  re.exec(xml); // skip channel title
  while ((m = re.exec(xml)) && titles.length < limit) {
    const title = (m[1] || '')
      .trim()
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
    if (title.length > 8) titles.push({ title });
  }
  return titles;
}

async function fetchText(url: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchNewsHeadlines(topic: 'world' | 'tech' = 'world'): Promise<string> {
  const url = topic === 'tech' ? BBC_TECH : BBC_WORLD;
  try {
    const xml = await fetchText(url);
    const items = parseRssTitles(xml, 4);
    if (!items.length) return 'No headlines right now, sir.';
    const list = items.map((i, n) => `${n + 1}. ${i.title}`).join('. ');
    return `Here are the latest ${topic} headlines: ${list}.`;
  } catch {
    return 'The news feed did not answer. Check the internet connection, sir.';
  }
}

export function isNewsRequest(lower: string): 'world' | 'tech' | null {
  if (!/\b(?:news|headlines|what'?s (?:in the )?news|latest news|brief me)\b/.test(lower)) return null;
  if (/\b(?:tech|technology|science|digital)\b/.test(lower)) return 'tech';
  return 'world';
}

export const NEWS_OFF = ONLINE_LOOKUPS_OFF;
