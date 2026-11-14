import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchNotes } from '../src/search.js';

const notes = [
  { id: '1', text: 'buy milk', createdAt: '2026-10-01T09:00:00.000Z' },
  { id: '2', text: 'call the plumber', createdAt: '2026-10-02T09:00:00.000Z' },
];

test('searchNotes finds notes containing the query', () => {
  assert.deepEqual(searchNotes(notes, 'milk').map((n) => n.id), ['1']);
});

test('searchNotes with an empty query returns everything', () => {
  assert.equal(searchNotes(notes, '  ').length, 2);
});
