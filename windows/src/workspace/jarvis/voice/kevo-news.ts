/**
 * Top news headlines for Kevo from the free Hacker News API (no key required).
 * https://github.com/HackerNews/API
 */

export async function getTopNews(limit = 5): Promise<string> {
  try {
    const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    if (!topRes.ok) throw new Error('Failed to fetch top stories');
    const ids: number[] = await topRes.json();
    if (!Array.isArray(ids) || ids.length === 0) return 'No top stories available right now, sir.';

    const stories = await Promise.all(
      ids.slice(0, Math.min(limit, 10)).map(async (id) => {
        try {
          const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
          if (!r.ok) return null;
          return await r.json();
        } catch {
          return null;
        }
      })
    );

    const valid = stories.filter((s) => s && s.title);
    if (valid.length === 0) return 'Could not load any headlines, sir.';

    const lines = valid.map((s, i) => `${i + 1}. ${s.title}`);
    return `Here are the top ${valid.length} stories from Hacker News, sir: ${lines.join('. ')}.`;
  } catch (err: any) {
    return `I could not fetch the news right now, sir. ${err?.message || ''}`.trim();
  }
}
