import { fetchOnlineLyrics } from './dist/lyrics-provider.js';

console.log('=== RUNNING NETWORK ERROR & RESILIENCE PROBES ===\n');

async function testFetch(scenarioName, mockFetch, track) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    const result = await fetchOnlineLyrics(track);
    console.log(`[PASS] Scenario: ${scenarioName}`);
    console.log(`       Result: ${JSON.stringify(result ? result.slice(0, 30) + '...' : result)}\n`);
    return { ok: true, result };
  } catch (err) {
    console.error(`[FAIL - UNHANDLED REJECTION] Scenario: ${scenarioName}`);
    console.error(`       Error: ${err.message}\n`);
    return { ok: false, error: err };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// 1. Completely offline (fetch throws TypeError: Failed to fetch)
await testFetch('Completely Offline (Network TypeError)', async () => {
  throw new TypeError('Failed to fetch');
}, { title: 'Blinding Lights', artist: 'The Weeknd', duration: 200 });

// 2. DNS resolution failure / net::ERR_NAME_NOT_RESOLVED
await testFetch('DNS Resolution Failure', async () => {
  const err = new Error('getaddrinfo ENOTFOUND lrclib.net');
  err.code = 'ENOTFOUND';
  throw err;
}, { title: 'Blinding Lights', artist: 'The Weeknd' });

// 3. HTTP 429 Rate Limit on /api/get
await testFetch('HTTP 429 Rate Limit with Retry-After', async (url) => {
  return {
    status: 429,
    ok: false,
    headers: new Map([['Retry-After', '60']]),
  };
}, { title: 'Blinding Lights', artist: 'The Weeknd' });

// 4. HTTP 503 Service Unavailable
await testFetch('HTTP 503 Service Unavailable', async () => {
  return {
    status: 503,
    ok: false,
    headers: new Map(),
  };
}, { title: 'Blinding Lights', artist: 'The Weeknd' });

// 5. HTTP 500 with non-JSON HTML error body
await testFetch('HTTP 500 Bad Gateway with HTML', async (url) => {
  return {
    status: 500,
    ok: false,
    text: async () => '<html>500 Internal Server Error</html>',
    json: async () => { throw new SyntaxError('Unexpected token < in JSON'); },
    headers: new Map(),
  };
}, { title: 'Blinding Lights', artist: 'The Weeknd' });

// 6. HTTP 200 with malformed JSON body
await testFetch('HTTP 200 with malformed JSON', async () => {
  return {
    status: 200,
    ok: true,
    json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
    headers: new Map(),
  };
}, { title: 'Blinding Lights', artist: 'The Weeknd' });

// 7. 404 on /api/get, successful fallback on /api/search
await testFetch('404 Exact Match -> Successful Fuzzy Search', async (url) => {
  const urlStr = String(url);
  if (urlStr.includes('/api/get')) {
    return { status: 404, ok: false, headers: new Map() };
  }
  return {
    status: 200,
    ok: true,
    json: async () => [
      { id: 1, duration: 201, syncedLyrics: '[00:05.00]Search synced line', plainLyrics: 'Plain line' }
    ],
    headers: new Map(),
  };
}, { title: 'Blinding Lights', artist: 'The Weeknd', duration: 200 });

// 8. 404 on /api/get, search results have huge duration mismatch (10 minutes off)
await testFetch('404 Exact Match -> Search has 10-minute duration mismatch', async (url) => {
  const urlStr = String(url);
  if (urlStr.includes('/api/get')) {
    return { status: 404, ok: false, headers: new Map() };
  }
  return {
    status: 200,
    ok: true,
    json: async () => [
      { id: 2, duration: 800, syncedLyrics: '[00:10.00]Completely wrong long track', plainLyrics: 'Wrong' }
    ],
    headers: new Map(),
  };
}, { title: 'Short Song', artist: 'Artist', duration: 120 });

// 9. 404 on /api/get, search results empty []
await testFetch('404 Exact Match -> Search results empty list', async (url) => {
  const urlStr = String(url);
  if (urlStr.includes('/api/get')) {
    return { status: 404, ok: false, headers: new Map() };
  }
  return {
    status: 200,
    ok: true,
    json: async () => [],
    headers: new Map(),
  };
}, { title: 'Nonexistent Song', artist: 'Nobody' });

console.log('=== NETWORK PROBES FINISHED ===');
