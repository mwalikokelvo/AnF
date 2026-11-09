import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAnnotationsToMarkdown } from '../src/workspace/reader-annotations-export';

test('formatAnnotationsToMarkdown handles empty annotations gracefully', () => {
  const md = formatAnnotationsToMarkdown('Sample Book', 'Document text', []);
  assert.match(md, /^# Highlights from Sample Book/);
  assert.match(md, /No annotations saved yet/);
});

test('formatAnnotationsToMarkdown sorts excerpts and includes notes and quotes', () => {
  const text = 'The quick brown fox jumps over the lazy dog. A journey of a thousand miles begins with a single step.';
  const annotations = [
    { start: 45, end: 101, color: 'blue', note: 'Wise proverb.', id: '2' },
    { start: 0, end: 44, color: 'yellow', note: 'Classic pangram.', id: '1' },
  ];

  const md = formatAnnotationsToMarkdown('Wisdom Collection', text, annotations);

  assert.match(md, /^# Highlights from Wisdom Collection/);
  assert.match(md, /2 highlights/);

  // Confirms ordering: Quote 1 comes from start=0
  assert.match(md, /### Quote 1 \(YELLOW\)/);
  assert.match(md, /> The quick brown fox jumps over the lazy dog\./);
  assert.match(md, /\*\*Note:\*\* Classic pangram\./);

  // Quote 2 comes from start=45
  assert.match(md, /### Quote 2 \(BLUE\)/);
  assert.match(md, /> A journey of a thousand miles begins with a single step\./);
  assert.match(md, /\*\*Note:\*\* Wise proverb\./);
});
