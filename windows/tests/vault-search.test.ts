import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasSearchOperators,
  searchVaultNotes,
  summarizeVaultSearch,
  vaultSearchHits,
} from '../src/workspace/vault-search.js';
import type { KnowledgeNote } from '../src/workspace/knowledge-data.js';

function note(partial: Partial<KnowledgeNote> & { id: string; name: string }): KnowledgeNote {
  return {
    draft: '',
    sources: [],
    ...partial,
  };
}

test('vault-search BM25 bridge', async (t) => {
  await t.test('detects operator filters without ranking them via BM25', () => {
    assert.equal(hasSearchOperators('tag:#work'), true);
    assert.equal(hasSearchOperators('has:task'), true);
    assert.equal(hasSearchOperators('type:pdf'), true);
    assert.equal(hasSearchOperators('read:>50%'), true);
    assert.equal(hasSearchOperators('audio equalizer'), false);
  });

  await t.test('ranks plain-text vault queries with BM25', () => {
    const notes = [
      note({
        id: 'a',
        name: 'DSP Notes',
        draft: 'Five-band biquad equalizer and Web Audio gain automation.',
      }),
      note({
        id: 'b',
        name: 'Backup Plan',
        draft: 'DigitalOcean Spaces rclone sync for vault manifests.',
      }),
      note({
        id: 'c',
        name: 'Grocery',
        draft: 'Milk eggs bread',
      }),
    ];

    const ranked = searchVaultNotes(notes, 'audio equalizer', 5);
    assert.ok(ranked.length >= 1);
    assert.equal(ranked[0].id, 'a');

    const hits = vaultSearchHits(notes, 'Spaces rclone', 3);
    assert.ok(hits.length >= 1);
    assert.equal(hits[0].docId, 'b');
  });

  await t.test('operator queries still use matchesNote filtering', () => {
    const notes = [
      note({ id: '1', name: 'Work', draft: 'Ship the release #work/eng' }),
      note({ id: '2', name: 'Personal', draft: 'Weekend plans' }),
    ];
    const found = searchVaultNotes(notes, 'tag:#work', 10);
    assert.equal(found.length, 1);
    assert.equal(found[0].id, '1');
  });

  await t.test('summarizeVaultSearch speaks top note titles', () => {
    const notes = [
      note({ id: '1', name: 'Alpha', draft: 'quantum vault search' }),
      note({ id: '2', name: 'Beta', draft: 'unrelated' }),
    ];
    const summary = summarizeVaultSearch(notes, 'quantum vault', 3);
    assert.match(summary, /Found 1 note/);
    assert.match(summary, /Alpha/);
  });
});
