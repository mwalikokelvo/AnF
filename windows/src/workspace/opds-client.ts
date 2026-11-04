/**
 * OPDS 1.2 / 2.0 catalog client: page cursors, multi-page walks, and cover prefetch.
 * Parsing stays local. Network, the offline queue, and feed fallback are injected by the caller.
 * Neither store is the project database; reading-state fields are not added here.
 */

export interface OpdsBook {
  id: string;
  title: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  acquisitionUrl?: string;
  acquisitionType?: string;
}

export interface OpdsCursor {
  url: string;
  page?: number;
  offset?: number;
  cursor?: string;
}

export interface OpdsPage {
  title: string;
  books: OpdsBook[];
  next?: OpdsCursor;
}

export interface TraverseResult {
  books: OpdsBook[];
  pages: number;
  stopped: 'end' | 'empty' | 'cycle' | 'limit' | 'offline';
}

/** Last good catalog body, plus the most recent body that did not parse. */
export interface OpdsFeedRecord {
  url: string;
  parsedBody?: string;
  unparsedBody?: string;
}

export interface OpdsFeedStore {
  load(): OpdsFeedRecord[];
  save(records: OpdsFeedRecord[]): void;
}

export interface OpdsQueuedRequest {
  url: string;
  queuedAt: number;
}

export interface OpdsQueueStore {
  load(): OpdsQueuedRequest[];
  save(items: OpdsQueuedRequest[]): void;
}

export interface OpdsResilience {
  feeds: OpdsFeedStore;
  queue: OpdsQueueStore;
  now?: () => number;
  attempts?: number;
}

export interface CoverDisk {
  read(name: string): Promise<Uint8Array | null>;
  write(name: string, bytes: Uint8Array): Promise<void>;
}

export interface CoverCache {
  memory: Map<string, Uint8Array>;
  disk: CoverDisk;
  timeoutMs: number;
  fetch: (url: string, signal: AbortSignal) => Promise<{ status: number; body: Uint8Array }>;
}

export interface CoverResult {
  bookId: string;
  ok: boolean;
  source?: 'memory' | 'disk' | 'network';
  url?: string;
  bytes?: Uint8Array;
  reason?: 'timeout' | 'corrupt' | 'http' | 'network';
}

const DEFAULT_MAX_PAGES = 32;
const MAX_BOOKS = 10_000;
const MAX_XML_NODES = 20_000;
const MAX_COVER_BYTES = 2 * 1024 * 1024;
const MAX_FEED_RECORDS = 32;
const MAX_PARSED_CHARS = 256 * 1024;
const MAX_UNPARSED_CHARS = 64 * 1024;
const MAX_OPDS_QUEUE = 100;
const OPDS_MAX_AGE = 28 * 86400;
const OPDS_ATTEMPT_CAP = 5;
const THUMB = 'http://opds-spec.org/image/thumbnail';
const IMAGE = 'http://opds-spec.org/image';

interface XmlEl {
  name: string;
  attrs: Record<string, string>;
  text: string;
  children: XmlEl[];
}

interface RawLink {
  href: string;
  rels: string[];
  type?: string;
}

function localName(name: string): string {
  const colon = name.indexOf(':');
  return (colon >= 0 ? name.slice(colon + 1) : name).toLowerCase();
}

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (all, ent: string) => {
    if (ent === 'amp') return '&';
    if (ent === 'lt') return '<';
    if (ent === 'gt') return '>';
    if (ent === 'quot') return '"';
    if (ent === 'apos') return "'";
    const hex = ent.startsWith('#x');
    const code = hex ? Number.parseInt(ent.slice(2), 16) : Number.parseInt(ent.slice(1), 10);
    return Number.isInteger(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : all;
  });
}

function digits(value: string | null | undefined, min: number): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min) return undefined;
  return n;
}

function canonicalHttp(raw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  if (url.username !== '' || url.password !== '') return undefined;
  return url.href;
}

