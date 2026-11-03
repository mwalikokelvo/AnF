import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readingState, type ReadingState } from '../src/workspace/reader-data.ts';
import {
  createKoreaderProgressIndex,
  createKoreaderQueue,
  describeReadingProgress,
  koreaderPullRequest,
  koreaderPushRequest,
  koreaderQueueFromText,
  readKoreaderQueue,
  restoreReadingState,
  toKoreaderPayload,
  writeKoreaderQueue,
  type KoreaderQueueItem,
  type KoreaderQueueStore,
} from '../src/workspace/koreader-sync.ts';

const SHORT = 'Hello world';
const CHAPTERS = '# Chapter 1\n' + 'a'.repeat(3488) + '# Chapter 2\n' + 'b'.repeat(20);

function legacy(offset: number): ReadingState {
  return { offset, bookmarks: [0], annotations: [] };
}

function frozenNote(): ReadingState {
  return Object.freeze({
    offset: 0,
    bookmarks: Object.freeze([0]),
    annotations: Object.freeze([
      Object.freeze({ id: 'n1', start: 0, end: 5, quote: 'Hello', color: 'gold' as const, note: 'keep' }),
    ]),
  });
}

function memoryQueue(): KoreaderQueueStore & { items(): KoreaderQueueItem[] } {
  let items: KoreaderQueueItem[] = [];
  return {
    load: () => items.map(item => ({ ...item })),
    save: (next) => { items = next.map(item => ({ ...item })); },
    items: () => items.map(item => ({ ...item })),
  };
}

test('reading progress serializes to a KOReader payload with chapter, percentage, locator, and device fields', () => {
  const position = describeReadingProgress(CHAPTERS, legacy(3500));
  assert.deepEqual(position, {
    document: '12d7a82e',
    chapter: 2,
    percentage: 0.9909,
    progress: 'anf:3500',
  });

  const payload = toKoreaderPayload(SHORT, legacy(4), {
    device: 'AnF',
    device_id: 'device-1',
    timestamp: 1700000000,
  });
  assert.deepEqual(payload, {
    document: '594d29c7',
    progress: 'anf:4',
    percentage: 0.3636,
    device: 'AnF',
    device_id: 'device-1',
    timestamp: 1700000000,
  });
  assert.equal(describeReadingProgress(SHORT, legacy(0)).chapter, 1);
  assert.equal(describeReadingProgress(SHORT, legacy(0)).percentage, 0);
});

test('a remote KOReader record restores the local offset and leaves bookmarks, notes, and the stored shape alone', () => {
  const local = frozenNote();
  const payload = toKoreaderPayload(SHORT, legacy(4), {
    device: 'KOReader',
    device_id: 'other-device',
    timestamp: 1700000100,
  });
  const restored = restoreReadingState(SHORT, local, payload, { device_id: 'device-1', timestamp: 1700000000 });
  assert.equal(restored.offset, 4);
  assert.deepEqual(restored.bookmarks, [0]);
  assert.deepEqual(restored.annotations, local.annotations);
  assert.deepEqual(Object.keys(restored).sort(), ['annotations', 'bookmarks', 'offset']);
  assert.equal(readingState(restored, SHORT).offset, 4);
  assert.equal(local.offset, 0);

  const page = restoreReadingState(CHAPTERS, legacy(0), {
    document: '12d7a82e',
    progress: '2',
    percentage: 0.1,
    device: 'KOReader',
    device_id: 'other-device',
    timestamp: 1700000200,
  }, { device_id: 'device-1', timestamp: 1700000000 });
  assert.equal(page.offset, 3500);
  assert.deepEqual(page.bookmarks, [0]);
  assert.deepEqual(Object.keys(page).sort(), ['annotations', 'bookmarks', 'offset']);
});

