import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  layoutGraphNodes,
  filterGraphNodes,
  type LayoutNode,
} from '../src/workspace/vault-graph';
import type { GraphNode } from '../src/workspace/knowledge-data';

test('layoutGraphNodes positions nodes within canvas bounds', () => {
  const nodes: GraphNode[] = [
    { id: 'note:1', label: 'Index', kind: 'note', noteId: '1' },
    { id: 'note:2', label: 'Rust', kind: 'note', noteId: '2' },
    { id: 'note:3', label: 'Audio', kind: 'note', noteId: '3' },
  ];
  const edges = [
    { from: 'note:1', to: 'note:2' },
    { from: 'note:1', to: 'note:3' },
  ];

  const width = 800;
  const height = 500;
  const { layoutNodes, layoutEdges } = layoutGraphNodes(nodes, edges, width, height);

  assert.equal(layoutNodes.length, 3);
  assert.equal(layoutEdges.length, 2);

  for (const n of layoutNodes) {
    assert.ok(n.x >= 0 && n.x <= width, `x=${n.x} within bounds`);
    assert.ok(n.y >= 0 && n.y <= height, `y=${n.y} within bounds`);
  }
});

test('layoutGraphNodes correctly flags hub and orphan nodes', () => {
  const nodes: GraphNode[] = [
    { id: 'note:hub', label: 'Hub Note', kind: 'note', noteId: 'hub' },
    { id: 'note:leaf1', label: 'Leaf 1', kind: 'note', noteId: 'leaf1' },
    { id: 'note:leaf2', label: 'Leaf 2', kind: 'note', noteId: 'leaf2' },
    { id: 'note:leaf3', label: 'Leaf 3', kind: 'note', noteId: 'leaf3' },
    { id: 'note:orphan', label: 'Orphan Note', kind: 'note', noteId: 'orphan' },
  ];

  const edges = [
    { from: 'note:hub', to: 'note:leaf1' },
    { from: 'note:hub', to: 'note:leaf2' },
    { from: 'note:hub', to: 'note:leaf3' },
  ];

  const { layoutNodes } = layoutGraphNodes(nodes, edges);
  const byId = new Map(layoutNodes.map((n) => [n.id, n]));

  const hub = byId.get('note:hub')!;
  assert.equal(hub.degree, 3);
  assert.equal(hub.isHub, true);
  assert.equal(hub.isOrphan, false);

  const orphan = byId.get('note:orphan')!;
  assert.equal(orphan.degree, 0);
  assert.equal(orphan.isHub, false);
  assert.equal(orphan.isOrphan, true);

  const leaf = byId.get('note:leaf1')!;
  assert.equal(leaf.degree, 1);
  assert.equal(leaf.isHub, false);
  assert.equal(leaf.isOrphan, false);
});

test('filterGraphNodes handles search query and orphan filtering', () => {
  const mockNodes: LayoutNode[] = [
    { id: '1', label: 'Architecture Plan', kind: 'note', x: 0, y: 0, degree: 4, isHub: true, isOrphan: false },
    { id: '2', label: 'Draft Ideas', kind: 'note', x: 0, y: 0, degree: 0, isHub: false, isOrphan: true },
    { id: '3', label: 'Security Review', kind: 'note', x: 0, y: 0, degree: 1, isHub: false, isOrphan: false },
  ];

  // Search filter
  const searchResults = filterGraphNodes(mockNodes, 'arch', false);
  assert.equal(searchResults.size, 1);
  assert.ok(searchResults.has('1'));

  // Orphan filter
  const orphanResults = filterGraphNodes(mockNodes, '', true);
  assert.equal(orphanResults.size, 1);
  assert.ok(orphanResults.has('2'));

  // All nodes
  const allResults = filterGraphNodes(mockNodes, '', false);
  assert.equal(allResults.size, 3);
});