function resolveHref(href: string, base: string): string | undefined {
  if (!href || href.trim() !== href) return undefined;
  for (let i = 0; i < href.length; i += 1) {
    const code = href.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return undefined;
  }
  try {
    return canonicalHttp(new URL(href, base).href);
  } catch {
    return undefined;
  }
}

function cursorOf(url: string, startIndex?: number, perPage?: number): OpdsCursor {
  const parsed = new URL(url);
  const page = digits(parsed.searchParams.get('page'), 1);
  const stated = parsed.searchParams.get('offset') ?? parsed.searchParams.get('startIndex');
  let offset = digits(stated, 0);
  if (offset === undefined && startIndex !== undefined && perPage !== undefined && perPage >= 1) {
    const sum = startIndex + perPage;
    if (Number.isSafeInteger(sum)) offset = sum;
  }
  const cursor = parsed.searchParams.get('cursor') || undefined;
  const next: OpdsCursor = { url };
  if (page !== undefined) next.page = page;
  if (offset !== undefined) next.offset = offset;
  if (cursor) next.cursor = cursor;
  return next;
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let i = 0;
  while (i < raw.length) {
    while (i < raw.length && /\s/.test(raw[i])) i += 1;
    if (i >= raw.length || raw[i] === '/' || raw[i] === '>') break;
    const start = i;
    while (i < raw.length && /[^\s=/>]/.test(raw[i])) i += 1;
    const name = localName(raw.slice(start, i));
    while (i < raw.length && /\s/.test(raw[i])) i += 1;
    if (raw[i] !== '=') {
      if (name) attrs[name] = '';
      continue;
    }
    i += 1;
    while (i < raw.length && /\s/.test(raw[i])) i += 1;
    let value = '';
    const quote = raw[i];
    if (quote === '"' || quote === "'") {
      i += 1;
      const end = raw.indexOf(quote, i);
      if (end < 0) break;
      value = raw.slice(i, end);
      i = end + 1;
    } else {
      const valueStart = i;
      while (i < raw.length && !/[\s>]/.test(raw[i])) i += 1;
      value = raw.slice(valueStart, i);
    }
    if (name) attrs[name] = decodeXml(value);
  }
  return attrs;
}

function readStartTag(xml: string, lt: number): { name: string; attrs: Record<string, string>; selfClosing: boolean; next: number } | undefined {
  let i = lt + 1;
  if (xml[i] === '/' || xml[i] === '!' || xml[i] === '?') return undefined;
  const nameStart = i;
  while (i < xml.length && /[^\s/>]/.test(xml[i])) i += 1;
  const name = xml.slice(nameStart, i);
  if (!name) return undefined;
  const attrStart = i;
  let quote = '';
  while (i < xml.length) {
    const ch = xml[i];
    if (quote) {
      if (ch === quote) quote = '';
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === '>') break;
    i += 1;
  }
  if (i >= xml.length) return undefined;
  const raw = xml.slice(attrStart, i);
  return { name, attrs: parseAttrs(raw), selfClosing: /\/\s*$/.test(raw), next: i + 1 };
}

function parseXml(xml: string): XmlEl[] {
  const roots: XmlEl[] = [];
  const stack: XmlEl[] = [];
  let nodes = 0;
  let i = 0;
  const current = () => stack[stack.length - 1];
  while (i < xml.length && nodes < MAX_XML_NODES) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) {
      if (current()) current().text += xml.slice(i);
      break;
    }
    if (lt > i && current()) current().text += xml.slice(i, lt);
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      i = end < 0 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      if (current()) current().text += xml.slice(lt + 9, end < 0 ? xml.length : end);
      i = end < 0 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2);
      i = end < 0 ? xml.length : end + 2;
      continue;
    }
    if (xml.startsWith('</', lt)) {
      const end = xml.indexOf('>', lt + 2);
      const rawName = xml.slice(lt + 2, end < 0 ? xml.length : end).trim().split(/\s/)[0] ?? '';
      const name = localName(rawName);
      i = end < 0 ? xml.length : end + 1;
      for (let at = stack.length - 1; at >= 0; at -= 1) {
        if (stack[at].name === name) {
          stack.length = at;
          break;
        }
      }
      continue;
    }
    const tag = readStartTag(xml, lt);
    if (!tag) {
      i = lt + 1;
      continue;
    }
    nodes += 1;
    const el: XmlEl = { name: localName(tag.name), attrs: tag.attrs, text: '', children: [] };
    const parent = current();
    if (parent) parent.children.push(el);
    else roots.push(el);
    const empty = tag.selfClosing || el.name === 'link' || el.name === 'category';
    if (!empty && stack.length < 32) stack.push(el);
    i = tag.next;
  }
  return roots;
}