test('an older or same-device progress record does not move the saved position', () => {
  const local = legacy(4);
  const older = restoreReadingState(SHORT, local, {
    progress: 'anf:0',
    percentage: 0,
    device: 'KOReader',
    device_id: 'other-device',
    timestamp: 100,
  }, { device_id: 'device-1', timestamp: 200 });
  assert.equal(older.offset, 4);

  const echo = restoreReadingState(SHORT, local, {
    progress: 'anf:0',
    percentage: 0,
    device: 'AnF',
    device_id: 'device-1',
    timestamp: 999,
  }, { device_id: 'device-1', timestamp: 200 });
  assert.equal(echo.offset, 4);

  const unstamped = restoreReadingState(SHORT, legacy(0), {
    progress: 'not-a-locator',
    percentage: 0.5,
    device: 'KOReader',
    device_id: 'other-device',
  }, { device_id: 'device-1', timestamp: 200 });
  assert.equal(unstamped.offset, 6);
});

test('PUT /syncs/progress then GET round-trips progress, device_id, and timestamp without touching reading notes', () => {
  const index = createKoreaderProgressIndex(() => 1700000100);
  const headers = { 'x-auth-user': 'ada', 'x-auth-key': 'secret-key' };
  const denied = index.handle({ method: 'PUT', path: '/syncs/progress', headers: {}, body: { document: '594d29c7', progress: 'anf:4', percentage: 0.3636, device: 'AnF', device_id: 'device-1' } });
  assert.equal(denied.status, 401);
  assert.equal(JSON.stringify(denied.body).includes('secret-key'), false);

  const stored = index.handle({
    method: 'PUT',
    path: '/syncs/progress',
    headers,
    body: { document: '594d29c7', progress: '12', percentage: 0.5, device: 'KOReader', device_id: 'koreader-1' },
  });
  assert.equal(stored.status, 200);
  assert.equal(stored.body.timestamp, 1700000100);
  assert.equal('bookmarks' in stored.body, false);
  assert.equal('offset' in stored.body, false);

  const fetched = index.handle({ method: 'GET', path: '/syncs/progress/594d29c7', headers });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.progress, '12');
  assert.equal(fetched.body.device_id, 'koreader-1');
  assert.equal(fetched.body.timestamp, 1700000100);

  const missing = index.handle({ method: 'GET', path: '/syncs/progress/missing', headers });
  assert.equal(missing.status, 200);
  assert.equal('percentage' in missing.body, false);
});

test('push and pull requests use the KOReader progress paths and keep the auth key out of the URL', () => {
  const payload = toKoreaderPayload(SHORT, legacy(4), { device: 'AnF', device_id: 'device-1', timestamp: 1700000000 });
  const push = koreaderPushRequest('https://sync.example.test:8443/', { username: 'ada', userkey: 'secret-key' }, payload);
  assert.equal(push.method, 'PUT');
  assert.equal(push.url, 'https://sync.example.test:8443/syncs/progress');
  assert.equal(push.headers.accept, 'application/vnd.koreader.v1+json');
  assert.equal(push.headers['x-auth-user'], 'ada');
  assert.equal(push.headers['x-auth-key'], 'secret-key');
  assert.equal(push.url.includes('secret-key'), false);
  assert.equal(push.body.progress, 'anf:4');
  assert.equal(push.body.device_id, 'device-1');
  assert.equal(push.body.timestamp, 1700000000);

  const pull = koreaderPullRequest('https://sync.example.test', { username: 'ada', userkey: 'secret-key' }, '594d29c7');
  assert.equal(pull.method, 'GET');
  assert.equal(pull.url, 'https://sync.example.test/syncs/progress/594d29c7');
  assert.equal(pull.url.includes('secret-key'), false);
  assert.throws(() => koreaderPushRequest('https://sync.example.test', { username: 'ada\r\nX-Injected: 1', userkey: 'secret-key' }, payload), /line break/);
});

