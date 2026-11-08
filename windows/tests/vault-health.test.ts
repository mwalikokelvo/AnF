import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditVaultHealth,
  vaultHealthToMarkdown,
} from '../src/workspace/vault-health.js';
import type { KnowledgeNote } from '../src/workspace/knowledge-data.js';

test('Vault Health & Broken Link Analytics', async (t) => {
  const notes: KnowledgeNote[] = [
    {
      id: 'n-1',
      name: 'Index Hub',
      draft: 'Welcome to the vault. See [[Audio Engineering]] and [[Missing Target Note]]. #meta/hub',
      sources: [],
    },
    {
      id: 'n-2',
      name: 'Audio Engineering',
      draft: 'Everything about sound. References [[Index Hub]] and [[Web Audio DSP]]. #audio',
      sources: [],
    },
    {
      id: 'n-3',
      name: 'Web Audio DSP',
      draft: 'Biquad filter math and equalizer gain parameter curves. #audio/dsp',
      sources: [],
    },
    {
      id: 'n-4',
      name: 'Isolated Thoughts',
      draft: 'This note has no links whatsoever.',
      sources: [],
    },
  ];

  await t.test('auditVaultHealth detects broken wikilinks accurately', () => {
    const report = auditVaultHealth(notes);
    assert.equal(report.totalNotes, 4);
    assert.equal(report.brokenLinks.length, 1);
    assert.equal(report.brokenLinks[0].sourceNoteName, 'Index Hub');
    assert.equal(report.brokenLinks[0].missingTarget, 'Missing Target Note');
  });

  await t.test('auditVaultHealth detects orphan notes with 0 connections', () => {
    const report = auditVaultHealth(notes);
    assert.equal(report.orphanNotes.length, 1);
    assert.equal(report.orphanNotes[0].noteName, 'Isolated Thoughts');
  });

  await t.test('auditVaultHealth identifies top hub notes', () => {
    const report = auditVaultHealth(notes);
    assert.ok(report.hubNotes.length >= 2);
    // Index Hub and Audio Engineering should be top hubs
    assert.ok(report.hubNotes.some(h => h.noteName === 'Index Hub'));
    assert.ok(report.hubNotes.some(h => h.noteName === 'Audio Engineering'));
  });

  await t.test('vaultHealthToMarkdown formats valid markdown report', () => {
    const report = auditVaultHealth(notes);
    const md = vaultHealthToMarkdown(report);

    assert.match(md, /title: "Vault Health & Graph Analytics"/);
    assert.match(md, /Overall Health Score/);
    assert.match(md, /Missing Target Note/);
    assert.match(md, /Isolated Thoughts/);
  });
});