function directText(el: XmlEl | undefined): string {
  if (!el) return '';
  return decodeXml(el.text).replace(/\s+/g, ' ').trim();
}

function xmlLink(attrs: Record<string, string>, base: string): RawLink | undefined {
  if (!attrs.href) return undefined;
  const href = resolveHref(attrs.href, base);
  if (!href) return undefined;
  const type = typeof attrs.type === 'string' && attrs.type.trim() ? attrs.type.trim() : undefined;
  return { href, rels: (attrs.rel ?? '').split(/\s+/).filter(Boolean), type };
}

function isAcquisition(rel: string): boolean {
  return rel === 'download'
    || rel === 'http://opds-spec.org/acquisition'
    || rel.startsWith('http://opds-spec.org/acquisition/');
}

function isOpenAccess(rel: string): boolean {
  return rel === 'http://opds-spec.org/acquisition/open-access';
}

function pickAcquisitionLink(links: readonly RawLink[]): { url?: string; type?: string } {
  const acq = links.filter((link) => link.rels.some(isAcquisition));
  if (!acq.length) return {};
  const chosen = acq.find((link) => link.rels.some(isOpenAccess)) ?? acq[0];
  const out: { url?: string; type?: string } = { url: chosen.href };
  if (chosen.type) out.type = chosen.type;
  return out;
}

function atomBook(entry: XmlEl, base: string): OpdsBook | undefined {
  const links = entry.children
    .filter((child) => child.name === 'link')
    .map((child) => xmlLink(child.attrs, base))
    .filter((link): link is RawLink => link !== undefined);
  let thumbnail: string | undefined;
  let image: string | undefined;
  const acquisition = pickAcquisitionLink(links);
  for (const link of links) {
    if (!thumbnail && link.rels.includes(THUMB)) thumbnail = link.href;
    if (!image && link.rels.includes(IMAGE)) image = link.href;
  }
  if (!acquisition.url && !thumbnail && !image) return undefined;
  const title = directText(entry.children.find((child) => child.name === 'title'));
  const id = directText(entry.children.find((child) => child.name === 'id')) || title;
  if (!id) return undefined;
  const book: OpdsBook = { id, title: title || id };
  if (thumbnail) book.thumbnailUrl = thumbnail;
  if (image) book.imageUrl = image;
  if (acquisition.url) book.acquisitionUrl = acquisition.url;
  if (acquisition.type) book.acquisitionType = acquisition.type;
  return book;
}

function parseAtom(xml: string, base: string): OpdsPage {
  const feed = parseXml(xml).find((el) => el.name === 'feed');
  if (!feed) return { title: '', books: [] };
  const books: OpdsBook[] = [];
  for (const child of feed.children) {
    if (child.name !== 'entry' || books.length >= MAX_BOOKS) continue;
    const book = atomBook(child, base);
    if (book) books.push(book);
  }
  const next = feed.children
    .filter((child) => child.name === 'link')
    .map((child) => xmlLink(child.attrs, base))
    .find((link) => link?.rels.includes('next'));
  const startIndex = digits(directText(feed.children.find((child) => child.name === 'startindex')), 0);
  const perPage = digits(directText(feed.children.find((child) => child.name === 'itemsperpage')), 1);
  const page: OpdsPage = {
    title: directText(feed.children.find((child) => child.name === 'title')),
    books,
  };
  if (next) page.next = cursorOf(next.href, startIndex, perPage);
  return page;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  const record = asRecord(value);
  if (!record) return '';
  if (typeof record.en === 'string') return record.en.trim();
  for (const item of Object.values(record)) {
    if (typeof item === 'string' && item.trim()) return item.trim();
  }
  return '';
}

