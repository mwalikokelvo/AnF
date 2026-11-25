import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConceptMindmapCore } from '../src/workspace/editor/concept-mindmap';

describe('Frontier 3: Concept Mindmaps & Slide Deck Compiler', () => {
  const doc = `
# Local-First Architecture
## Core Foundations
- Data stays on user device
- Offline execution by default
## Storage Engine
- SQLCipher encryption
- Vector embeddings in SQLite
> Note: Emphasize memory safety and battery efficiency.
`;

  it('parses hierarchy tree and generates valid Mermaid mindmap', () => {
    const tree = ConceptMindmapCore.parseHierarchy(doc);
    assert.equal(tree.title, 'Local-First Architecture');
    assert.equal(tree.children.length, 2);
    assert.equal(tree.children[0].title, 'Core Foundations');
    assert.equal(tree.children[0].children.length, 2);

    const mermaid = ConceptMindmapCore.toMermaidMindmap(tree);
    assert.ok(mermaid.includes('mindmap'));
    assert.ok(mermaid.includes('Local-First Architecture'));
    assert.ok(mermaid.includes('Core Foundations'));
  });

  it('compiles Markdown sections into HTML5 presentation deck', () => {
    const deckHtml = ConceptMindmapCore.compileSlideDeck(doc, 'Local Systems Deck');
    assert.ok(deckHtml.includes('<!DOCTYPE html>'));
    assert.ok(deckHtml.includes('Local Systems Deck'));
    assert.ok(deckHtml.includes('Data stays on user device'));
    assert.ok(deckHtml.includes('ArrowRight'));
  });
});
