import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextReaderNavMode,
  readerNavModeAfterFocus,
  readerNavToggleShortcut,
  readerNavZone,
} from '../src/workspace/reader-nav.ts';

test('Ctrl+B and Cmd+B toggle the reader navigation bar', () => {
  assert.equal(readerNavToggleShortcut({ key: 'b', ctrlKey: true, metaKey: false, altKey: false }), true);
  assert.equal(readerNavToggleShortcut({ key: 'B', ctrlKey: true, metaKey: false, altKey: false }), true);
  assert.equal(readerNavToggleShortcut({ key: 'b', ctrlKey: false, metaKey: true, altKey: false }), true);
  assert.equal(readerNavToggleShortcut({ key: 'b', ctrlKey: false, metaKey: false, altKey: false }), false);
  assert.equal(readerNavToggleShortcut({ key: 'b', ctrlKey: true, metaKey: false, altKey: true }), false);
  assert.equal(readerNavToggleShortcut({ key: 'b', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true }), false);
  assert.equal(readerNavToggleShortcut({ key: 'b', ctrlKey: true, metaKey: false, altKey: false, repeat: true }), false);
  assert.equal(readerNavToggleShortcut({ key: 'Escape', ctrlKey: false, metaKey: false, altKey: false }), false);
  assert.equal(readerNavToggleShortcut({ key: 'ArrowLeft', ctrlKey: true, metaKey: false, altKey: false }), false);
});

test('focus on the reading viewport collapses the bar and focus inside the bar opens it', () => {
  assert.equal(readerNavModeAfterFocus('open', 'page'), 'collapsed');
  assert.equal(readerNavModeAfterFocus('collapsed', 'page'), 'collapsed');
  assert.equal(readerNavModeAfterFocus('collapsed', 'navigation'), 'open');
  assert.equal(readerNavModeAfterFocus('open', 'navigation'), 'open');
  assert.equal(readerNavModeAfterFocus('open', 'other'), 'open');
  assert.equal(readerNavModeAfterFocus('collapsed', 'other'), 'collapsed');
});

test('the keyboard shortcut flips navigation visibility', () => {
  assert.equal(nextReaderNavMode('open'), 'collapsed');
  assert.equal(nextReaderNavMode('collapsed'), 'open');
});

test('the reading page wins over the bar when classifying focus', () => {
  assert.equal(readerNavZone(true, false), 'page');
  assert.equal(readerNavZone(false, true), 'navigation');
  assert.equal(readerNavZone(true, true), 'page');
  assert.equal(readerNavZone(false, false), 'other');
});
