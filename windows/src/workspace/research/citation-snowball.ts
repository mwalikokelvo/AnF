/**
 * Citation Snowballing Tree Graph
 * 
 * Implements bidirectional literature snowballing (backward references and
 * forward citation traversal) to construct academic dependency trees and identify
 * seminal foundational studies.
 * 
 * Inspired by luwill/research-skills literature snowballing methodology.
 */

export interface CitationNode {
  id: string;
  title: string;
  authors: string;
  year: number;
  direction: 'seed' | 'backward' | 'forward';
  depth: number;
}

export interface CitationEdge {
  fromId: string;
  toId: string;
  type: 'cites'; // fromId cites toId (toId is foundational to fromId)
}

export class CitationSnowballGraph {
  public nodes: Map<string, CitationNode> = new Map();
  public edges: CitationEdge[] = [];

  constructor(seedPaper?: { id: string; title: string; authors: string; year: number }) {
    if (seedPaper) {
      this.addNode({
        ...seedPaper,
        direction: 'seed',
        depth: 0
      });
    }
  }

  public addNode(node: CitationNode): void {
    this.nodes.set(node.id, node);
  }

  /**
   * Adds a backward citation (targetId was cited by sourceId, so targetId is foundational)
   */
  public addBackwardCitation(
    sourceId: string,
    foundationalPaper: { id: string; title: string; authors: string; year: number }
  ): void {
    const depth = (this.nodes.get(sourceId)?.depth || 0) + 1;
    this.addNode({
      ...foundationalPaper,
      direction: 'backward',
      depth
    });
    this.edges.push({
      fromId: sourceId,
      toId: foundationalPaper.id,
      type: 'cites'
    });
  }

  /**
   * Adds a forward citation (derivativePaper cited sourceId, so derivativePaper builds on sourceId)
   */
  public addForwardCitation(
    sourceId: string,
    derivativePaper: { id: string; title: string; authors: string; year: number }
  ): void {
    const depth = (this.nodes.get(sourceId)?.depth || 0) + 1;
    this.addNode({
      ...derivativePaper,
      direction: 'forward',
      depth
    });
    this.edges.push({
      fromId: derivativePaper.id,
      toId: sourceId,
      type: 'cites'
    });
  }

  /**
   * Identifies top seminal foundational papers (most cited within the local snowball subgraph)
   */
  public getSeminalFoundations(topK = 5): Array<{ node: CitationNode; citationCount: number }> {
    const counts = new Map<string, number>();
    for (const edge of this.edges) {
      counts.set(edge.toId, (counts.get(edge.toId) || 0) + 1);
    }

    const list: Array<{ node: CitationNode; citationCount: number }> = [];
    for (const [id, count] of counts.entries()) {
      const node = this.nodes.get(id);
      if (node) {
        list.push({ node, citationCount: count });
      }
    }

    list.sort((a, b) => b.citationCount - a.citationCount);
    return list.slice(0, topK);
  }

  /**
   * Compiles the citation graph into an interactive Mermaid diagram
   */
  public generateMermaidGraph(): string {
    const lines: string[] = ['graph TD'];

    for (const node of this.nodes.values()) {
      const cleanTitle = node.title.replace(/["()]/g, '');
      const shape = node.direction === 'seed'
        ? `("${cleanTitle} (${node.year})")`
        : `["${cleanTitle} (${node.year})"]`;
      lines.push(`  ${node.id}${shape}`);
    }

    for (const edge of this.edges) {
      lines.push(`  ${edge.fromId} -->|cites| ${edge.toId}`);
    }

    return lines.join('\n');
  }
}
