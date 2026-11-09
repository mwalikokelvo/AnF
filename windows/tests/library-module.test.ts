import { test } from 'node:test';
import assert from 'node:assert/strict';
import { libraryCard, libraryControls } from '../src/workspace/library';

// The library module had no test that imported it, so a malformed regex in
// libraryCard() reached main and broke `tsc`/`vite build` while every test
// stayed green. Importing the module here makes the bundler parse it.
test('library module parses and exports its renderers', () => {
  assert.equal(typeof libraryCard, 'function');
  assert.equal(typeof libraryControls, 'function');
});
