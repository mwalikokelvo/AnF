/**
 * Knowledge Vault Interactive Graph Visualizer
 *
 * Renders an interactive SVG topological graph of notes, documents, and wikilinks.
 * Identifies hub notes, orphan notes, and cluster connections without external dependencies.
 * Adheres strictly to Ponytail mode: pure TypeScript, lightweight SVG DOM.
 */

import { knowledgeGraph, type KnowledgeNote, type GraphNode } from './knowledge-data';
import { h } from '../views/dom';

export interface LayoutNode {
  id: string;
  label: string;
  kind: 'note' | 'document' | 'tag';
  noteId?: string;
  tag?: string;
  x: number;
  y: number;
  degree: number;
  isHub: boolean;
  isOrphan: boolean;
}

export interface LayoutEdge {
  fromId: string;
  toId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Calculates deterministic coordinates and topological connectivity for nodes.
 */
export function layoutGraphNodes(
  nodes: GraphNode[],
  edges: { from: string; to: string }[],
  width = 800,
  height = 520
): { layoutNodes: LayoutNode[]; layoutEdges: LayoutEdge[] } {
  const degrees = new Map<string, number>();
  for (const n of nodes) degrees.set(n.id, 0);
  for (const e of edges) {
    degrees.set(e.from, (degrees.get(e.from) || 0) + 1);
    degrees.set(e.to, (degrees.get(e.to) || 0) + 1);
  }

  const cx = width / 2;
  const cy = height / 2;
  const rx = (width / 2) - 60;
  const ry = (height / 2) - 50;

  // Concentric / spiral topological distribution
  const layoutNodes: LayoutNode[] = nodes.map((node, i) => {
    const deg = degrees.get(node.id) || 0;
    const isHub = deg >= 3;
    const isOrphan = deg === 0;

    // Hubs settle closer to center; peripheral / orphans orbit outer perimeter
    const radiusScale = isHub ? 0.45 : isOrphan ? 0.92 : 0.72;
    const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(angle) * (rx * radiusScale));
    const y = Math.round(cy + Math.sin(angle) * (ry * radiusScale));

    return {
      id: node.id,
      label: node.label,
      kind: node.kind,
      noteId: node.noteId,
      tag: node.tag,
      x,
      y,
      degree: deg,
      isHub,
      isOrphan,
    };
  });

  const nodeMap = new Map(layoutNodes.map((n) => [n.id, n]));
  const layoutEdges: LayoutEdge[] = [];

  for (const e of edges) {
    const p1 = nodeMap.get(e.from);
    const p2 = nodeMap.get(e.to);
    if (p1 && p2) {
      layoutEdges.push({
        fromId: e.from,
        toId: e.to,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
      });
    }
  }

  return { layoutNodes, layoutEdges };
}

/**
 * Filters nodes by search query or orphan status.
 */
export function filterGraphNodes(
  nodes: LayoutNode[],
  query: string,
  orphansOnly = false
): Set<string> {
  const clean = (query || '').trim().toLowerCase();
  const visible = new Set<string>();

  for (const n of nodes) {
    if (orphansOnly && !n.isOrphan) continue;
    if (clean && !n.label.toLowerCase().includes(clean)) continue;
    visible.add(n.id);
  }

  return visible;
}

/**
 * Opens the interactive Knowledge Graph dialog.
 */
