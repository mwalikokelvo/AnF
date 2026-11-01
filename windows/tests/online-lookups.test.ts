import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gatedFetch, onlineLookupsEnabled, setOnlineLookups, safeHttpsUrl, cssUrl } from '../src/workspace/online-lookups.ts';
import { fetchOnlineLyrics } from '../src/workspace/lyrics-provider.ts';

test('online lookups are off by default and gatedFetch never reaches the network', async () => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response('{}'); }) as typeof fetch;
  try {
    assert.equal(onlineLookupsEnabled(), false);
    await assert.rejects(() => gatedFetch('https://lrclib.net/api/get'), /Online lookups are off/);
    assert.equal(await fetchOnlineLyrics({ title: 'Song', artist: 'Artist' }), undefined);
    assert.equal(calls, 0);
    setOnlineLookups(true);
    await gatedFetch('https://lrclib.net/api/get');
    assert.equal(calls, 1);
  } finally {
    setOnlineLookups(false);
    globalThis.fetch = real;
  }
});

test('safeHttpsUrl accepts only plain https URLs', () => {
  assert.equal(safeHttpsUrl('https://i.ytimg.com/vi/x/hq.jpg'), 'https://i.ytimg.com/vi/x/hq.jpg');
  for (const bad of ['http://a.com/x', 'javascript:alert(1)', 'data:image/png;base64,AA', 'file:///etc/passwd', 'https://u:p@a.com/', 'not a url', '', undefined, 42]) {
    assert.equal(safeHttpsUrl(bad), undefined, String(bad));
  }
});

test('cssUrl escapes quotes, parens and backslashes and rejects non-https', () => {
  assert.equal(cssUrl('javascript:alert(1)'), 'none');
  assert.equal(cssUrl('http://a.com/x.png'), 'none');
  assert.equal(cssUrl('blob:null/abc'), 'url("blob:null/abc")');
  const out = cssUrl('https://a.com/x.png?q=");background:url(//evil)');
  const inner = out.slice(5, -2); // between url(" and ")
  assert.ok(out.startsWith('url("https://a.com/') && out.endsWith('")'));
  assert.ok(!/(^|[^\\])[()"]/.test(inner.replace(/\\[0-9a-f]+ /g, '')), inner);
  assert.ok(!cssUrl('https://a.com/a\\b').includes('a\\b'));
});
