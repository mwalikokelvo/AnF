/**
 * Document Outline extractor and navigator for Markdown writing.
 * Scans headings, calculates level-depth and section word counts,
 * and provides rapid section navigation.
 */

export interface OutlineHeading {
  level: number;
  text: string;
  line: number;
  offset: number;
  wordCount: number;
}

export function extractOutline(markdown: string): OutlineHeading[] {
  if (typeof markdown !== 'string' || !markdown.trim()) return [];

  const lines = markdown.split(/\r?\n/);
  const headings: Array<{ level: number; text: string; line: number; offset: number }> = [];

  let currentOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim().replace(/\s+#+$/, ''),
        line: i + 1,
        offset: currentOffset,
      });
    }
    currentOffset += line.length + 1; // +1 for the newline
  }

  // Calculate word count for each section
  const result: OutlineHeading[] = [];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const nextOffset = i < headings.length - 1 ? headings[i + 1].offset : markdown.length;
    const sectionText = markdown.slice(h.offset, nextOffset).replace(/^#{1,6}\s+/, '').trim();
    const words = sectionText ? sectionText.split(/\s+/u).length : 0;
    result.push({
      ...h,
      wordCount: words,
    });
  }

  return result;
}

export function openOutlineModal(
  markdown: string,
  onSelect: (offset: number) => void
): void {
  if (typeof document === 'undefined') return;

  const headings = extractOutline(markdown);
  const dialog = document.createElement('dialog');
  dialog.className = 'music-dialog outline-dialog';
  dialog.setAttribute('aria-label', 'Document Outline');

  const header = document.createElement('div');
  header.className = 'outline-header';

  const title = document.createElement('h3');
  title.textContent = 'Document Outline';

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = headings.length
    ? `${headings.length} heading${headings.length === 1 ? '' : 's'} · Click any section to jump`
    : 'No headings found. Add # H1 or ## H2 in your draft.';

  header.append(title, hint);

  const list = document.createElement('div');
  list.className = 'outline-list';

  for (const h of headings) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `outline-item level-${h.level}`;
    item.style.paddingLeft = `${(h.level - 1) * 16 + 12}px`;

    const levelBadge = document.createElement('span');
    levelBadge.className = 'outline-badge';
    levelBadge.textContent = `H${h.level}`;

    const textSpan = document.createElement('span');
    textSpan.className = 'outline-text';
    textSpan.textContent = h.text;

    const wordsSpan = document.createElement('span');
    wordsSpan.className = 'outline-words';
    wordsSpan.textContent = `${h.wordCount} words`;

    item.append(levelBadge, textSpan, wordsSpan);

    item.onclick = () => {
      dialog.close();
      dialog.remove();
      onSelect(h.offset);
    };

    list.append(item);
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Close';
  closeBtn.onclick = () => {
    dialog.close();
    dialog.remove();
  };

  const footer = document.createElement('div');
  footer.className = 'row';
  footer.append(closeBtn);

  dialog.append(header, list, footer);
  dialog.addEventListener('cancel', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}