function relsOf(value: unknown): string[] {
  if (typeof value === 'string') return value.split(/\s+/).filter(Boolean);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function linkList(value: unknown, base: string): RawLink[] {
  const items = Array.isArray(value) ? value : value == null ? [] : [value];
  const links: RawLink[] = [];
  for (const item of items) {
    const record = asRecord(item);
    if (!record || typeof record.href !== 'string') continue;
    const href = resolveHref(record.href, base);
    if (!href) continue;
    const mediaType = typeof record.type === 'string' && record.type.trim() ? record.type.trim() : undefined;
    links.push({ href, rels: relsOf(record.rel), type: mediaType });
  }
  return links;
}

function coverFields(images: RawLink[]): { thumbnail?: string; image?: string } {
  let thumbnail: string | undefined;
  let image: string | undefined;
  for (const link of images) {
    const thumb = link.rels.includes(THUMB);
    const full = link.rels.includes(IMAGE) || link.rels.length === 0;
    if (!thumbnail && thumb) thumbnail = link.href;
    if (!image && full && !thumb) image = link.href;
  }
  if (!image) image = images.find((link) => link.href !== thumbnail)?.href;
  return { thumbnail, image };
}

function collectPublications(value: Record<string, unknown>, base: string, books: OpdsBook[], depth: number): void {
  if (depth > 8) return;
  const publications = Array.isArray(value.publications) ? value.publications : [];
  for (const item of publications) {
    if (books.length >= MAX_BOOKS) return;
    const record = asRecord(item);
    if (!record) continue;
    const metadata = asRecord(record.metadata) ?? {};
    const title = textValue(metadata.title);
    const id = textValue(metadata.identifier) || title;
    if (!id) continue;
    const covers = coverFields(linkList(record.images, base));
    const acquisition = pickAcquisitionLink(linkList(record.links, base));
    const book: OpdsBook = { id, title: title || id };
    if (covers.thumbnail) book.thumbnailUrl = covers.thumbnail;
    if (covers.image) book.imageUrl = covers.image;
    if (acquisition.url) book.acquisitionUrl = acquisition.url;
    if (acquisition.type) book.acquisitionType = acquisition.type;
    books.push(book);
  }
  const groups = Array.isArray(value.groups) ? value.groups : [];
  for (const group of groups) {
    const record = asRecord(group);
    if (record) collectPublications(record, base, books, depth + 1);
  }
}

function parseJsonFeed(body: string, base: string): OpdsPage {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return { title: '', books: [] };
  }
  const record = asRecord(value);
  if (!record) return { title: '', books: [] };
  const books: OpdsBook[] = [];
  collectPublications(record, base, books, 0);
  const next = linkList(record.links, base).find((link) => link.rels.includes('next'));
  const page: OpdsPage = { title: textValue(asRecord(record.metadata)?.title), books };
  if (next) page.next = cursorOf(next.href);
  return page;
}

function classifyFeed(body: string): 'parsed' | 'unparsed' | 'blank' | 'hostile' {
  const trimmed = body.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return 'blank';
  if (/<!DOCTYPE|<!ENTITY/i.test(trimmed)) return 'hostile';
  if (trimmed.startsWith('{')) {
    try {
      const value = JSON.parse(trimmed) as unknown;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        if ('metadata' in record || 'publications' in record || 'groups' in record || 'links' in record) return 'parsed';
      }
    } catch {
      return 'unparsed';
    }
    return 'unparsed';
  }
  if (trimmed.startsWith('<') && /<\s*feed(?:\s|>|\/)/i.test(trimmed)) return 'parsed';
  return 'unparsed';
}

function attemptCount(value: number | undefined, fallback: number): number {
  const count = value ?? fallback;
  if (!Number.isInteger(count) || count < 1) return 1;
  return Math.min(count, OPDS_ATTEMPT_CAP);
}

