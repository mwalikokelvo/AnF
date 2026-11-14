import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notesToCsv } from '../src/export.js';

test('notesToCsv writes a header and a row per note', () => {
  const csv = notesToCsv([{ id: 'a', text: 'buy milk', createdAt: '2026-10-01T09:00:00.000Z' }]);
  assert.equal(csv, 'created,text,id\n2026-10-01T09:00:00.000Z,buy milk,a\n');
});
