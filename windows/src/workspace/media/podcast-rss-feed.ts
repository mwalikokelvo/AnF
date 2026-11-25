export interface PodcastChapter {
  startSeconds: number;
  title: string;
}

export interface PodcastEpisode {
  id: string;
  title: string;
  pubDate: string;
  summary: string;
  durationSeconds: number;
  audioUrl: string;
  chapters: PodcastChapter[];
}

export interface PodcastFeed {
  title: string;
  link: string;
  description: string;
  author: string;
  episodes: PodcastEpisode[];
}

export interface OpmlSubscription {
  text: string;
  title: string;
  xmlUrl: string;
  htmlUrl?: string;
}

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function unescapeXml(value: string): string {
  return value
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m)
    .trim();
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function matchTag(xml: string, tag: string): string {
  const escaped = tag.replace(':', '\\:');
  const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, 'i');
  const m = re.exec(xml);
  return m ? unescapeXml(m[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1')) : '';
}

function matchAttr(tagText: string, attr: string): string {
  const re = new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, 'i');
  const m = re.exec(tagText);
  return m ? unescapeXml(m[1]) : '';
}

export function parseDurationToSeconds(raw: string): number {
  const trimmed = (raw || '').trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

export function parsePodcastRssXml(xml: string): PodcastFeed {
  const channelMatch = /<channel\b[^>]*>([\s\S]*?)<\/channel>/i.exec(xml);
  const channelXml = channelMatch ? channelMatch[1] : xml;
  const headerXml = channelXml.split(/<item\b/i)[0] ?? channelXml;

  const episodes: PodcastEpisode[] = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRe.exec(channelXml)) !== null) {
    const itemXml = itemMatch[1];
    const enclosureMatch = /<enclosure\b([^>]*)\/?>/i.exec(itemXml);
    const audioUrl = enclosureMatch ? matchAttr(enclosureMatch[1], 'url') : '';

    const chapters: PodcastChapter[] = [];
    const chapRe = /<psc:chapter\b([^>]*)\/?>/gi;
    let chapMatch: RegExpExecArray | null;
    while ((chapMatch = chapRe.exec(itemXml)) !== null) {
      const startSeconds = parseDurationToSeconds(matchAttr(chapMatch[1], 'start'));
      const title = matchAttr(chapMatch[1], 'title');
      chapters.push({ startSeconds, title });
    }

    episodes.push({
      id: matchTag(itemXml, 'guid') || audioUrl || matchTag(itemXml, 'title'),
      title: matchTag(itemXml, 'title'),
      pubDate: matchTag(itemXml, 'pubDate'),
      summary: matchTag(itemXml, 'itunes:summary') || matchTag(itemXml, 'description'),
      durationSeconds: parseDurationToSeconds(matchTag(itemXml, 'itunes:duration')),
      audioUrl,
      chapters,
    });
  }

  return {
    title: matchTag(headerXml, 'title'),
    link: matchTag(headerXml, 'link'),
    description: matchTag(headerXml, 'description'),
    author: matchTag(headerXml, 'itunes:author') || matchTag(headerXml, 'author'),
    episodes,
  };
}

export function exportOpmlSubscriptions(subs: OpmlSubscription[], title = 'Podcast Subscriptions'): string {
  const outlines = subs
    .map((s) => {
      const htmlAttr = s.htmlUrl ? ` htmlUrl="${escapeXmlAttr(s.htmlUrl)}"` : '';
      return `    <outline type="rss" text="${escapeXmlAttr(s.text)}" title="${escapeXmlAttr(s.title)}" xmlUrl="${escapeXmlAttr(s.xmlUrl)}"${htmlAttr} />`;
    })
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    `  <head><title>${escapeXmlAttr(title)}</title></head>`,
    '  <body>',
    outlines,
    '  </body>',
    '</opml>',
  ].join('\n');
}

export function parseOpmlSubscriptions(opmlXml: string): OpmlSubscription[] {
  const subs: OpmlSubscription[] = [];
  const outlineRe = /<outline\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = outlineRe.exec(opmlXml)) !== null) {
    const attrs = m[1];
    const xmlUrl = matchAttr(attrs, 'xmlUrl');
    if (!xmlUrl) continue;
    const title = matchAttr(attrs, 'title') || matchAttr(attrs, 'text');
    const text = matchAttr(attrs, 'text') || title;
    const htmlUrl = matchAttr(attrs, 'htmlUrl');
    subs.push(htmlUrl ? { text, title, xmlUrl, htmlUrl } : { text, title, xmlUrl });
  }
  return subs;
}