function clock(resilience: OpdsResilience): number {
  const value = resilience.now?.() ?? Math.floor(Date.now() / 1000);
  if (Number.isSafeInteger(value) && value >= 0) return value;
  return Math.floor(Date.now() / 1000);
}

function sanitizeFeeds(records: readonly OpdsFeedRecord[]): OpdsFeedRecord[] {
  const kept: OpdsFeedRecord[] = [];
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const url = typeof record.url === 'string' ? canonicalHttp(record.url) : undefined;
    if (!url) continue;
    const next: OpdsFeedRecord = { url };
    if (typeof record.parsedBody === 'string' && record.parsedBody.length <= MAX_PARSED_CHARS && classifyFeed(record.parsedBody) === 'parsed') {
      next.parsedBody = record.parsedBody;
    }
    if (typeof record.unparsedBody === 'string' && record.unparsedBody.length <= MAX_UNPARSED_CHARS && record.unparsedBody.trim() !== '') {
      next.unparsedBody = record.unparsedBody;
    }
    if (!next.parsedBody && !next.unparsedBody) continue;
    const index = kept.findIndex((item) => item.url === url);
    if (index >= 0) kept.splice(index, 1);
    kept.push(next);
  }
  while (kept.length > MAX_FEED_RECORDS) kept.shift();
  return kept;
}

function sanitizeQueue(items: readonly OpdsQueuedRequest[], nowSec?: number): OpdsQueuedRequest[] {
  const byUrl = new Map<string, number>();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const url = typeof item.url === 'string' ? canonicalHttp(item.url) : undefined;
    if (!url) continue;
    if (typeof item.queuedAt !== 'number' || !Number.isSafeInteger(item.queuedAt) || item.queuedAt < 0) continue;
    if (nowSec !== undefined && nowSec - item.queuedAt >= OPDS_MAX_AGE) continue;
    byUrl.delete(url);
    byUrl.set(url, item.queuedAt);
  }
  const next = [...byUrl].map(([url, queuedAt]) => ({ url, queuedAt }));
  while (next.length > MAX_OPDS_QUEUE) next.shift();
  return next;
}

export function readOpdsFeeds(text: string): OpdsFeedRecord[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }
  return Array.isArray(value) ? sanitizeFeeds(value as OpdsFeedRecord[]) : [];
}

export function writeOpdsFeeds(records: OpdsFeedRecord[]): string {
  return JSON.stringify(sanitizeFeeds(records));
}

export function readOpdsQueue(text: string): OpdsQueuedRequest[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }
  return Array.isArray(value) ? sanitizeQueue(value as OpdsQueuedRequest[]) : [];
}

export function writeOpdsQueue(items: OpdsQueuedRequest[]): string {
  return JSON.stringify(readOpdsQueue(JSON.stringify(items)));
}

export function opdsFeedsFromText(read: () => string, write: (text: string) => void): OpdsFeedStore {
  return {
    load() {
      try {
        return readOpdsFeeds(read());
      } catch {
        return [];
      }
    },
    save(records) {
      write(writeOpdsFeeds(records));
    },
  };
}

export function opdsQueueFromText(read: () => string, write: (text: string) => void): OpdsQueueStore {
  return {
    load() {
      try {
        return readOpdsQueue(read());
      } catch {
        return [];
      }
    },
    save(items) {
      write(writeOpdsQueue(items));
    },
  };
}

function writeFeed(store: OpdsFeedStore, url: string, next: OpdsFeedRecord | undefined): void {
  const rest = sanitizeFeeds(store.load()).filter((item) => item.url !== url);
  if (next) rest.push(next);
  while (rest.length > MAX_FEED_RECORDS) rest.shift();
  store.save(rest);
}

function rememberParsed(store: OpdsFeedStore, url: string, body: string): void {
  if (body.length > MAX_PARSED_CHARS || classifyFeed(body) !== 'parsed') return;
  writeFeed(store, url, { url, parsedBody: body });
}

