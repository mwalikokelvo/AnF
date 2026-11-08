/**
 * Substack-style article frontmatter, publishing workflows, and reading queue.
 */

export interface ArticleMetadata {
  title: string;
  subtitle?: string;
  author?: string;
  date?: string;
  tags?: string[];
  audience?: 'everyone' | 'subscribers' | 'paid';
  canonicalUrl?: string;
  coverImageUrl?: string;
}

export interface Article {
  id: string;
  metadata: ArticleMetadata;
  markdown: string;
  updatedAt: number;
}

export interface ReadingQueueItem {
  id: string;
  title: string;
  source: string;
  url?: string;
  text: string;
  addedAt: number;
  readAt?: number;
  progress: number; // 0.0 to 1.0
  estimatedMinutes: number;
  tags?: string[];
}

const READING_QUEUE_KEY = 'anf-reading-queue';

/**
 * Parse YAML-style frontmatter headers delimited by ---
 */
export function parseFrontmatter(content: string): { metadata: ArticleMetadata; body: string } {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) {
    // Extract first # Heading as title if present
    const firstLine = trimmed.split('\n')[0] || '';
    const titleMatch = /^#\s+(.+)$/.exec(firstLine);
    return {
      metadata: {
        title: titleMatch ? titleMatch[1].trim() : 'Untitled Draft',
      },
      body: content,
    };
  }

  const endMarker = trimmed.indexOf('\n---', 3);
  if (endMarker === -1) {
    return {
      metadata: { title: 'Untitled Draft' },
      body: content,
    };
  }

  const rawHeader = trimmed.slice(3, endMarker).trim();
  const body = trimmed.slice(endMarker + 4).trimStart();
  const metadata: ArticleMetadata = { title: 'Untitled Draft' };

  for (const line of rawHeader.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim();

    if (key === 'title') {
      metadata.title = val.replace(/^["'](.*)["']$/, '$1') || 'Untitled Draft';
    } else if (key === 'subtitle') {
      metadata.subtitle = val.replace(/^["'](.*)["']$/, '$1');
    } else if (key === 'author') {
      metadata.author = val.replace(/^["'](.*)["']$/, '$1');
    } else if (key === 'date') {
      metadata.date = val.replace(/^["'](.*)["']$/, '$1');
    } else if (key === 'canonical_url' || key === 'canonicalurl') {
      metadata.canonicalUrl = val.replace(/^["'](.*)["']$/, '$1');
    } else if (key === 'cover' || key === 'cover_image' || key === 'coverimageurl') {
      metadata.coverImageUrl = val.replace(/^["'](.*)["']$/, '$1');
    } else if (key === 'audience') {
      const aud = val.toLowerCase();
      if (aud === 'subscribers' || aud === 'paid' || aud === 'everyone') {
        metadata.audience = aud;
      }
    } else if (key === 'tags') {
      if (val.startsWith('[') && val.endsWith(']')) {
        metadata.tags = val
          .slice(1, -1)
          .split(',')
          .map(t => t.trim().replace(/^["'](.*)["']$/, '$1'))
          .filter(Boolean);
      } else if (val) {
        metadata.tags = val.split(',').map(t => t.trim()).filter(Boolean);
      }
    }
  }

  return { metadata, body };
}

/** Escape for a double-quoted YAML scalar: backslash first, then quote. */
function yamlEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Serialize metadata into standardized YAML frontmatter format
 */
export function serializeFrontmatter(metadata: ArticleMetadata, body: string): string {
  const lines: string[] = ['---'];
  lines.push(`title: "${yamlEscape(metadata.title)}"`);
  if (metadata.subtitle) lines.push(`subtitle: "${yamlEscape(metadata.subtitle)}"`);
  if (metadata.author) lines.push(`author: "${yamlEscape(metadata.author)}"`);
  if (metadata.date) lines.push(`date: ${metadata.date}`);
  if (metadata.audience) lines.push(`audience: ${metadata.audience}`);
  if (metadata.tags && metadata.tags.length > 0) {
    lines.push(`tags: [${metadata.tags.map(t => `"${t}"`).join(', ')}]`);
  }
  if (metadata.canonicalUrl) lines.push(`canonicalUrl: "${metadata.canonicalUrl}"`);
  if (metadata.coverImageUrl) lines.push(`coverImageUrl: "${metadata.coverImageUrl}"`);
  lines.push('---');
  lines.push('');
  lines.push(body.trimStart());
  return lines.join('\n');
}

/**
 * Generate standalone, self-contained semantic HTML suitable for web publishing or Substack import
 */
export function exportArticleHtml(article: Article): string {
  const { metadata, markdown } = article;
  const escapeHtml = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Simple clean markdown-to-html converter
  const lines = markdown.split('\n');
  const bodyHtml: string[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        bodyHtml.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    if (line.startsWith('# ')) {
      bodyHtml.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    } else if (line.startsWith('## ')) {
      bodyHtml.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith('### ')) {
      bodyHtml.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith('> ')) {
      bodyHtml.push(`<blockquote><p>${escapeHtml(line.slice(2))}</p></blockquote>`);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      bodyHtml.push(`<ul><li>${escapeHtml(line.slice(2))}</li></ul>`);
    } else if (line.trim().length > 0) {
      let formatted = escapeHtml(line);
      formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
      bodyHtml.push(`<p>${formatted}</p>`);
    }
  }

  const tagsHtml = (metadata.tags || [])
    .map(t => `<span class="article-tag">${escapeHtml(t)}</span>`)
    .join(' ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(metadata.title)}</title>
  ${metadata.author ? `<meta name="author" content="${escapeHtml(metadata.author)}">` : ''}
  ${metadata.date ? `<meta name="date" content="${escapeHtml(metadata.date)}">` : ''}
  ${metadata.subtitle ? `<meta name="description" content="${escapeHtml(metadata.subtitle)}">` : ''}
  <meta property="og:title" content="${escapeHtml(metadata.title)}">
  ${metadata.subtitle ? `<meta property="og:description" content="${escapeHtml(metadata.subtitle)}">` : ''}
  <meta property="og:type" content="article">
  ${metadata.canonicalUrl ? `<meta property="og:url" content="${escapeHtml(metadata.canonicalUrl)}"><link rel="canonical" href="${escapeHtml(metadata.canonicalUrl)}">` : ''}
  ${metadata.coverImageUrl ? `<meta property="og:image" content="${escapeHtml(metadata.coverImageUrl)}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
  <meta name="twitter:title" content="${escapeHtml(metadata.title)}">
  ${metadata.subtitle ? `<meta name="twitter:description" content="${escapeHtml(metadata.subtitle)}">` : ''}
  <style>
    :root {
      --measure: 68ch;
      --font-serif: Charter, "Iowan Old Style", "Sitka Text", Palatino, Georgia, serif;
      --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    body {
      margin: 0;
      padding: 40px 20px;
      font-family: var(--font-serif);
      font-size: 20px;
      line-height: 1.68;
      color: #1a1a1a;
      background: #fafafa;
    }
    .article-container {
      max-width: var(--measure);
      margin: 0 auto;
    }
    header.article-header {
      margin-bottom: 40px;
      padding-bottom: 24px;
      border-bottom: 1px solid #e0e0e0;
      font-family: var(--font-sans);
    }
    h1.article-title {
      font-size: 2.2rem;
      line-height: 1.25;
      margin: 0 0 12px 0;
      letter-spacing: -0.02em;
    }
    p.article-subtitle {
      font-size: 1.25rem;
      color: #555;
      margin: 0 0 16px 0;
    }
    .article-byline {
      font-size: 0.95rem;
      color: #777;
    }
    .article-tags {
      margin-top: 12px;
    }
    .article-tag {
      display: inline-block;
      padding: 2px 10px;
      font-size: 0.8rem;
      background: #eef2f0;
      border-radius: 12px;
      margin-right: 6px;
    }
    blockquote {
      margin: 24px 0;
      padding-left: 18px;
      border-left: 3px solid #204a3d;
      font-style: italic;
      color: #333;
    }
    pre {
      background: #f0f0f0;
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <div class="article-container">
    <header class="article-header">
      <h1 class="article-title">${escapeHtml(metadata.title)}</h1>
      ${metadata.subtitle ? `<p class="article-subtitle">${escapeHtml(metadata.subtitle)}</p>` : ''}
      <div class="article-byline">
        ${metadata.author ? `<span>By ${escapeHtml(metadata.author)}</span>` : ''}
        ${metadata.date ? `<span> · ${escapeHtml(metadata.date)}</span>` : ''}
        ${metadata.audience && metadata.audience !== 'everyone' ? `<span> · (${escapeHtml(metadata.audience)} only)</span>` : ''}
      </div>
      ${tagsHtml ? `<div class="article-tags">${tagsHtml}</div>` : ''}
    </header>
    <main class="article-body">
      ${bodyHtml.join('\n      ')}
    </main>
  </div>
</body>
</html>`;
}

/**
 * Generate valid RSS 2.0 XML feed for publishing articles
 */
export function exportArticleRss(
  channel: { title: string; link: string; description: string; author?: string },
  articles: Article[]
): string {
  const escapeXml = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const itemsXml = articles.map(a => {
    const pubDate = a.metadata.date
      ? new Date(a.metadata.date).toUTCString()
      : new Date(a.updatedAt).toUTCString();
    const link = a.metadata.canonicalUrl || `${channel.link.replace(/\/+$/, '')}/p/${encodeURIComponent(a.id)}`;

    return `    <item>
      <title>${escapeXml(a.metadata.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">${escapeXml(a.id)}</guid>
      <pubDate>${pubDate}</pubDate>
      ${a.metadata.author || channel.author ? `<author>${escapeXml(a.metadata.author || channel.author!)}</author>` : ''}
      <description><![CDATA[${a.markdown}]]></description>
    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(channel.link)}</link>
    <description>${escapeXml(channel.description)}</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${itemsXml}
  </channel>
</rss>`;
}

/**
 * Load Reading Queue from persistent storage
 */
export function loadReadingQueue(): ReadingQueueItem[] {
  try {
    const raw = localStorage.getItem(READING_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item => item && typeof item.id === 'string' && typeof item.title === 'string');
  } catch {
    return [];
  }
}

/**
 * Persist Reading Queue to local storage
 */
export function saveReadingQueue(queue: ReadingQueueItem[]): void {
  try {
    const bounded = queue.slice(0, 200);
    localStorage.setItem(READING_QUEUE_KEY, JSON.stringify(bounded));
  } catch {
    // Quota or unavailable
  }
}

/**
 * Add article or note to reading queue
 */
export function addToReadingQueue(
  queue: ReadingQueueItem[],
  item: Omit<ReadingQueueItem, 'id' | 'addedAt' | 'progress' | 'estimatedMinutes'>
): ReadingQueueItem[] {
  const existingIdx = queue.findIndex(q => (item.url && q.url === item.url) || q.title === item.title);
  if (existingIdx !== -1) {
    return queue;
  }

  const words = item.text.trim() ? item.text.trim().split(/\s+/u).length : 0;
  const estimatedMinutes = Math.max(1, Math.ceil(words / 220));

  const newItem: ReadingQueueItem = {
    ...item,
    id: crypto.randomUUID ? crypto.randomUUID() : `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    addedAt: Date.now(),
    progress: 0,
    estimatedMinutes,
  };

  const updated = [newItem, ...queue];
  saveReadingQueue(updated);
  return updated;
}

/**
 * Update reading progress on a queue item
 */
export function updateQueueProgress(
  queue: ReadingQueueItem[],
  id: string,
  progress: number
): ReadingQueueItem[] {
  const clamped = Math.max(0, Math.min(1.0, progress));
  const updated = queue.map(item => {
    if (item.id !== id) return item;
    return {
      ...item,
      progress: clamped,
      readAt: clamped >= 1.0 ? Date.now() : item.readAt,
    };
  });
  saveReadingQueue(updated);
  return updated;
}

/**
 * Remove an item from the reading queue
 */
export function removeFromReadingQueue(queue: ReadingQueueItem[], id: string): ReadingQueueItem[] {
  const updated = queue.filter(item => item.id !== id);
  saveReadingQueue(updated);
  return updated;
}


export interface SeoAuditResult {
  score: number;
  title: string;
  titleStatus: 'good' | 'warning' | 'error';
  titleMessage: string;
  subtitle?: string;
  descriptionStatus: 'good' | 'warning' | 'error';
  descriptionMessage: string;
  headingsCount: { h1: number; h2: number; h3: number };
  headingsStatus: 'good' | 'warning' | 'error';
  headingsMessage: string;
  imagesTotal: number;
  imagesWithAlt: number;
  imagesStatus: 'good' | 'warning';
  imagesMessage: string;
  wordCount: number;
  estimatedMinutes: number;
  suggestions: string[];
}

/**
 * Open-SEO content and metadata audit engine for article publishing.
 */
export function auditSeo(content: string): SeoAuditResult {
  const { metadata, body } = parseFrontmatter(content);
  const suggestions: string[] = [];
  let score = 100;

  const title = metadata.title && metadata.title !== 'Untitled Draft' ? metadata.title.trim() : '';
  let titleStatus: 'good' | 'warning' | 'error' = 'good';
  let titleMessage = 'Title length is optimal for search engine results.';

  if (!title) {
    titleStatus = 'error';
    titleMessage = 'Missing title in frontmatter or # Heading.';
    suggestions.push('Add a descriptive title between 30 and 60 characters.');
    score -= 30;
  } else if (title.length < 20) {
    titleStatus = 'warning';
    titleMessage = `Title is short (${title.length} chars). Aim for 30–60 characters.`;
    suggestions.push('Expand title with key subject keywords.');
    score -= 10;
  } else if (title.length > 65) {
    titleStatus = 'warning';
    titleMessage = `Title is long (${title.length} chars). Search snippets may truncate after 60 chars.`;
    suggestions.push('Shorten title to keep the most important keywords within 60 characters.');
    score -= 10;
  }

  const subtitle = metadata.subtitle?.trim() || '';
  let descriptionStatus: 'good' | 'warning' | 'error' = 'good';
  let descriptionMessage = 'Subtitle/description length is well-suited for search snippets.';

  if (!subtitle) {
    descriptionStatus = 'warning';
    descriptionMessage = 'Missing subtitle or meta description.';
    suggestions.push('Add a subtitle (60–160 characters) summarizing the core insight for search previews.');
    score -= 20;
  } else if (subtitle.length < 50) {
    descriptionStatus = 'warning';
    descriptionMessage = `Subtitle is brief (${subtitle.length} chars). 70–160 characters provides better search snippets.`;
    suggestions.push('Expand subtitle with more context for readers.');
    score -= 10;
  } else if (subtitle.length > 170) {
    descriptionStatus = 'warning';
    descriptionMessage = `Subtitle is long (${subtitle.length} chars) and may be truncated in search results.`;
    score -= 5;
  }

  let h1Count = title ? 1 : 0;
  let h2Count = 0;
  let h3Count = 0;
  for (const line of body.split('\n')) {
    if (/^#\s+/.test(line)) h1Count++;
    else if (/^##\s+/.test(line)) h2Count++;
    else if (/^###\s+/.test(line)) h3Count++;
  }

  let headingsStatus: 'good' | 'warning' | 'error' = 'good';
  let headingsMessage = 'Heading structure is clear and well-ordered.';

  if (h1Count === 0) {
    headingsStatus = 'error';
    headingsMessage = 'No H1 heading found.';
    suggestions.push('Include a single clear H1 heading for the article.');
    score -= 20;
  } else if (h1Count > 1) {
    headingsStatus = 'warning';
    headingsMessage = `Found ${h1Count} H1 headings. Search engines prefer exactly one H1 per page.`;
    suggestions.push('Convert secondary H1 headings into H2 subsections.');
    score -= 10;
  }

  if (h2Count === 0 && body.length > 600) {
    headingsStatus = 'warning';
    headingsMessage = 'No H2 section headings found in long text.';
    suggestions.push('Organize content into H2 sections (## Section) to improve readability.');
    score -= 10;
  }

  const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
  let imagesTotal = 0;
  let imagesWithAlt = 0;
  let match: RegExpExecArray | null;
  while ((match = imageRegex.exec(body)) !== null) {
    imagesTotal++;
    if (match[1].trim().length > 0) {
      imagesWithAlt++;
    }
  }

  let imagesStatus: 'good' | 'warning' = 'good';
  let imagesMessage = imagesTotal === 0 ? 'No images embedded.' : `${imagesWithAlt} of ${imagesTotal} images have descriptive alt text.`;
  if (imagesTotal > 0 && imagesWithAlt < imagesTotal) {
    imagesStatus = 'warning';
    const missing = imagesTotal - imagesWithAlt;
    imagesMessage = `${missing} image${missing > 1 ? 's are' : ' is'} missing alt text for screen readers and SEO.`;
    suggestions.push('Add alt text to images: ![description](url).');
    score -= Math.min(15, missing * 5);
  }

  const wordCount = body.trim() ? body.trim().split(/\s+/u).length : 0;
  const estimatedMinutes = Math.max(1, Math.ceil(wordCount / 220));

  if (wordCount < 150) {
    suggestions.push('Short article (< 150 words). Search engines rank in-depth answers higher.');
    score -= 15;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    title,
    titleStatus,
    titleMessage,
    subtitle: subtitle || undefined,
    descriptionStatus,
    descriptionMessage,
    headingsCount: { h1: h1Count, h2: h2Count, h3: h3Count },
    headingsStatus,
    headingsMessage,
    imagesTotal,
    imagesWithAlt,
    imagesStatus,
    imagesMessage,
    wordCount,
    estimatedMinutes,
    suggestions,
  };
}
