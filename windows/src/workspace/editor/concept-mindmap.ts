/**
 * Concept Mindmaps & Slide Deck Compiler for AnF & ThingsBook
 * 
 * Transforms Markdown documents, book chapters, or research notes into
 * interactive Mermaid.js mindmaps and self-contained HTML5 presentation slide decks.
 * Inspired by THU-MAIC/OpenMAIC.
 */

export interface MindmapNode {
  title: string;
  depth: number;
  children: MindmapNode[];
}

export interface SlidePage {
  slideNumber: number;
  title: string;
  bullets: string[];
  presenterNotes: string;
}

export const ConceptMindmapCore = {
  /**
   * Parse Markdown headings and bullet points into a hierarchical node tree.
   */
  parseHierarchy(markdownText: string): MindmapNode {
    const lines = (markdownText || '').split(/\r?\n/);
    let rootTitle = 'Document Concepts';

    const root: MindmapNode = { title: rootTitle, depth: 0, children: [] };
    const stack: MindmapNode[] = [root];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();

        if (level === 1 && root.children.length === 0 && root.title === 'Document Concepts') {
          root.title = title;
          continue;
        }

        const node: MindmapNode = { title, depth: level, children: [] };
        while (stack.length > 1 && stack[stack.length - 1].depth >= level) {
          stack.pop();
        }
        stack[stack.length - 1].children.push(node);
        stack.push(node);
        continue;
      }

      const bulletMatch = line.match(/^[-*]\s+(.+)$/);
      if (bulletMatch && stack.length > 0) {
        const text = bulletMatch[1].trim();
        const parent = stack[stack.length - 1];
        parent.children.push({ title: text, depth: parent.depth + 1, children: [] });
      }
    }

    return root;
  },

  /**
   * Render AST hierarchy into valid Mermaid.js mindmap diagram code.
   */
  toMermaidMindmap(root: MindmapNode): string {
    let out = 'mindmap\n';
    out += `  root(("${root.title.replace(/[()]/g, '')}"))\n`;

    function renderNode(node: MindmapNode, indent: number) {
      const pad = '  '.repeat(indent);
      const cleanTitle = node.title.replace(/[()]/g, '');
      out += `${pad}${cleanTitle}\n`;
      for (const child of node.children) {
        renderNode(child, indent + 1);
      }
    }

    for (const child of root.children) {
      renderNode(child, 2);
    }

    return out;
  },

  /**
   * Compile Markdown sections into an interactive presentation slide deck.
   */
  compileSlideDeck(markdownText: string, deckTitle = 'Presentation'): string {
    const lines = (markdownText || '').split(/\r?\n/);
    const slides: SlidePage[] = [];

    let currentTitle = deckTitle;
    let currentBullets: string[] = [];
    let currentNotes: string[] = [];

    function flushSlide() {
      if (currentTitle || currentBullets.length > 0) {
        slides.push({
          slideNumber: slides.length + 1,
          title: currentTitle,
          bullets: [...currentBullets],
          presenterNotes: currentNotes.join(' '),
        });
        currentBullets = [];
        currentNotes = [];
      }
    }

    for (const line of lines) {
      const trimmed = line.trim();
      const hMatch = trimmed.match(/^#{1,2}\s+(.+)$/);
      if (hMatch) {
        flushSlide();
        currentTitle = hMatch[1].trim();
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        currentBullets.push(trimmed.slice(2).trim());
      } else if (trimmed.startsWith('> ')) {
        currentNotes.push(trimmed.slice(2).trim());
      }
    }
    flushSlide();

    // Render standalone HTML5 presentation deck with keyboard arrow nav
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${deckTitle}</title>
<style>
  body { margin:0; background:#09090b; color:#fafafa; font-family:system-ui,sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; overflow:hidden; }
  .deck-container { width:90vw; max-width:960px; aspect-ratio:16/9; background:#18181b; border-radius:12px; padding:48px; box-sizing:border-box; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 12px 32px rgba(0,0,0,0.6); }
  h2 { font-size:2.4rem; margin:0 0 24px; color:#38bdf8; }
  ul { font-size:1.4rem; line-height:1.8; margin:0; padding-left:32px; }
  .footer { display:flex; justify-content:space-between; color:#71717a; font-size:0.9rem; border-top:1px solid #27272a; padding-top:16px; }
</style>
</head>
<body>
<div class="deck-container" id="slideBox">
  <div>
    <h2 id="slideTitle"></h2>
    <ul id="slideBullets"></ul>
  </div>
  <div class="footer">
    <span id="slideIndex"></span>
    <span>Use [←] / [→] keys to navigate</span>
  </div>
</div>
<script>
  const slides = ${JSON.stringify(slides)};
  let idx = 0;
  function show(i) {
    if (i < 0 || i >= slides.length) return;
    idx = i;
    const s = slides[idx];
    document.getElementById('slideTitle').textContent = s.title;
    const ul = document.getElementById('slideBullets');
    ul.innerHTML = s.bullets.map(b => '<li>' + b + '</li>').join('');
    document.getElementById('slideIndex').textContent = 'Slide ' + (idx + 1) + ' of ' + slides.length;
  }
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === ' ') show(idx + 1);
    if (e.key === 'ArrowLeft') show(idx - 1);
  });
  show(0);
</script>
</body>
</html>`;

    return html;
  }
};
