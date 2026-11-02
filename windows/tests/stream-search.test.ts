import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SpotubeStreamService } from '../src/workspace/streaming-provider.js';
import { setOnlineLookups } from '../src/workspace/online-lookups.js';

const realFetch = globalThis.fetch;
afterEach(() => { setOnlineLookups(false); globalThis.fetch = realFetch; });

test('"All services" search lists a video once even when YouTube and the audiobook search both return it', async () => {
  setOnlineLookups(true);
  globalThis.fetch = (async (input: any) => {
    const u = new URL(String(input));
    if (u.hostname === 'pipedapi.kavin.rocks' && u.pathname === '/search') {
      return new Response(JSON.stringify({ items: [{ url: '/watch?v=zn1FHSWPaTk', title: 'Same Video', uploaderName: 'Band', duration: 100 }] }), { headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 503 });
  }) as typeof fetch;
  const found = await new SpotubeStreamService().searchMultiSource('same video');
  const ids = found.map(t => t.id);
  assert.deepEqual(ids, [...new Set(ids)], 'duplicate ids: ' + ids.join(','));
  assert.equal(ids.filter(id => id === 'yt:zn1FHSWPaTk').length, 1);
});