test('a dropped progress push stays queued and is delivered on the next drain', async () => {
  const store = memoryQueue();
  const queue = createKoreaderQueue(store, () => 1700000000);
  const item = toKoreaderPayload(SHORT, legacy(4), { device: 'AnF', device_id: 'device-1', timestamp: 1700000000 });
  const queued = await queue.sync(item, async () => { throw new Error('network down'); });
  assert.equal(queued, 'queued');
  assert.equal(queue.count(), 1);
  assert.equal(store.items()[0].progress, 'anf:4');
  assert.equal(store.items()[0].device_id, 'device-1');
  assert.equal(store.items()[0].timestamp, 1700000000);

  const rejected = await queue.sync(item, async () => ({ status: 401 }));
  assert.equal(rejected, 'rejected');
  assert.equal(queue.count(), 1);

  let attempts = 0;
  const stopped = await queue.drain(async () => {
    attempts += 1;
    throw new Error('still offline');
  });
  assert.equal(stopped, 0);
  assert.equal(attempts, 1);
  assert.equal(queue.count(), 1);

  const sent: string[] = [];
  const delivered = await queue.drain(async (queuedItem) => {
    sent.push(queuedItem.progress);
    return true;
  });
  assert.equal(delivered, 1);
  assert.deepEqual(sent, ['anf:4']);
  assert.equal(queue.count(), 0);

  const pushed = await queue.sync({ ...item, progress: 'anf:9', timestamp: 1700000001 }, async () => ({ status: 200 }));
  assert.equal(pushed, 'pushed');
  assert.equal(queue.count(), 0);
});

test('the offline queue keeps the latest progress for a document each day and drops expired entries', () => {
  const store = memoryQueue();
  let now = 1700000000;
  const queue = createKoreaderQueue(store, () => now);
  const base = { percentage: 0.1, device: 'AnF', device_id: 'device-1', timestamp: now };
  queue.push({ document: 'aaaa', progress: 'anf:1', ...base });
  queue.push({ document: 'aaaa', progress: 'anf:4', ...base, timestamp: now + 5 });
  assert.equal(queue.count(), 1);
  assert.equal(store.items()[0].progress, 'anf:4');

  now += 86400;
  queue.push({ document: 'aaaa', progress: 'anf:8', ...base, timestamp: now });
  assert.equal(queue.count(), 2);

  now += 29 * 86400;
  queue.push({ document: 'bbbb', progress: 'anf:1', ...base, timestamp: now });
  assert.deepEqual(store.items().map(item => item.document), ['bbbb']);
});

test('a transient push is retried and a later success is not queued', async () => {
  const store = memoryQueue();
  const queue = createKoreaderQueue(store, () => 1700000000);
  const item = toKoreaderPayload(SHORT, legacy(4), { device: 'AnF', device_id: 'device-1', timestamp: 1700000000 });
  const waits: number[] = [];
  let attempts = 0;
  const result = await queue.sync(item, async () => {
    attempts += 1;
    if (attempts < 3) return { status: 503 };
    return { status: 202 };
  }, {
    attempts: 3,
    sleep: (ms) => { waits.push(ms); },
  });
  assert.equal(result, 'pushed');
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [50, 100]);
  assert.equal(queue.count(), 0);
});

test('repeated transport failures queue one progress record and stop at five tries', async () => {
  const store = memoryQueue();
  const queue = createKoreaderQueue(store, () => 1700000000);
  const item = toKoreaderPayload(SHORT, legacy(4), { device: 'AnF', device_id: 'device-1', timestamp: 1700000000 });
  let attempts = 0;
  const result = await queue.sync(item, async () => {
    attempts += 1;
    throw new Error('connection reset');
  }, { attempts: 100, sleep: () => {} });
  assert.equal(result, 'queued');
  assert.equal(attempts, 5);
  assert.equal(queue.count(), 1);
  assert.equal(store.items()[0].progress, 'anf:4');
  assert.equal(store.items()[0].device_id, 'device-1');
});

