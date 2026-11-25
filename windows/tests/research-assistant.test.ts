import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCitations,
  createResearchProposal,
  buildSyntopicalTable,
  auditAcademicText
} from '../src/workspace/editor/research-assistant';

describe('Research Assistant & Academic Engine', () => {
  it('extracts APA citations and page numbers', () => {
    const text = 'Earlier models (Knuth, 1984, p. 97) proved soundness, while (Lamport, 1978) established clock synchronization.';
    const cites = extractCitations(text);
    assert.equal(cites.length, 2);
    assert.equal(cites[0].author, 'Knuth');
    assert.equal(cites[0].year, '1984');
    assert.equal(cites[0].pages, '97');
    assert.equal(cites[1].author, 'Lamport');
    assert.equal(cites[1].year, '1978');
    assert.equal(cites[1].pages, undefined);
  });

  it('generates a structured proposal with academic quality checklist', () => {
    const prop = createResearchProposal('Distributed Local-First Storage', 'Systems Engineering');
    assert.equal(prop.topic, 'Distributed Local-First Storage');
    assert.ok(prop.markdown.includes('## 1. Executive Summary & Core Hypothesis'));
    assert.ok(prop.markdown.includes('## 5. Academic Quality Checklist'));
  });

  it('builds syntopical comparison Markdown table', () => {
    const table = buildSyntopicalTable('Consensus Protocols', [
      { sourceTitle: 'Paxos Made Simple', author: 'Lamport', perspective: 'Asynchronous consensus', keyPassage: 'The Paxos algorithm...' },
      { sourceTitle: 'Raft', author: 'Ongaro', perspective: 'Understandable consensus', keyPassage: 'Raft decomposes leader election...' }
    ]);
    assert.ok(table.includes('## Syntopical Comparison: Consensus Protocols'));
    assert.ok(table.includes('| **Paxos Made Simple** | Lamport |'));
    assert.ok(table.includes('| **Raft** | Ongaro |'));
  });

  it('audits academic text and scores completeness', () => {
    const strongText = `
# Core Analysis
Our central claim is that local-first synchronization guarantees data sovereignty (Turing, 1950).
However, critics argue that concurrent conflict resolution degrades under high churn.
In conclusion, deterministic CRDT merges satisfy the requirements.
This body contains sufficient text to evaluate academic rigor thoroughly.
`;
    const audit = auditAcademicText(strongText);
    assert.equal(audit.hasClearThesis, true);
    assert.equal(audit.hasCounterArgument, true);
    assert.equal(audit.hasConclusion, true);
    assert.equal(audit.citations.length, 1);
    assert.ok(audit.score >= 90);
  });
});
