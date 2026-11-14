import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addNote, loadNotes } from '../src/store.js';

function tempStore() {
  return join(mkdtempSync(join(tmpdir(), 'jotter-')), 'notes.json');
}

test('loadNotes returns an empty list when no file exists', () => {
  assert.deepEqual(loadNotes(tempStore()), []);
});

test('addNote saves a trimmed note with id and timestamp', () => {
  const path = tempStore();
  const note = addNote('  buy milk  ', path);
  assert.equal(note.text, 'buy milk');
  assert.ok(note.id);
  assert.ok(Date.parse(note.createdAt));
  assert.deepEqual(loadNotes(path), [note]);
});

test('addNote rejects empty text', () => {
  assert.throws(() => addNote('   ', tempStore()), /required/);
});
