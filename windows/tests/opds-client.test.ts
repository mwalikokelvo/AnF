import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  drainOpdsQueue,
  opdsFeedsFromText,
  opdsQueueFromText,
  parseOpds,
  prefetchBookCovers,
  readOpdsFeeds,
  readOpdsQueue,
  traverseOpds,
  writeOpdsFeeds,
  writeOpdsQueue,
  type CoverCache,
  type CoverDisk,
  type OpdsBook,
  type OpdsFeedRecord,
  type OpdsFeedStore,
  type OpdsQueueStore,
  type OpdsQueuedRequest,
} from '../src/workspace/opds-client.ts';

const ROOT = 'https://example.org/catalog/root';

const PAGE_1 = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Library</title>
  <entry>
    <title>Decoy</title>
    <link rel="next" href="https://evil.example/book-next" type="application/atom+xml"/>
  </entry>
  <link rel="self" href="https://example.org/catalog/root"/>
  <link rel="next" href="?page=2&amp;offset=20"/>
  <entry>
    <id>urn:book:a</id>
    <title>Book A</title>
    <link rel="http://opds-spec.org/image/thumbnail" href="covers/a-thumb.jpg" type="image/jpeg"/>
    <link rel="http://opds-spec.org/image" href="covers/a.jpg" type="image/jpeg"/>
    <link rel="http://opds-spec.org/acquisition/open-access" href="../a.epub" type="application/epub+zip"/>
  </entry>
</feed>`;

const PAGE_2 = JSON.stringify({
  metadata: { title: 'Library' },
  links: [{ rel: ['next'], href: '?page=3' }],
  groups: [{
    publications: [{
      metadata: { title: { en: 'Book B' }, identifier: 'urn:book:b' },
      links: [{ rel: 'next', href: 'https://evil.example/pub-next' }],
      images: [{ href: 'https://cdn.example/b.jpg', rel: 'http://opds-spec.org/image' }],
    }],
  }],
});

const PAGE_3 = `<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Library</title>
  <entry>
    <id>urn:book:c</id>
    <title>Book C</title>
    <link rel="http://opds-spec.org/acquisition" href="https://example.org/c.epub" type="application/epub+zip"/>
  </entry>
