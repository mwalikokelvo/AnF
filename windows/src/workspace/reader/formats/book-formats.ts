/**
 * Multi-Format Book Reader & Document Converter for AnF
 * 
 * Provides unified, self-contained extraction and parsing for:
 * - Comic Book Archives (.cbz)
 * - FictionBook2 XML (.fb2)
 * - Kindle / MOBI (.mobi, .azw3)
 * - Microsoft Word (.docx)
 * - OpenDocument Text (.odt)
 * - Rich Text Format (.rtf)
 * - Single-file Web Archives (.webdoc, .html)
 * 
 * Ported directly from ThingsBook reading room architecture.
 */

export interface ParsedBookSection {
  title: string;
  content: string;
}

export interface ParsedBookResult {
  format: 'CBZ' | 'FB2' | 'MOBI' | 'DOCX' | 'ODT' | 'RTF' | 'WEBDOC' | 'TEXT';
  title: string;
  authors: string[];
  description?: string;
  text: string;
  sections: ParsedBookSection[];
  metadata?: Record<string, unknown>;
}

function stripHtmlTags(input: string, replacement = ''): string {
  let prev: string;
  let curr = input;
  do {
    prev = curr;
    curr = curr.replace(/<[^>]+>/g, replacement);
  } while (curr !== prev);
  return curr;
}

function stripHtmlBlock(html: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}[^>]*>`, 'gi');
  let prev: string;
  let curr = html;
  do {
    prev = curr;
    curr = curr.replace(re, '');
  } while (curr !== prev);
  return curr;
}

/**
 * 1. RTF (Rich Text Format) Parser
 */
export function parseRtf(rtfContent: string | Uint8Array): ParsedBookResult {
  const raw = typeof rtfContent === 'string' ? rtfContent : new TextDecoder('windows-1252').decode(rtfContent);

  let title = 'Untitled RTF Document';
  const authors: string[] = [];

  // Extract \title and \author (typically within \info group)
  const titleMatch = raw.match(/\\title\s+([^{}\\\r\n]+)/i);
  if (titleMatch) title = titleMatch[1].trim();

  const authorMatch = raw.match(/\\author\s+([^{}\\\r\n]+)/i);
  if (authorMatch) authors.push(authorMatch[1].trim());

  // Clean RTF commands, character escapes, and braces
  let text = raw
    // Remove info block from body text
    .replace(/\{\\info[^{}]*(?:\{[^{}]*\})*\}/gi, '')
    // Remove ignorable destinations {\*...}
    .replace(/\{\\\*[^}]+}/g, '')
    // Remove stylesheet, fonttbl, colortbl
    .replace(/\{\\(?:fonttbl|colortbl|stylesheet)[^}]+}/g, '')
    // Unicode characters \uN?
    .replace(/\\u(-?\d+)\??/g, (_, code) => {
      const c = parseInt(code, 10);
      return String.fromCharCode(c < 0 ? c + 65536 : c);
    })
    // Hex byte escapes \'hh
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // Paragraph breaks and tabs
    .replace(/\\par\b/g, '\n\n')
    .replace(/\\line\b/g, '\n')
    .replace(/\\tab\b/g, '\t')
    // Remove control words with space preservation
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, ' ')
    // Remove remaining braces
    .replace(/[{}]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();

  // Normalize duplicate newlines
  text = text.replace(/\n{3,}/g, '\n\n');

  return {
    format: 'RTF',
    title,
    authors,
    text,
    sections: [{ title: 'Main', content: text }]
  };
}

/**
 * 2. FB2 (FictionBook2 XML) Parser
 */
export function parseFb2(fb2Xml: string | Uint8Array): ParsedBookResult {
  const xml = typeof fb2Xml === 'string' ? fb2Xml : new TextDecoder('utf-8').decode(fb2Xml);

  let title = 'Untitled FictionBook';
  const authors: string[] = [];
  let description = '';

  const titleMatch = xml.match(/<book-title>([^<]+)<\/book-title>/i);
  if (titleMatch) title = titleMatch[1].trim();

  const authorMatches = xml.matchAll(/<author>[\s\S]*?(?:<first-name>([^<]+)<\/first-name>)?[\s\S]*?(?:<last-name>([^<]+)<\/last-name>)?[\s\S]*?<\/author>/gi);
  for (const m of authorMatches) {
    const fullName = [m[1], m[2]].filter(Boolean).join(' ').trim();
    if (fullName) authors.push(fullName);
  }

  const descMatch = xml.match(/<annotation>([\s\S]*?)<\/annotation>/i);
  if (descMatch) {
    description = descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Extract body sections
  const sections: ParsedBookSection[] = [];
  const bodyMatch = xml.match(/<body>([\s\S]*?)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : xml;

  const sectionMatches = bodyContent.matchAll(/<section>([\s\S]*?)<\/section>/gi);
  let totalText = '';

  for (const sec of sectionMatches) {
    const secHtml = sec[1];
    const secTitleMatch = secHtml.match(/<title>[\s\S]*?<p>([^<]+)<\/p>[\s\S]*?<\/title>/i);
    const secTitle = secTitleMatch ? secTitleMatch[1].trim() : `Section ${sections.length + 1}`;

    // Extract paragraphs <p>
    const paragraphs: string[] = [];
    const pMatches = secHtml.matchAll(/<p>([\s\S]*?)<\/p>/gi);
    for (const p of pMatches) {
      const cleanP = stripHtmlTags(p[1]).trim();
      if (cleanP) paragraphs.push(cleanP);
    }

    const secText = paragraphs.join('\n\n');
    if (secText) {
      sections.push({ title: secTitle, content: secText });
      totalText += (totalText ? '\n\n' : '') + `## ${secTitle}\n\n` + secText;
    }
  }

  if (sections.length === 0) {
    const rawClean = stripHtmlTags(bodyContent, ' ').replace(/\s+/g, ' ').trim();
    sections.push({ title: 'Main', content: rawClean });
    totalText = rawClean;
  }

  return {
    format: 'FB2',
    title,
    authors: authors.length > 0 ? authors : ['Unknown Author'],
    description,
    text: totalText,
    sections
  };
}