function rememberUnparsed(store: OpdsFeedStore, url: string, body: string): void {
  if (body.length > MAX_UNPARSED_CHARS || body.trim() === '') return;
  const current = sanitizeFeeds(store.load()).find((item) => item.url === url);
  const next: OpdsFeedRecord = { url, unparsedBody: body };
  if (current?.parsedBody) next.parsedBody = current.parsedBody;
  writeFeed(store, url, next);
}

function fallbackPage(store: OpdsFeedStore, url: string): OpdsPage | undefined {
  const record = sanitizeFeeds(store.load()).find((item) => item.url === url);
  if (!record?.parsedBody) return undefined;
  return parseOpds(record.parsedBody, url);
}

function enqueueOpds(resilience: OpdsResilience, url: string): void {
  const nowSec = clock(resilience);
  const items = sanitizeQueue(resilience.queue.load(), nowSec).filter((item) => item.url !== url);
  items.push({ url, queuedAt: nowSec });
  while (items.length > MAX_OPDS_QUEUE) items.shift();
  resilience.queue.save(items);
}

function dequeueOpds(queue: OpdsQueueStore, url: string): void {
  const current = queue.load();
  const next = current.filter((item) => item.url !== url);
  if (next.length !== current.length) queue.save(next);
}

interface CatalogRead {
  page: OpdsPage;
  source: 'network' | 'fallback' | 'offline';
}

async function readCatalogPage(
  url: string,
  fetchText: (url: string) => Promise<string>,
  attempts: number,
  resilience?: OpdsResilience,
): Promise<CatalogRead> {
  const safe = canonicalHttp(url);
  if (!safe) return { page: { title: '', books: [] }, source: 'offline' };
  let body = '';
  let fetched = false;
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      body = await fetchText(safe);
      fetched = true;
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!fetched) {
    if (resilience) enqueueOpds(resilience, safe);
    const fallback = resilience ? fallbackPage(resilience.feeds, safe) : undefined;
    if (fallback) return { page: fallback, source: 'fallback' };
    if (resilience) return { page: { title: '', books: [] }, source: 'offline' };
    throw lastError instanceof Error ? lastError : new Error('OPDS catalog request failed.');
  }
  if (resilience) dequeueOpds(resilience.queue, safe);
  const kind = classifyFeed(body);
  if (resilience && kind === 'parsed') rememberParsed(resilience.feeds, safe, body);
  if (resilience && (kind === 'unparsed' || kind === 'hostile')) rememberUnparsed(resilience.feeds, safe, body);
  if (resilience && kind !== 'parsed' && kind !== 'blank') {
    const stored = fallbackPage(resilience.feeds, safe);
    if (stored) return { page: stored, source: 'network' };
  }
  return { page: parseOpds(body, safe), source: 'network' };
}

const opdsDrains = new WeakMap<OpdsQueueStore, boolean>();

export async function drainOpdsQueue(
  resilience: OpdsResilience,
  fetchText: (url: string) => Promise<string>,
): Promise<number> {
  if (opdsDrains.get(resilience.queue)) return 0;
  opdsDrains.set(resilience.queue, true);
  let sent = 0;
  try {
    const pending = sanitizeQueue(resilience.queue.load(), clock(resilience));
    resilience.queue.save(pending);
    const attempts = attemptCount(resilience.attempts, 3);
    for (const item of pending) {
      const stillQueued = resilience.queue.load().some((entry) => entry.url === item.url && entry.queuedAt === item.queuedAt);
      if (!stillQueued) continue;
      const result = await readCatalogPage(item.url, fetchText, attempts, resilience);
      if (result.source !== 'network') return sent;
      const fresh = resilience.queue.load().filter((entry) => entry.url !== item.url);
      resilience.queue.save(fresh);
      sent += 1;
    }
    return sent;
  } finally {
    opdsDrains.set(resilience.queue, false);
  }
}

export function parseOpds(body: string, baseUrl: string): OpdsPage {
  const trimmed = body.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return { title: '', books: [] };
  if (trimmed.startsWith('{')) return parseJsonFeed(trimmed, baseUrl);
  if (/<!DOCTYPE|<!ENTITY/i.test(trimmed)) return { title: '', books: [] };
  if (trimmed.startsWith('<')) return parseAtom(trimmed, baseUrl);
  return { title: '', books: [] };
}