</feed>`;

const PAGE_2_URL = 'https://example.org/catalog/root?page=2&offset=20';
const PAGE_3_URL = 'https://example.org/catalog/root?page=3';

function catalog(extra: Record<string, string> = {}): { bodies: Map<string, string>; fetched: string[] } {
  const bodies = new Map<string, string>([
    [ROOT, PAGE_1],
    [PAGE_2_URL, PAGE_2],
    [PAGE_3_URL, PAGE_3],
    ...Object.entries(extra),
  ]);
  return { bodies, fetched: [] };
}

async function pull(bodies: Map<string, string>, fetched: string[], url: string): Promise<string> {
  fetched.push(url);
  return bodies.get(url) ?? '';
}

test('walks atom and json pages until rel=next disappears', async () => {
  const { bodies, fetched } = catalog();
  const result = await traverseOpds(ROOT, (url) => pull(bodies, fetched, url));
  assert.deepEqual(fetched, [ROOT, PAGE_2_URL, PAGE_3_URL]);
  assert.equal(result.pages, 3);
  assert.equal(result.stopped, 'end');
  assert.deepEqual(result.books.map((book) => book.id), ['urn:book:a', 'urn:book:b', 'urn:book:c']);
  assert.deepEqual(result.books.map((book) => book.title), ['Book A', 'Book B', 'Book C']);
  assert.equal(result.books[0].thumbnailUrl, 'https://example.org/catalog/covers/a-thumb.jpg');
  assert.equal(result.books[0].imageUrl, 'https://example.org/catalog/covers/a.jpg');
  assert.equal(result.books[1].imageUrl, 'https://cdn.example/b.jpg');
  assert.equal(result.books[1].thumbnailUrl, undefined);
});

test('reads page, offset, and cursor from the next link, not the current page', () => {
  const page = parseOpds(
    `<feed xmlns="http://www.w3.org/2005/Atom"><link rel="next" href="?page=4&amp;offset=60&amp;cursor=shelf-9"/></feed>`,
    'https://example.org/catalog/root?page=1',
  );
  assert.equal(page.next?.url, 'https://example.org/catalog/root?page=4&offset=60&cursor=shelf-9');
  assert.equal(page.next?.page, 4);
  assert.equal(page.next?.offset, 60);
  assert.equal(page.next?.cursor, 'shelf-9');
});

test('computes the next offset from OpenSearch when the link has none', () => {
  const page = parseOpds(
    `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
      <opensearch:startIndex>21</opensearch:startIndex>
      <opensearch:itemsPerPage>20</opensearch:itemsPerPage>
      <link rel="next" href="?page=3"/>
    </feed>`,
    ROOT,
  );
  assert.equal(page.next?.url, PAGE_3_URL);
  assert.equal(page.next?.page, 3);
  assert.equal(page.next?.offset, 41);

  const explicit = parseOpds(
    `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
      <opensearch:startIndex>21</opensearch:startIndex>
      <opensearch:itemsPerPage>20</opensearch:itemsPerPage>
      <link rel="next" href="?page=3&amp;offset=40"/>
    </feed>`,
    ROOT,
  );
  assert.equal(explicit.next?.offset, 40);
});

test('drops a next link that is not a plain http(s) url', () => {
  const userinfo = parseOpds(
    `<feed xmlns="http://www.w3.org/2005/Atom"><link rel="next" href="https://user:secret@example.org/p?page=2"/></feed>`,
    ROOT,
  );
  const script = parseOpds(
    `<feed xmlns="http://www.w3.org/2005/Atom"><link rel="next" href="javascript:alert(1)"/></feed>`,
    ROOT,
  );
  assert.equal(userinfo.next, undefined);
  assert.equal(script.next, undefined);
});

test('an empty feed stops the walk even when it still advertises rel=next', async () => {
  const empty = `<feed xmlns="http://www.w3.org/2005/Atom"><link rel="next" href="?page=3"/></feed>`;
  const { bodies, fetched } = catalog({ [PAGE_2_URL]: empty });
  const result = await traverseOpds(ROOT, (url) => pull(bodies, fetched, url));
  assert.deepEqual(fetched, [ROOT, PAGE_2_URL]);
  assert.equal(result.pages, 2);
  assert.equal(result.stopped, 'empty');
  assert.deepEqual(result.books.map((book) => book.title), ['Book A']);
});

test('a blank feed body ends the catalog', async () => {
  const { bodies, fetched } = catalog({ [PAGE_2_URL]: ' \n\t' });
  const result = await traverseOpds(ROOT, (url) => pull(bodies, fetched, url));
  assert.deepEqual(fetched, [ROOT, PAGE_2_URL]);
  assert.equal(result.stopped, 'empty');
  assert.equal(result.pages, 2);
  assert.deepEqual(result.books.map((book) => book.id), ['urn:book:a']);
});

test('a doctype payload is not followed', async () => {
  const hostile = `<!DOCTYPE feed [<!ENTITY x SYSTEM "https://evil.example/next">]><feed><link rel="next" href="https://evil.example/next"/></feed>`;
  const fetched: string[] = [];
  const result = await traverseOpds(ROOT, async (url) => {
    fetched.push(url);
    return hostile;
  });
  assert.deepEqual(fetched, [ROOT]);
  assert.equal(result.pages, 1);
  assert.equal(result.stopped, 'empty');
  assert.deepEqual(result.books, []);
});

test('stops when the next url repeats a page already fetched', async () => {
  const loop = JSON.stringify({
    metadata: { title: 'Library' },
    links: [{ rel: 'next', href: ROOT }],
    publications: [{ metadata: { title: 'Book B', identifier: 'urn:book:b' } }],
  });
  const { bodies, fetched } = catalog({ [PAGE_2_URL]: loop });
  const result = await traverseOpds(ROOT, (url) => pull(bodies, fetched, url));
  assert.deepEqual(fetched, [ROOT, PAGE_2_URL]);
  assert.equal(result.stopped, 'cycle');
  assert.equal(result.pages, 2);
  assert.deepEqual(result.books.map((book) => book.id), ['urn:book:a', 'urn:book:b']);
});

test('stops at the page cap while a further next link exists', async () => {
  const { bodies, fetched } = catalog();
  const result = await traverseOpds(ROOT, (url) => pull(bodies, fetched, url), { maxPages: 2 });
  assert.deepEqual(fetched, [ROOT, PAGE_2_URL]);
  assert.equal(result.stopped, 'limit');
  assert.equal(result.pages, 2);
  assert.deepEqual(result.books.map((book) => book.id), ['urn:book:a', 'urn:book:b']);
});

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0]);
const HTML = new TextEncoder().encode('<html>not an image</html>');

function fileDisk(dir: string): CoverDisk {
  return {
    async read(name) {
      try {
        return new Uint8Array(await readFile(path.join(dir, name)));
      } catch (err) {
        if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') return null;
        throw err;
      }
    },
    write: (name, bytes) => writeFile(path.join(dir, name), bytes),
  };
}

async function withCache(
  fetch: CoverCache['fetch'],
  timeoutMs: number,
  run: (cache: CoverCache, dir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'anf-opds-cover-'));
  try {
    await run({ memory: new Map(), disk: fileDisk(dir), timeoutMs, fetch }, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('a corrupt thumbnail is not stored and the full image is used', async () => {
  const calls: string[] = [];
  const book: OpdsBook = {
    id: 'urn:book:a',
    title: 'Book A',
    thumbnailUrl: 'https://cdn.example/a-thumb.jpg',
    imageUrl: 'https://cdn.example/a.jpg',
  };
  await withCache(async (url) => {
    calls.push(url);
    if (url.endsWith('a-thumb.jpg')) return { status: 200, body: HTML };
    return { status: 200, body: PNG };
  }, 200, async (cache, dir) => {
    const [result] = await prefetchBookCovers([book], cache);
    assert.equal(result.ok, true);
    assert.equal(result.source, 'network');
    assert.equal(result.url, 'https://cdn.example/a.jpg');
    assert.deepEqual(result.bytes, PNG);
    assert.deepEqual(calls, ['https://cdn.example/a-thumb.jpg', 'https://cdn.example/a.jpg']);
    const names = await readdir(dir);
    assert.equal(names.length, 1);
    assert.deepEqual(new Uint8Array(await readFile(path.join(dir, names[0]))), PNG);
    assert.equal(cache.memory.has('https://cdn.example/a-thumb.jpg'), false);
    assert.deepEqual(cache.memory.get('https://cdn.example/a.jpg'), PNG);
  });
});

test('a slow thumbnail falls back to the next image before the deadline', async () => {
  let sawAbort = false;
  const book: OpdsBook = {
    id: 'urn:book:a',
    title: 'Book A',
    thumbnailUrl: 'https://cdn.example/slow.jpg',
    imageUrl: 'https://cdn.example/a.gif',
  };
  await withCache((url, signal) => {
    if (url.endsWith('slow.jpg')) {
      return new Promise((_resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('hung')), 3000);
        timer.unref?.();
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          sawAbort = true;
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }
    return Promise.resolve({ status: 200, body: GIF });
  }, 40, async (cache) => {
    const started = Date.now();
    const [result] = await prefetchBookCovers([book], cache);
    assert.ok(Date.now() - started < 1000);
    assert.equal(sawAbort, true);
    assert.equal(result.ok, true);
    assert.equal(result.url, 'https://cdn.example/a.gif');
    assert.deepEqual(result.bytes, GIF);
  });
});

test('broken and corrupt cover urls leave the cache empty', async () => {
  const book: OpdsBook = {
    id: 'urn:book:a',
    title: 'Book A',
    thumbnailUrl: 'https://cdn.example/missing.jpg',
    imageUrl: 'https://cdn.example/junk.jpg',
  };
  await withCache(async (url) => {
    if (url.endsWith('missing.jpg')) return { status: 404, body: HTML };
    return { status: 200, body: HTML };
  }, 200, async (cache, dir) => {
    const [result] = await prefetchBookCovers([book], cache);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'corrupt');
    assert.equal(result.bytes, undefined);
    assert.equal(cache.memory.size, 0);
    assert.deepEqual(await readdir(dir), []);
  });
});

test('a cover already on disk or in memory is not fetched again', async () => {
  let calls = 0;
  const book: OpdsBook = {
    id: 'urn:book:b',
    title: 'Book B',
    imageUrl: 'https://cdn.example/b.jpg',
  };
  const fetch: CoverCache['fetch'] = async () => {
    calls += 1;
    return { status: 200, body: PNG };
  };
  await withCache(fetch, 200, async (cache, dir) => {
    const [first] = await prefetchBookCovers([book], cache);
    assert.equal(first.source, 'network');
    assert.equal(calls, 1);
    const [second] = await prefetchBookCovers([book], cache);
    assert.equal(second.source, 'memory');
    assert.deepEqual(second.bytes, PNG);
    assert.equal(calls, 1);

    const fresh: CoverCache = { memory: new Map(), disk: fileDisk(dir), timeoutMs: 200, fetch };
    const [fromDisk] = await prefetchBookCovers([book], fresh);
    assert.equal(fromDisk.source, 'disk');
    assert.deepEqual(fromDisk.bytes, PNG);
    assert.equal(calls, 1);

    const names = await readdir(dir);
    await writeFile(path.join(dir, names[0]), HTML);
    const again: CoverCache = { memory: new Map(), disk: fileDisk(dir), timeoutMs: 200, fetch };
    const [repaired] = await prefetchBookCovers([book], again);
    assert.equal(repaired.source, 'network');
    assert.deepEqual(repaired.bytes, PNG);
    assert.equal(calls, 2);
    assert.deepEqual(new Uint8Array(await readFile(path.join(dir, names[0]))), PNG);
  });
});

function memoryFeeds(initial: OpdsFeedRecord[] = []): OpdsFeedStore & { records(): OpdsFeedRecord[] } {
  let records = initial.map((record) => ({ ...record }));
  return {
    load: () => records.map((record) => ({ ...record })),
    save: (next) => { records = next.map((record) => ({ ...record })); },
    records: () => records.map((record) => ({ ...record })),
  };
}

function memoryRequests(initial: OpdsQueuedRequest[] = []): OpdsQueueStore & { items(): OpdsQueuedRequest[] } {
  let items = initial.map((item) => ({ ...item }));
  return {
    load: () => items.map((item) => ({ ...item })),
    save: (next) => { items = next.map((item) => ({ ...item })); },
    items: () => items.map((item) => ({ ...item })),
  };
}

const HTML_PAGE = '<html><title>502 Bad Gateway</title></html>';

test('a catalog fetch that fails twice then succeeds is stored and not queued', async () => {
  const feeds = memoryFeeds();
  const queue = memoryRequests();
  let attempts = 0;
  const result = await traverseOpds(ROOT, async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('connection reset');
    return PAGE_3;
  }, { attempts: 3, resilience: { feeds, queue, attempts: 3, now: () => 1700000000 } });
  assert.equal(attempts, 3);
  assert.equal(result.pages, 1);
  assert.equal(result.stopped, 'end');
  assert.deepEqual(result.books.map((book) => book.id), ['urn:book:c']);
  assert.equal(queue.items().length, 0);
  assert.equal(feeds.records()[0].url, ROOT);
  assert.equal(feeds.records()[0].parsedBody?.includes('Book C'), true);
  assert.equal(feeds.records()[0].unparsedBody, undefined);
});

test('an offline page keeps the books already read and serves the stored next page', async () => {
  const feeds = memoryFeeds([{ url: PAGE_2_URL, parsedBody: PAGE_3 }]);
  const queue = memoryRequests();
  const { bodies, fetched } = catalog();
  let attempts = 0;
  const result = await traverseOpds(ROOT, async (url) => {
    if (url === PAGE_2_URL) {
      attempts += 1;
      throw new Error('offline');
    }
    return pull(bodies, fetched, url);
  }, { resilience: { feeds, queue, attempts: 2, now: () => 50 } });
  assert.equal(attempts, 2);
  assert.deepEqual(fetched, [ROOT]);
  assert.deepEqual(result.books.map((book) => book.id), ['urn:book:a', 'urn:book:c']);
  assert.equal(result.stopped, 'end');
  assert.deepEqual(queue.items(), [{ url: PAGE_2_URL, queuedAt: 50 }]);
  assert.equal(feeds.records()[0].parsedBody, PAGE_3);
});

test('an unparsed catalog page is stored and does not replace the last parsed feed', async () => {
  const feeds = memoryFeeds([{ url: ROOT, parsedBody: PAGE_3 }]);
  const queue = memoryRequests();
  const result = await traverseOpds(ROOT, async () => HTML_PAGE, {
    resilience: { feeds, queue, attempts: 3, now: () => 1 },
  });
  assert.equal(result.books[0].id, 'urn:book:c');
  assert.equal(result.stopped, 'end');
  assert.equal(queue.items().length, 0);
  assert.equal(feeds.records()[0].parsedBody, PAGE_3);
  assert.equal(feeds.records()[0].unparsedBody, HTML_PAGE);
});

test('a hostile catalog body is stored unparsed and is never served as a fallback', async () => {
  const hostile = '<!DOCTYPE feed [<!ENTITY x SYSTEM "https://evil.example/x">]><feed><title>Nope</title><link rel="next" href="https://evil.example/next"/></feed>';
  const feeds = memoryFeeds();
  const queue = memoryRequests();
  const first = await traverseOpds(ROOT, async () => hostile, {
    resilience: { feeds, queue, attempts: 1, now: () => 1 },
  });
  assert.deepEqual(first.books, []);
  assert.equal(first.stopped, 'empty');
  assert.equal(queue.items().length, 0);
  assert.equal(feeds.records()[0].parsedBody, undefined);
  assert.equal(feeds.records()[0].unparsedBody, hostile);

  let attempts = 0;
  const second = await traverseOpds(ROOT, async () => {
    attempts += 1;
    throw new Error('offline');
  }, { resilience: { feeds, queue, attempts: 1, now: () => 2 } });
  assert.equal(attempts, 1);
  assert.deepEqual(second.books, []);
  assert.equal(second.stopped, 'offline');
  assert.equal(feeds.records()[0].parsedBody, undefined);
  assert.deepEqual(queue.items().map((item) => item.url), [ROOT]);
});

test('a real empty feed replaces the stored catalog instead of replaying stale books', async () => {
  const feeds = memoryFeeds([{ url: ROOT, parsedBody: PAGE_3, unparsedBody: HTML_PAGE }]);
  const queue = memoryRequests();
  const empty = '<feed xmlns="http://www.w3.org/2005/Atom"><title>Library</title></feed>';
  const result = await traverseOpds(ROOT, async () => empty, {
    resilience: { feeds, queue, now: () => 1 },
  });
  assert.deepEqual(result.books, []);
  assert.equal(result.stopped, 'empty');
  assert.equal(feeds.records()[0].parsedBody, empty);
  assert.equal(feeds.records()[0].unparsedBody, undefined);
  assert.equal(queue.items().length, 0);
});

test('a blank catalog body does not overwrite the stored feed or queue a request', async () => {
  let saves = 0;
  const feeds: OpdsFeedStore = {
    load: () => [{ url: ROOT, parsedBody: PAGE_3 }],
    save: () => { saves += 1; },
  };
  const queue = memoryRequests();
  const result = await traverseOpds(ROOT, async () => ' \n\t', {
    resilience: { feeds, queue, now: () => 1 },
  });
  assert.deepEqual(result.books, []);
  assert.equal(result.stopped, 'empty');
  assert.equal(saves, 0);
  assert.equal(queue.items().length, 0);
});

test('an oversized unparsed body is not stored and the parsed feed stays in use', async () => {
  const feeds = memoryFeeds([{ url: ROOT, parsedBody: PAGE_3 }]);
  const queue = memoryRequests();
  const huge = `<html>${'x'.repeat(70_000)}</html>`;
  const result = await traverseOpds(ROOT, async () => huge, {
    resilience: { feeds, queue, now: () => 1 },
  });
  assert.equal(result.books[0].id, 'urn:book:c');
  assert.equal(feeds.records()[0].parsedBody, PAGE_3);
  assert.equal(feeds.records()[0].unparsedBody, undefined);
});

test('feed and queue files round-trip, drop unsafe urls, and collapse duplicate requests', () => {
  const written = writeOpdsFeeds([{
    url: ROOT,
    parsedBody: PAGE_3,
    unparsedBody: HTML_PAGE,
    extra: 'drop',
  } as OpdsFeedRecord & { extra: string }]);
  const feeds = readOpdsFeeds(written);
  assert.equal(feeds.length, 1);
  assert.equal('extra' in feeds[0], false);
  assert.equal(feeds[0].parsedBody, PAGE_3);
  assert.equal(feeds[0].unparsedBody, HTML_PAGE);
  assert.deepEqual(readOpdsFeeds('{'), []);
  assert.deepEqual(readOpdsFeeds(JSON.stringify([
    { url: 'javascript:alert(1)', parsedBody: PAGE_3 },
    { url: 'https://user:secret@example.org/catalog', parsedBody: PAGE_3 },
    { url: ROOT, parsedBody: '<!DOCTYPE feed [<!ENTITY x SYSTEM "file:///etc/passwd">]><feed></feed>' },
  ])), []);

  const queued = writeOpdsQueue([
    { url: ROOT, queuedAt: 10 },
    { url: ROOT, queuedAt: 12 },
    { url: 'javascript:alert(1)', queuedAt: 9 },
    { url: 'https://user:secret@example.org/p', queuedAt: 9 },
  ]);
  assert.deepEqual(readOpdsQueue(queued), [{ url: ROOT, queuedAt: 12 }]);
  assert.deepEqual(readOpdsQueue('nope'), []);
});

test('a successful catalog read removes that url from the offline queue', async () => {
  const feeds = memoryFeeds();
  const queue = memoryRequests([
    { url: ROOT, queuedAt: 1 },
    { url: PAGE_3_URL, queuedAt: 2 },
  ]);
  const result = await traverseOpds(ROOT, async () => PAGE_3, {
    resilience: { feeds, queue, now: () => 3 },
  });
  assert.equal(result.books[0].id, 'urn:book:c');
  assert.deepEqual(queue.items(), [{ url: PAGE_3_URL, queuedAt: 2 }]);
});

test('drain retries a queued catalog and leaves the next url queued when it stays offline', async () => {
  const feeds = memoryFeeds();
  const queue = memoryRequests([
    { url: ROOT, queuedAt: 10 },
    { url: PAGE_3_URL, queuedAt: 11 },
  ]);
  let rootTries = 0;
  let pageTries = 0;
  const sent = await drainOpdsQueue({ feeds, queue, attempts: 3, now: () => 20 }, async (url) => {
    if (url === ROOT) {
      rootTries += 1;
      if (rootTries < 3) throw new Error('reset');
      return PAGE_3;
    }
    pageTries += 1;
    throw new Error('still down');
  });
  assert.equal(sent, 1);
  assert.equal(rootTries, 3);
  assert.equal(pageTries, 3);
  assert.deepEqual(queue.items().map((item) => item.url), [PAGE_3_URL]);
  assert.equal(feeds.records()[0].url, ROOT);
  assert.match(feeds.records()[0].parsedBody ?? '', /Book C/);
});

test('drain drops expired and credentialed urls without requesting them', async () => {
  const feeds = memoryFeeds();
  const queue = memoryRequests([
    { url: ROOT, queuedAt: 1 },
    { url: 'https://user:secret@example.org/catalog', queuedAt: 1700000000 },
  ]);
  let calls = 0;
  const sent = await drainOpdsQueue({
    feeds,
    queue,
    attempts: 1,
    now: () => 1700000000,
  }, async () => {
    calls += 1;
    return PAGE_3;
  });
  assert.equal(calls, 0);
  assert.equal(sent, 0);
  assert.equal(queue.items().length, 0);
  assert.equal(JSON.stringify(queue.items()).includes('secret'), false);
});

test('a second drain does not send the queued catalog while the first request is in flight', async () => {
  const feeds = memoryFeeds();
  const queue = memoryRequests([{ url: ROOT, queuedAt: 1 }]);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  const first = drainOpdsQueue({ feeds, queue, attempts: 1, now: () => 2 }, async () => {
    calls += 1;
    await gate;
    return PAGE_3;
  });
  const second = await drainOpdsQueue({ feeds, queue, attempts: 1, now: () => 2 }, async () => PAGE_3);
  assert.equal(second, 0);
  assert.equal(calls, 1);
  release();
  assert.equal(await first, 1);
  assert.equal(calls, 1);
  assert.equal(queue.items().length, 0);
});

test('text stores reload parsed feeds and queued urls after a corrupt file', async () => {
  let feedText = '{';
  let queueText = '{';
  const feeds = opdsFeedsFromText(() => feedText, (next) => { feedText = next; });
  const queue = opdsQueueFromText(() => queueText, (next) => { queueText = next; });
  assert.deepEqual(feeds.load(), []);
  assert.deepEqual(queue.load(), []);
  const result = await traverseOpds(ROOT, async () => HTML_PAGE, {
    resilience: { feeds, queue, now: () => 4 },
  });
  assert.deepEqual(result.books, []);
  const stored = readOpdsFeeds(feedText);
  assert.equal(stored[0].unparsedBody, HTML_PAGE);
  assert.equal(stored[0].parsedBody, undefined);
  feeds.save([{ url: ROOT, parsedBody: PAGE_3, unparsedBody: HTML_PAGE }]);
  let attempts = 0;
  const offline = await traverseOpds(ROOT, async () => {
    attempts += 1;
    throw new Error('offline');
  }, { resilience: { feeds, queue, attempts: 1, now: () => 8 } });
  assert.equal(attempts, 1);
  assert.equal(offline.books[0].id, 'urn:book:c');
  assert.deepEqual(readOpdsQueue(queueText), [{ url: ROOT, queuedAt: 8 }]);
  const reloadedFeeds = opdsFeedsFromText(() => feedText, (next) => { feedText = next; });
  assert.equal(reloadedFeeds.load()[0].parsedBody, PAGE_3);
});

test('local fallback storage keeps only the newest catalog pages', async () => {
  const feeds = memoryFeeds();
  const queue = memoryRequests();
  for (let i = 0; i < 33; i += 1) {
    const url = `https://example.org/catalog/${i}`;
    const body = `<feed xmlns="http://www.w3.org/2005/Atom"><title>L</title><entry><id>urn:book:${i}</id><title>T</title><link rel="http://opds-spec.org/acquisition" href="https://example.org/b.epub"/></entry></feed>`;
    await traverseOpds(url, async () => body, { resilience: { feeds, queue, attempts: 1, now: () => i } });
  }
  const records = feeds.records();
  assert.equal(records.length, 32);
  assert.equal(records.some((record) => record.url === 'https://example.org/catalog/0'), false);
  assert.equal(records[records.length - 1].url, 'https://example.org/catalog/32');
});