/**
 * 3. CBZ (Comic Book Zip Archive) Manifest Parser
 */
export function parseCbzManifest(
  filenames: string[],
  comicInfoXml?: string
): ParsedBookResult {
  const naturalSort = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const imageExtensions = /\.(jpe?g|png|webp|gif|avif)$/i;

  const imagePages = filenames
    .filter(name => !name.endsWith('/') && !/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/i.test(name))
    .filter(name => imageExtensions.test(name))
    .sort(naturalSort.compare);

  let title = 'Untitled Comic';
  const authors: string[] = [];
  let series = '';
  let number = '';

  if (comicInfoXml) {
    const titleMatch = comicInfoXml.match(/<Title>([^<]+)<\/Title>/i);
    if (titleMatch) title = titleMatch[1].trim();

    const seriesMatch = comicInfoXml.match(/<Series>([^<]+)<\/Series>/i);
    if (seriesMatch) series = seriesMatch[1].trim();

    const numberMatch = comicInfoXml.match(/<Number>([^<]+)<\/Number>/i);
    if (numberMatch) number = numberMatch[1].trim();

    const writerMatch = comicInfoXml.match(/<Writer>([^<]+)<\/Writer>/i);
    if (writerMatch) authors.push(...writerMatch[1].split(/\s*,\s*/).filter(Boolean));

    if (!titleMatch && series) {
      title = `${series}${number ? ` #${number}` : ''}`;
    }
  }

  const sections: ParsedBookSection[] = imagePages.map((page, idx) => ({
    title: `Page ${idx + 1}`,
    content: `![${page}](${page})`
  }));

  const text = `# ${title}\n\n` + sections.map(s => `## ${s.title}\n\n${s.content}`).join('\n\n');

  return {
    format: 'CBZ',
    title,
    authors,
    text,
    sections,
    metadata: {
      pageCount: imagePages.length,
      series,
      number,
      pages: imagePages
    }
  };
}

/**
 * 4. DOCX Document XML Parser
 */
