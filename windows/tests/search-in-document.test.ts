import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  searchDocument,
  DocumentSearchNavigator,
  createMatchSnippet,
} from '../src/workspace/search-in-document';

test('createMatchSnippet adds ellipses when text overflows padding', () => {
  const text = 'The quick brown fox jumps over the lazy dog in the tranquil forest.';
  const snippet = createMatchSnippet(text, 16, 3, 10); // 'fox'
  assert.ok(snippet.includes('fox'));
  assert.ok(snippet.startsWith('…'));
  assert.ok(snippet.endsWith('…'));
});

test('createMatchSnippet preserves boundary text without leading/trailing ellipsis', () => {
  const text = 'Beginning of the story.';
  const snippet = createMatchSnippet(text, 0, 9, 20); // 'Beginning'
  assert.ok(!snippet.startsWith('…'));
  assert.ok(snippet.includes('Beginning'));
});

test('searchDocument returns empty result for empty query or empty text', () => {
  assert.equal(searchDocument('', 'test').matches.length, 0);
  assert.equal(searchDocument('Some text', '').matches.length, 0);
  assert.equal(searchDocument('Some text', '   ').matches.length, 0);
});

test('searchDocument is case-insensitive and attributes sections correctly', () => {
  const parts = [
    { start: 0, end: 50, label: 'Chapter 1' },
    { start: 50, end: 120, label: 'Chapter 2' },
    { start: 120, end: 200, label: 'Chapter 3' },
  ];

  const text =
    'Rust is a systems programming language. High performance Rust guarantees memory safety. ' +
    'Many modern tools are built with rust to avoid data races and undefined behavior.';

  const result = searchDocument(text, 'Rust', parts);

  assert.equal(result.matches.length, 3);
  assert.equal(result.matchedSectionsCount, 3);

  // Match 1 in Chapter 1
  assert.equal(result.matches[0].sectionIndex, 0);
  assert.equal(result.matches[0].sectionLabel, 'Chapter 1');
  assert.equal(result.matches[0].charOffset, 0);

  // Match 2 in Chapter 2
  assert.equal(result.matches[1].sectionIndex, 1);
  assert.equal(result.matches[1].sectionLabel, 'Chapter 2');

  // Match 3 in Chapter 3
  assert.equal(result.matches[2].sectionIndex, 2);
  assert.equal(result.matches[2].sectionLabel, 'Chapter 3');
  assert.ok(result.matches[2].snippet.toLowerCase().includes('built with rust'));
});

test('DocumentSearchNavigator navigates and wraps around correctly', () => {
  const parts = [{ start: 0, end: 100, label: 'Doc' }];
  const text = 'apple banana apple cherry apple';
  const result = searchDocument(text, 'apple', parts);

  const nav = new DocumentSearchNavigator();
  nav.setResult(result);

  assert.equal(nav.total, 3);
  assert.equal(nav.currentIndex, 0);
  assert.equal(nav.current()?.charOffset, 0);
  assert.equal(nav.statusText(), '1 of 3 matches (1 section)');

  // Next -> Match 2
  const m2 = nav.next();
  assert.equal(nav.currentIndex, 1);
  assert.equal(m2?.charOffset, 13);
  assert.equal(nav.statusText(), '2 of 3 matches (1 section)');

  // Next -> Match 3
  const m3 = nav.next();
  assert.equal(nav.currentIndex, 2);
  assert.equal(m3?.charOffset, 26);

  // Next wraps around to Match 1
  const m1 = nav.next();
  assert.equal(nav.currentIndex, 0);
  assert.equal(m1?.charOffset, 0);

  // Prev wraps around backwards to Match 3
  const prevM3 = nav.prev();
  assert.equal(nav.currentIndex, 2);
  assert.equal(prevM3?.charOffset, 26);
});

test('DocumentSearchNavigator handles zero matches gracefully', () => {
  const nav = new DocumentSearchNavigator();
  nav.setResult({ query: 'nonexistent', matches: [], matchedSectionsCount: 0 });

  assert.equal(nav.total, 0);
  assert.equal(nav.current(), null);
  assert.equal(nav.next(), null);
  assert.equal(nav.prev(), null);
  assert.equal(nav.statusText(), 'No matches found');
});
