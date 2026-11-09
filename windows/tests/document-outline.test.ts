import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractOutline } from '../src/workspace/document-outline';

test('extractOutline returns empty array for empty or whitespace string', () => {
  assert.deepEqual(extractOutline(''), []);
  assert.deepEqual(extractOutline('   \n  \n'), []);
});

test('extractOutline extracts multi-level headings and computes character offsets', () => {
  const doc = `# Introduction
This is the intro section with some words.

## Architecture
Details regarding system architecture and modules.

### Component Details
Sub-module specifications.

## Conclusion
Final notes.
`;

  const outline = extractOutline(doc);
  assert.equal(outline.length, 4);

  assert.equal(outline[0].level, 1);
  assert.equal(outline[0].text, 'Introduction');
  assert.equal(outline[0].line, 1);
  assert.equal(outline[0].offset, 0);

  assert.equal(outline[1].level, 2);
  assert.equal(outline[1].text, 'Architecture');
  assert.equal(outline[1].line, 4);

  assert.equal(outline[2].level, 3);
  assert.equal(outline[2].text, 'Component Details');
  assert.equal(outline[2].line, 7);

  assert.equal(outline[3].level, 2);
  assert.equal(outline[3].text, 'Conclusion');
  assert.equal(outline[3].line, 10);
});

test('extractOutline calculates section word counts correctly', () => {
  const doc = `# First Heading
One two three four.

# Second Heading
Five six seven.
`;

  const outline = extractOutline(doc);
  assert.equal(outline.length, 2);
  // First section includes heading line + body words
  assert.equal(outline[0].wordCount, 6); // "First Heading One two three four."
  assert.equal(outline[1].wordCount, 5); // "Second Heading Five six seven."
});

test('extractOutline ignores markdown hashes within paragraphs or code blocks', () => {
  const doc = `Here is a paragraph talking about #notahead.
And another line.
`;
  const outline = extractOutline(doc);
  assert.equal(outline.length, 0);
});