export function parseDocxDocumentXml(documentXml: string): ParsedBookResult {
  const paragraphs: string[] = [];
  const pMatches = documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gi);

  for (const p of pMatches) {
    const pHtml = p[0];
    const tMatches = pHtml.matchAll(/<w:t\b[^>]*>([^<]+)<\/w:t>/gi);
    const textPieces: string[] = [];
    for (const t of tMatches) {
      textPieces.push(t[1]);
    }
    const line = textPieces.join('').trim();
    if (line) paragraphs.push(line);
  }

  const title = paragraphs[0] || 'Untitled DOCX Document';
  const text = paragraphs.join('\n\n');

  return {
    format: 'DOCX',
    title,
    authors: [],
    text,
    sections: [{ title: 'Main', content: text }]
  };
}

/**
 * 5. ODT (OpenDocument Text) Content XML Parser
 */
export function parseOdtContentXml(contentXml: string): ParsedBookResult {
  const paragraphs: string[] = [];
  const pMatches = contentXml.matchAll(/<text:(?:p|h)\b[\s\S]*?<\/text:(?:p|h)>/gi);

  for (const p of pMatches) {
    const pHtml = p[0];
    const clean = stripHtmlTags(pHtml).trim();
    if (clean) paragraphs.push(clean);
  }

  const title = paragraphs[0] || 'Untitled ODT Document';
  const text = paragraphs.join('\n\n');

  return {
    format: 'ODT',
    title,
    authors: [],
    text,
    sections: [{ title: 'Main', content: text }]
  };
}

/**
 * 6. MOBI / Kindle PalmDOC Parser
 */
export function parseMobiRecordText(rawHtmlOrText: string): ParsedBookResult {
  const titleMatch = rawHtmlOrText.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Kindle Book';

  const clean = stripHtmlTags(
    stripHtmlBlock(stripHtmlBlock(rawHtmlOrText, 'style'), 'script')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n'),
    ' '
  )
    .replace(/[ \t]+/g, ' ')
    .trim();

  return {
    format: 'MOBI',
    title,
    authors: [],
    text: clean,
    sections: [{ title: 'Main', content: clean }]
  };
}

/**
 * 7. WebDoc / Single-file HTML Archive Parser
 */
export function parseWebDocHtml(html: string): ParsedBookResult {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Archived Web Page';

  let strippedHtml = html;
  for (const tag of ['script', 'style', 'header', 'footer', 'nav']) {
    strippedHtml = stripHtmlBlock(strippedHtml, tag);
  }
  const clean = stripHtmlTags(
    strippedHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n'),
    ' '
  )
    .replace(/[ \t]+/g, ' ')
    .trim();

  return {
    format: 'WEBDOC',
    title,
    authors: [],
    text: clean,
    sections: [{ title: 'Main', content: clean }]
  };
}

/**
 * Unified Book Format Conversion Router
 */
export function convertBookFormat(filename: string, content: string | Uint8Array): ParsedBookResult {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (ext === 'rtf') return parseRtf(content);
  if (ext === 'fb2') return parseFb2(content);
  if (ext === 'mobi' || ext === 'azw' || ext === 'azw3') {
    const str = typeof content === 'string' ? content : new TextDecoder('utf-8').decode(content);
    return parseMobiRecordText(str);
  }
  if (ext === 'docx') {
    const str = typeof content === 'string' ? content : new TextDecoder('utf-8').decode(content);
    return parseDocxDocumentXml(str);
  }
  if (ext === 'odt') {
    const str = typeof content === 'string' ? content : new TextDecoder('utf-8').decode(content);
    return parseOdtContentXml(str);
  }
  if (ext === 'html' || ext === 'htm' || ext === 'mhtml' || ext === 'webdoc') {
    const str = typeof content === 'string' ? content : new TextDecoder('utf-8').decode(content);
    return parseWebDocHtml(str);
  }

  const str = typeof content === 'string' ? content : new TextDecoder('utf-8').decode(content);
  return {
    format: 'TEXT',
    title: filename,
    authors: [],
    text: str,
    sections: [{ title: 'Main', content: str }]
  };
}
