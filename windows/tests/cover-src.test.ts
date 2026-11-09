import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCoverSrc } from '../src/workspace/cover-src.js';

test('resolveCoverSrc returns undefined for invalid URLs', async () => {
  assert.equal(await resolveCoverSrc(undefined, true, async () => new Blob()), undefined);
  assert.equal(await resolveCoverSrc('http://example.com/x.jpg', true, async () => new Blob()), undefined);
});

test('resolveCoverSrc passes through https when safe fetch is off', async () => {
  let called = false;
  const src = await resolveCoverSrc('https://cdn.example.net/a.png', false, async () => {
    called = true;
    return new Blob();
  });
  assert.equal(src, 'https://cdn.example.net/a.png');
  assert.equal(called, false);
});

test('resolveCoverSrc uses fetchImage on desktop and returns a blob URL', async () => {
  const seen: string[] = [];
  const src = await resolveCoverSrc('https://images.example.org/cover.webp', true, async (url) => {
    seen.push(url);
    return new Blob([1, 2, 3], { type: 'image/webp' });
  });
  assert.deepEqual(seen, ['https://images.example.org/cover.webp']);
  assert.match(src!, /^blob:/);
  URL.revokeObjectURL(src!);
});
