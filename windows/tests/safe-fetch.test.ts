import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasSafeFetch, safeFetchAudio, safeFetchDocument, safeFetchImage, safeFetchText } from '../src/workspace/safe-fetch.js';
import { fetchFeed, downloadPodcastEnclosure } from '../src/workspace/podcast-feeds.js';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
}

type Call = { cmd: string; args?: Record<string, unknown> };
function installTauri(handler: (cmd: string, args?: Record<string, unknown>) => unknown): Call[] {
  const calls: Call[] = [];
  (globalThis as any).__TAURI_INTERNALS__ = {
    invoke: async (cmd: string, args?: Record<string, unknown>) => {
      calls.push({ cmd, args });
      return handler(cmd, args);
    },
  };
  return calls;
}
const realFetch = globalThis.fetch;
afterEach(() => {
  delete (globalThis as any).__TAURI_INTERNALS__;
  delete (globalThis as any).window;
  globalThis.fetch = realFetch;
});

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Sample Show</title></channel></rss>`;

describe('safe fetch bridge', () => {
  test('is absent outside the desktop app', async () => {
    assert.equal(hasSafeFetch(), false);
    await assert.rejects(() => safeFetchText('https://example.org/feed'), /desktop app/);
  });

  test('safeFetchText calls the Rust command and returns its body', async () => {
    const calls = installTauri(() => ({ finalUrl: 'https://example.org/feed', contentType: 'application/rss+xml', body: RSS }));
    assert.equal(hasSafeFetch(), true);
    const res = await safeFetchText('https://example.org/feed');
    assert.equal(res.body, RSS);
    assert.deepEqual(calls, [{ cmd: 'safe_fetch_text', args: { url: 'https://example.org/feed', kind: 'feed' } }]);
  });

  test('Rust rejections surface as Error with the user-facing text', async () => {
    installTauri(() => { throw 'Only public internet hosts can be fetched.'; });
    await assert.rejects(() => safeFetchText('https://127.0.0.1/x'), /Only public internet hosts/);
  });

  test('safeFetchAudio wraps returned bytes in a typed Blob', async () => {
    installTauri(() => new Uint8Array([1, 2, 3, 4]).buffer);
    const blob = await safeFetchAudio('https://example.org/a.mp3', 'audio/mpeg');
    assert.equal(blob.size, 4);
    assert.equal(blob.type, 'audio/mpeg');
    installTauri(() => 'nonsense');
    await assert.rejects(() => safeFetchAudio('https://example.org/a.mp3'), /unexpected response/);
  });

  test('safeFetchImage wraps returned bytes in a typed Blob', async () => {
    const calls = installTauri(() => new Uint8Array([9, 8, 7]).buffer);
    const blob = await safeFetchImage('https://example.org/cover.png', 'image/png');
    assert.equal(blob.size, 3);
    assert.equal(blob.type, 'image/png');
    assert.deepEqual(calls, [{ cmd: 'safe_fetch_image', args: { url: 'https://example.org/cover.png' } }]);
  });

  test('safeFetchDocument wraps returned bytes in a typed Blob', async () => {
    const calls = installTauri(() => new Uint8Array([0x50, 0x4b]).buffer);
    const blob = await safeFetchDocument('https://example.org/book.epub', 'application/epub+zip');
    assert.equal(blob.size, 2);
    assert.equal(blob.type, 'application/epub+zip');
    assert.deepEqual(calls, [{ cmd: 'safe_fetch_document', args: { url: 'https://example.org/book.epub' } }]);
  });
});

describe('podcast feed platform split', () => {
  test('desktop fetchFeed goes through Rust and never uses webview fetch', async () => {
    const calls = installTauri(() => ({ finalUrl: 'u', contentType: 'text/xml', body: RSS }));
    globalThis.fetch = (async () => { throw new Error('webview fetch must not be used on desktop'); }) as any;
    (globalThis as any).DOMParser ??= class {
      parseFromString() {
        const empty = { querySelector: () => null, querySelectorAll: () => ({ forEach() {} }) };
        return { querySelector: (s: string) => (s === 'channel' ? { querySelector: (t: string) => (t === 'title' ? { textContent: 'Sample Show' } : null) } : null), querySelectorAll: empty.querySelectorAll };
      }
    };
    const feed = await fetchFeed('https://feeds.example.org/show.xml');
    assert.equal(feed.title, 'Sample Show');
    assert.equal(calls[0].cmd, 'safe_fetch_text');
  });

  test('Android bridge keeps priority over the desktop path', async () => {
    const calls = installTauri(() => { throw new Error('should not be called'); });
    const win: any = {};
    win.AnFAndroid = { fetchRss: (id: string) => setTimeout(() => win.coucouFeedResult(id, RSS, ''), 0) };
    (globalThis as any).window = win;
    (globalThis as any).DOMParser ??= class {
      parseFromString() { return { querySelector: () => null, querySelectorAll: () => ({ forEach() {} }) }; }
    };
    const feed = await fetchFeed('https://feeds.example.org/show.xml');
    assert.equal(feed.url, 'https://feeds.example.org/show.xml');
    assert.equal(calls.length, 0);
  });

  test('plain web path still uses fetch', async () => {
    globalThis.fetch = (async () => ({ ok: true, status: 200, text: async () => RSS })) as any;
    (globalThis as any).DOMParser ??= class {
      parseFromString() { return { querySelector: () => null, querySelectorAll: () => ({ forEach() {} }) }; }
    };
    const feed = await fetchFeed('https://feeds.example.org/web.xml');
    assert.equal(feed.url, 'https://feeds.example.org/web.xml');
  });

  test('desktop enclosure download uses the Rust audio command', async () => {
    const calls = installTauri(() => new Uint8Array([9, 9, 9]).buffer);
    globalThis.fetch = (async () => { throw new Error('webview fetch must not be used on desktop'); }) as any;
    const stored: any[] = [];
    const library = { put: async (t: any) => { stored.push(t); } };
    const episode: any = { id: 'ep-safe', feedUrl: 'f', title: 'T', summary: '', audioUrl: 'https://cdn.example.net/e.mp3', played: false, playbackPosition: 0, downloadStatus: 'none', enclosureType: 'audio/mpeg' };
    const track = await downloadPodcastEnclosure(library, episode, 'Show');
    assert.equal(calls[0].cmd, 'safe_fetch_audio');
    assert.equal(track.blob.size, 3);
    assert.equal(stored.length, 1);
  });
});

describe('CSP stays restrictive and the command is wired', () => {
  const conf = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  const csp: string = conf.app.security.csp;
  test('no bare https: was re-added', () => {
    for (const part of csp.split(/[\s;]+/)) assert.ok(!['https:', 'http:', '*'].includes(part), part);
  });
  test('commands are registered in lib.rs', () => {
    const lib = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
    assert.match(lib, /mod safe_fetch;/);
    assert.match(lib, /safe_fetch::command::safe_fetch_text/);
    assert.match(lib, /safe_fetch::command::safe_fetch_audio/);
    assert.match(lib, /safe_fetch::command::safe_fetch_image/);
    assert.match(lib, /safe_fetch::command::safe_fetch_document/);
  });
});
