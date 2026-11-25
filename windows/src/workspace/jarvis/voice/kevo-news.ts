/**
 * Kevo News: top headlines from a free public RSS feed (BBC World).
 * Inspired by Alexa/Siri news skills. Parses simple XML without external deps.
 * Observable differences: fixed source (BBC), limited to 5 headlines, no personalization or categories beyond world.
 */

export async function getTopNews(limit = 5): Promise<string> {
  const url = 'https://feeds.bbci.co.uk/news/world/rss.xml';
  try {
    const res = await fetch(url);
    if (!res.ok) return 'News service is unavailable right now, sir.';
    const xml = await res.text();
    const titles: string[] = [];
    const re = /<title>([^<]+)<\/title>/g;
    let m: RegExpExecArray | null;
    // Skip the channel title (first match)
    let first = true;
    while ((m = re.exec(xml)) && titles.length < limit) {
      if (first) { first = false; continue; }
      const t = m[1].replace(/&/g, '&').replace(/</g, '<').trim();
      if (t && !t.includes('BBC')) titles.push(t);
    }
    if (!titles.length) return 'I could not find any headlines at the moment, sir.';
    return `Top world headlines: ${titles.map((t, i) => `${i + 1}. ${t}`).join(' ')}, sir.`;
  } catch {
    return 'I could not fetch the news right now, sir.';
  }
}