test('the offline catalog queue keeps one entry per url and the newest hundred', async () => {
  const feeds = memoryFeeds();
  const queue = memoryRequests();
  for (let i = 0; i < 101; i += 1) {
    const url = `https://example.org/catalog/${i}`;
    await traverseOpds(url, async () => { throw new Error('offline'); }, {
      resilience: { feeds, queue, attempts: 1, now: () => 1000 + i },
    });
  }
  await traverseOpds(ROOT, async () => { throw new Error('offline'); }, {
    resilience: { feeds, queue, attempts: 1, now: () => 5 },
  });
  await traverseOpds(ROOT, async () => { throw new Error('offline'); }, {
    resilience: { feeds, queue, attempts: 1, now: () => 9000 },
  });
  const items = queue.items();
  assert.equal(items.length, 100);
  assert.equal(items.some((item) => item.url === 'https://example.org/catalog/0'), false);
  assert.equal(items.some((item) => item.url === 'https://example.org/catalog/1'), false);
  assert.equal(items.filter((item) => item.url === ROOT).length, 1);
  assert.equal(items.find((item) => item.url === ROOT)?.queuedAt, 9000);
});

test('cover prefetch does not request a url that carries userinfo', async () => {
  let calls = 0;
  const book: OpdsBook = {
    id: 'urn:book:a',
    title: 'Book A',
    thumbnailUrl: 'https://user:secret@cdn.example/a.jpg',
    imageUrl: 'javascript:alert(1)',
  };
  await withCache(async () => {
    calls += 1;
    return { status: 200, body: PNG };
  }, 200, async (cache) => {
    const [result] = await prefetchBookCovers([book], cache);
    assert.equal(calls, 0);
    assert.equal(result.ok, false);
    assert.equal(cache.memory.size, 0);
  });
});