test('an auth failure after a retryable status is not queued and is not retried further', async () => {
  const store = memoryQueue();
  const queue = createKoreaderQueue(store, () => 1700000000);
  const item = toKoreaderPayload(SHORT, legacy(4), { device: 'AnF', device_id: 'device-1', timestamp: 1700000000 });
  const waits: number[] = [];
  let attempts = 0;
  const result = await queue.sync(item, async () => {
    attempts += 1;
    if (attempts === 1) return { status: 503 };
    return { status: 401 };
  }, { attempts: 4, sleep: (ms) => { waits.push(ms); } });
  assert.equal(result, 'rejected');
  assert.equal(attempts, 2);
  assert.deepEqual(waits, [50]);
  assert.equal(queue.count(), 0);
  assert.equal(JSON.stringify(store.items()).includes('secret'), false);
});

test('a reloaded queue file keeps progress fields, drops secrets, and survives a corrupt file', async () => {
  const payload = toKoreaderPayload(SHORT, legacy(4), {
    device: 'AnF',
    device_id: 'device-1',
    timestamp: 1700000000,
    metadata: { title: 'Hello' },
  });
  const poisoned = JSON.stringify([{
    ...payload,
    queued_at: 1700000000,
    userkey: 'secret-key',
    bookmarks: [1],
    offset: 4,
  }]);
  const loaded = readKoreaderQueue(poisoned);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].progress, 'anf:4');
  assert.equal(loaded[0].percentage, 0.3636);
  assert.equal(loaded[0].device_id, 'device-1');
  assert.equal(loaded[0].timestamp, 1700000000);
  assert.equal(loaded[0].queued_at, 1700000000);
  assert.equal(loaded[0].metadata?.title, 'Hello');
  assert.equal(JSON.stringify(loaded).includes('secret-key'), false);
  assert.equal('bookmarks' in loaded[0], false);
  assert.equal('offset' in loaded[0], false);
  assert.deepEqual(readKoreaderQueue(writeKoreaderQueue(loaded)), loaded);
  assert.deepEqual(readKoreaderQueue('{'), []);
  assert.deepEqual(readKoreaderQueue(JSON.stringify([{ document: 'slash/id', progress: 'anf:1', percentage: 0.1, device: 'AnF', device_id: 'device-1', timestamp: 1, queued_at: 1 }])), []);

  let text = '{';
  const store = koreaderQueueFromText(() => text, (next) => { text = next; });
  const queue = createKoreaderQueue(store, () => 1700000100);
  assert.equal(queue.count(), 0);
  const queued = await queue.sync(payload, async () => { throw new Error('offline'); }, { attempts: 1 });
  assert.equal(queued, 'queued');
  const again = readKoreaderQueue(text);
  assert.equal(again.length, 1);
  assert.equal(again[0].progress, 'anf:4');
  assert.equal(again[0].metadata?.title, 'Hello');
  assert.equal(JSON.stringify(again).includes('secret-key'), false);

  const reloaded = createKoreaderQueue(store, () => 1700000100);
  const sent: string[] = [];
  const delivered = await reloaded.drain(async (item) => {
    sent.push(item.progress);
    return true;
  });
  assert.equal(delivered, 1);
  assert.deepEqual(sent, ['anf:4']);
  assert.equal(reloaded.count(), 0);
});

test('drain drops expired progress and still delivers the later record', async () => {
  const store = memoryQueue();
  const freshAt = 1700000000;
  store.save([
    { document: 'aaaa', progress: 'anf:1', percentage: 0.1, device: 'AnF', device_id: 'device-1', timestamp: 1, queued_at: freshAt - 29 * 86400 },
    { document: 'bbbb', progress: 'anf:8', percentage: 0.2, device: 'AnF', device_id: 'device-1', timestamp: 2, queued_at: freshAt },
  ]);
  const queue = createKoreaderQueue(store, () => freshAt);
  const sent: string[] = [];
  const delivered = await queue.drain(async (item) => {
    sent.push(item.document);
    return item.document === 'bbbb';
  });
  assert.equal(delivered, 1);
  assert.deepEqual(sent, ['bbbb']);
  assert.equal(queue.count(), 0);
  assert.deepEqual(Object.keys(store.items()[0] ?? {}).sort(), []);
});
