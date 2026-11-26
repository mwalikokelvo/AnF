/** Top Hacker News headlines for Kevo. Free, no key. */
export async function getTopNews(limit = 3): Promise<string> {
  try {
    const idsRes = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
    if (!idsRes.ok) return "Could not fetch news.";
    const ids: number[] = await idsRes.json();
    const tops = ids.slice(0, limit);
    const items = await Promise.all(
      tops.map(async (id) => {
        const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        return r.ok ? r.json() : null;
      })
    );
    const titles = items.filter(Boolean).map((i: any) => i.title).filter(Boolean);
    if (!titles.length) return "No headlines available.";
    return "Top stories: " + titles.join(". ") + ".";
  } catch {
    return "News is unavailable right now.";
  }
}