export function openVaultGraphModal(
  notes: KnowledgeNote[],
  options: {
    onSelectNote?: (name: string) => void;
    notify?: (msg: string) => void;
  } = {}
): HTMLDialogElement {
  const dialog = h('dialog', {
    class: 'music-dialog vault-graph-dialog',
    'aria-label': 'Knowledge Graph Visualizer',
  });

  const { nodes, edges, omitted } = knowledgeGraph(notes.slice(0, 100), 200);
  const width = 840;
  const height = 540;
  const { layoutNodes, layoutEdges } = layoutGraphNodes(nodes, edges, width, height);

  let orphansOnly = false;
  let activeSearch = '';
  let selectedNode: LayoutNode | null = null;

  // Search filter
  const searchInput = h('input', {
    type: 'search',
    placeholder: 'Filter notes in graph…',
    class: 'reader-search-input',
    'aria-label': 'Filter graph nodes',
  }) as HTMLInputElement;

  const orphanBtn = h('button', {
    type: 'button',
    text: 'Show Orphans Only',
    class: 'music-chip',
  });

  const summary = h('p', {
    class: 'hint',
    text: `${layoutNodes.length} nodes · ${layoutEdges.length} connections ${omitted ? `(${omitted} omitted)` : ''}`,
  });

  // SVG Container
  const svgNs = 'http://www.w3.org/2000/svg';
  const svgEl = document.createElementNS(svgNs, 'svg');
  svgEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svgEl.setAttribute('class', 'vault-graph-svg');
  svgEl.style.width = '100%';
  svgEl.style.height = 'auto';
  svgEl.style.maxHeight = '65vh';
  svgEl.style.background = '#0e1117';
  svgEl.style.borderRadius = '8px';

  // Detail Drawer
  const detailBox = h('div', { class: 'vault-graph-detail', style: 'margin-top: 10px; padding: 10px; background: var(--surface, #1f2933); border-radius: 8px;' });
  const detailTitle = h('strong', { text: 'Click any node to view connections and open note' });
  const detailDesc = h('p', { class: 'hint', style: 'margin: 4px 0 8px;', text: '' });
  const openNoteBtn = h('button', {
    type: 'button',
    text: 'Open Note in Writing Studio',
    hidden: true,
  });

  openNoteBtn.addEventListener('click', () => {
    if (selectedNode && selectedNode.noteId) {
      const targetNote = notes.find((n) => n.id === selectedNode!.noteId);
      if (targetNote) {
        dialog.close();
        dialog.remove();
        if (options.onSelectNote) {
          options.onSelectNote(targetNote.name);
        } else {
          document.dispatchEvent(new CustomEvent('coucou-open-note', { detail: targetNote.name }));
        }
      }
    }
  });

  detailBox.append(detailTitle, detailDesc, openNoteBtn);

  function renderGraph() {
    svgEl.replaceChildren();
    const visibleIds = filterGraphNodes(layoutNodes, activeSearch, orphansOnly);

    // Edges
    for (const e of layoutEdges) {
      if (!visibleIds.has(e.fromId) || !visibleIds.has(e.toId)) continue;
      const isConnectedToSelected =
        selectedNode && (e.fromId === selectedNode.id || e.toId === selectedNode.id);

      const line = document.createElementNS(svgNs, 'line');
      line.setAttribute('x1', String(e.x1));
      line.setAttribute('y1', String(e.y1));
      line.setAttribute('x2', String(e.x2));
      line.setAttribute('y2', String(e.y2));
      line.setAttribute('stroke', isConnectedToSelected ? '#79e4b4' : 'rgba(255, 255, 255, 0.15)');
      line.setAttribute('stroke-width', isConnectedToSelected ? '2' : '1');
      svgEl.append(line);
    }

    // Nodes
    for (const n of layoutNodes) {
      if (!visibleIds.has(n.id)) continue;
      const isSelected = selectedNode && selectedNode.id === n.id;
      const radius = n.isHub ? 10 : n.isOrphan ? 5 : 7;

      const group = document.createElementNS(svgNs, 'g');
      group.style.cursor = 'pointer';

      const circle = document.createElementNS(svgNs, 'circle');
      circle.setAttribute('cx', String(n.x));
      circle.setAttribute('cy', String(n.y));
      circle.setAttribute('r', String(radius));

      let fillColor = '#60a5fa'; // Blue for notes
      if (n.kind === 'document') fillColor = '#38bdf8';
      else if (n.kind === 'tag') fillColor = '#c084fc';
      if (n.isHub) fillColor = '#79e4b4'; // Emerald for hubs
      if (n.isOrphan) fillColor = '#fbbf24'; // Amber for orphans
      if (isSelected) fillColor = '#f43f5e'; // Highlighted rose

      circle.setAttribute('fill', fillColor);
      circle.setAttribute('stroke', isSelected ? '#ffffff' : 'rgba(0,0,0,0.5)');
      circle.setAttribute('stroke-width', isSelected ? '2.5' : '1');

      // Label text
      const text = document.createElementNS(svgNs, 'text');
      text.setAttribute('x', String(n.x + radius + 4));
      text.setAttribute('y', String(n.y + 4));
      text.setAttribute('fill', isSelected ? '#ffffff' : '#cbd5e1');
      text.setAttribute('font-size', '11px');
      text.setAttribute('font-family', 'system-ui, sans-serif');
      text.textContent = n.label.slice(0, 20);

      group.append(circle, text);

      group.addEventListener('click', () => {
        selectedNode = n;
        detailTitle.textContent = `${n.label} (${n.kind.toUpperCase()})`;
        detailDesc.textContent = `${n.degree} connections · ${n.isHub ? 'Hub Note' : n.isOrphan ? 'Orphan Note (no links)' : 'Standard Note'}`;
        openNoteBtn.hidden = n.kind !== 'note';
        renderGraph();
      });

      svgEl.append(group);
    }
  }

  searchInput.addEventListener('input', () => {
    activeSearch = searchInput.value;
    renderGraph();
  });

  orphanBtn.addEventListener('click', () => {
    orphansOnly = !orphansOnly;
    orphanBtn.classList.toggle('active', orphansOnly);
    orphanBtn.textContent = orphansOnly ? 'Show All Notes' : 'Show Orphans Only';
    renderGraph();
  });

  const closeBtn = h('button', {
    type: 'button',
    text: 'Close',
    onclick: () => {
      dialog.close();
      dialog.remove();
    },
  });

  const header = h('div', { class: 'vault-graph-header' },
    h('h3', { text: 'Knowledge Graph Visualizer' }),
    summary
  );

  const toolbar = h('div', { class: 'row', style: 'gap: 8px; margin: 8px 0;' },
    searchInput,
    orphanBtn
  );

  dialog.append(header, toolbar, svgEl, detailBox, h('div', { class: 'row', style: 'margin-top: 12px;' }, closeBtn));
  dialog.addEventListener('cancel', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();

  renderGraph();
  return dialog;
}