export async function traverseOpds(
  startUrl: string,
  fetchText: (url: string) => Promise<string>,
  options?: { maxPages?: number; attempts?: number; resilience?: OpdsResilience },
): Promise<TraverseResult> {
  const start = canonicalHttp(startUrl);
  if (!start) throw new Error('OPDS catalog URL must be http(s).');
  const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES;
  if (!Number.isInteger(maxPages) || maxPages < 1) throw new Error('OPDS page limit must be a positive integer.');
  const attempts = attemptCount(options?.attempts ?? options?.resilience?.attempts, options?.resilience ? 3 : 1);
  const seen = new Set<string>();
  const books: OpdsBook[] = [];
  let url: string | undefined = start;
  let pages = 0;
  let stopped: TraverseResult['stopped'] = 'end';
  while (url) {
    if (seen.has(url)) {
      stopped = 'cycle';
      break;
    }
    if (pages >= maxPages) {
      stopped = 'limit';
      break;
    }
    seen.add(url);
    const result = await readCatalogPage(url, fetchText, attempts, options?.resilience);
    if (result.source === 'offline') {
      stopped = 'offline';
      break;
    }
    pages += 1;
    if (result.page.books.length === 0) {
      stopped = 'empty';
      break;
    }
    books.push(...result.page.books);
    if (!result.page.next) {
      stopped = 'end';
      break;
    }
    url = result.page.next.url;
  }
  return { books, pages, stopped };
}

function isImage(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || bytes.length > MAX_COVER_BYTES) return false;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  if (
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38
    && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
  ) return true;
  return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

function coverCandidates(book: OpdsBook): string[] {
  const out: string[] = [];
  for (const url of [book.thumbnailUrl, book.imageUrl]) {
    const safe = url ? canonicalHttp(url) : undefined;
    if (safe && !out.includes(safe)) out.push(safe);
  }
  return out;
}

async function coverName(url: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
  let hex = '';
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0');
  return `${hex}.img`;
}

async function loadCover(
  cache: CoverCache,
  url: string,
): Promise<{ ok: true; bytes: Uint8Array; source: 'memory' | 'disk' | 'network' } | { ok: false; reason: NonNullable<CoverResult['reason']> }> {
  const cached = cache.memory.get(url);
  if (cached && isImage(cached)) return { ok: true, bytes: cached, source: 'memory' };
  if (cached) cache.memory.delete(url);
  const name = await coverName(url);
  const stored = await cache.disk.read(name);
  if (stored && isImage(stored)) {
    cache.memory.set(url, stored);
    return { ok: true, bytes: stored, source: 'disk' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cache.timeoutMs);
  try {
    const response = await cache.fetch(url, controller.signal);
    if (controller.signal.aborted) return { ok: false, reason: 'timeout' };
    if (response.status < 200 || response.status >= 300) return { ok: false, reason: 'http' };
    if (!isImage(response.body)) return { ok: false, reason: 'corrupt' };
    cache.memory.set(url, response.body);
    await cache.disk.write(name, response.body);
    return { ok: true, bytes: response.body, source: 'network' };
  } catch (err) {
    if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      return { ok: false, reason: 'timeout' };
    }
    return { ok: false, reason: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

export async function prefetchBookCovers(books: OpdsBook[], cache: CoverCache): Promise<CoverResult[]> {
  const results: CoverResult[] = [];
  for (const book of books) {
    let hit: CoverResult | undefined;
    let reason: CoverResult['reason'];
    for (const url of coverCandidates(book)) {
      const loaded = await loadCover(cache, url);
      if (loaded.ok) {
        hit = { bookId: book.id, ok: true, source: loaded.source, url, bytes: loaded.bytes };
        break;
      }
      reason = loaded.reason;
    }
    results.push(hit ?? { bookId: book.id, ok: false, reason });
  }
  return results;
}
