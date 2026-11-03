// KOReader progress sync (kosync): PUT/GET /syncs/progress.
// Positions are derived from the existing reading state (offset, bookmarks, annotations).
// The progress index and offline queue are separate from the project store, so sync does not migrate it.

import { readingState, sectionIndex, sections, type ReadingState } from './reader-data';

export interface KoreaderMetadata {
  filename?: string;
  title?: string;
  authors?: string;
}

export interface KoreaderProgressPayload {
  document: string;
  progress: string;
  percentage: number;
  device: string;
  device_id: string;
  timestamp: number;
  metadata?: KoreaderMetadata;
}

export interface ReadingProgressView {
  document: string;
  chapter: number;
  percentage: number;
  progress: string;
}

export interface KoreaderDevice {
  device: string;
  device_id: string;
  timestamp: number;
  metadata?: KoreaderMetadata;
}

export interface KoreaderAuth {
  username: string;
  userkey: string;
}

export interface KoreaderHttpRequest {
  method: 'GET' | 'PUT';
  url: string;
  headers: {
    accept: string;
    'content-type': string;
    'x-auth-user': string;
    'x-auth-key': string;
  };
  body?: KoreaderProgressPayload;
}

export interface KoreaderQueueItem extends KoreaderProgressPayload {
  queued_at?: number;
}

export interface KoreaderQueueStore {
  load(): KoreaderQueueItem[];
  save(items: KoreaderQueueItem[]): void;
}

export interface KoreaderSyncRequest {
  method: string;
  path: string;
  headers?: Record<string, string | undefined>;
  body?: unknown;
}

export interface KoreaderSyncResponse {
  status: number;
  body: Record<string, unknown>;
}

const ACCEPT = 'application/vnd.koreader.v1+json';
const DAY = 86400;
const MAX_AGE = 28 * DAY;
const MAX_ENTRIES = 200;

/** Same FNV-1a used for the reader's local scroll key. Not a project-store field. */
export function documentDigest(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function roundPercent(percent: number): number {
  return Math.floor(percent * 10000 + 0.5) / 10000;
}

export function describeReadingProgress(text: string, state: ReadingState): ReadingProgressView {
  const current = readingState(state, text);
  const chapter = sectionIndex(sections(text), current.offset) + 1;
  const percentage = text.length === 0 ? 0 : roundPercent(current.offset / text.length);
  return { document: documentDigest(text), chapter, percentage, progress: `anf:${current.offset}` };
}

export function toKoreaderPayload(text: string, state: ReadingState, device: KoreaderDevice): KoreaderProgressPayload {
  if (typeof device.device !== 'string' || device.device.trim() === '' || device.device.length > 128) throw new Error('Device name is missing.');
  if (typeof device.device_id !== 'string' || device.device_id.trim() === '' || device.device_id.length > 128) throw new Error('Device id is missing.');
  if (!Number.isSafeInteger(device.timestamp) || device.timestamp < 0) throw new Error('Progress timestamp is invalid.');
  const position = describeReadingProgress(text, state);
  const payload: KoreaderProgressPayload = {
    document: position.document,
    progress: position.progress,
    percentage: position.percentage,
    device: device.device,
    device_id: device.device_id,
    timestamp: device.timestamp,
  };
  if (device.metadata) payload.metadata = device.metadata;
  return payload;
}

function locatedOffset(text: string, progress: string): number | undefined {
  const marker = /^anf:(\d+)$/.exec(progress);
  if (marker) {
    const offset = Number(marker[1]);
    return offset <= text.length ? offset : undefined;
  }
  const page = /^([1-9]\d*)$/.exec(progress);
  if (!page) return undefined;
  const parts = sections(text);
  const index = Number(page[1]) - 1;
  return index < parts.length ? parts[index].start : undefined;
}

function percentageOffset(text: string, percentage: unknown): number | undefined {
  if (typeof percentage !== 'number' || !Number.isFinite(percentage) || percentage < 0 || percentage > 1) return undefined;
  if (text.length === 0) return 0;
  return Math.min(text.length, Math.max(0, Math.round(percentage * text.length)));
}

export function restoreReadingState(
  text: string,
  local: ReadingState,
  remote: Partial<KoreaderProgressPayload>,
  self: { device_id: string; timestamp: number },
): ReadingState {
  const current = readingState(local, text);
  const unchanged = () => readingState(current, text);
  if (remote.device_id && remote.device_id === self.device_id) return unchanged();
  const fromProgress = typeof remote.progress === 'string' ? locatedOffset(text, remote.progress) : undefined;
  const offset = fromProgress !== undefined ? fromProgress : percentageOffset(text, remote.percentage);
  if (offset === undefined || offset === current.offset) return unchanged();
  if (typeof remote.timestamp === 'number' && Number.isFinite(remote.timestamp)) {
    if (!(remote.timestamp > self.timestamp)) return unchanged();
  } else {
    const remotePercent = typeof remote.percentage === 'number' ? remote.percentage : undefined;
    const localPercent = text.length === 0 ? 0 : current.offset / text.length;
    if (remotePercent === undefined || !(remotePercent > localPercent)) return unchanged();
  }
  return readingState({ ...current, offset }, text);
}

function endpoint(base: string, path: string): string {
  const url = new URL(base);
  if (url.username || url.password) throw new Error('Sync server address cannot include a username or password.');
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Sync server address must be an http or https URL.');
  return `${url.origin}${path.startsWith('/') ? path : `/${path}`}`;
}

function headerValue(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error('Sync credentials cannot contain a line break.');
  return value;
}

function authHeaders(auth: KoreaderAuth): KoreaderHttpRequest['headers'] {
  return {
    accept: ACCEPT,
    'content-type': 'application/json',
    'x-auth-user': headerValue(auth.username),
    'x-auth-key': headerValue(auth.userkey),
  };
}

export function koreaderPushRequest(base: string, auth: KoreaderAuth, payload: KoreaderProgressPayload): KoreaderHttpRequest {
  return { method: 'PUT', url: endpoint(base, '/syncs/progress'), headers: authHeaders(auth), body: payload };
}

export function koreaderPullRequest(base: string, auth: KoreaderAuth, document: string): KoreaderHttpRequest {
  return { method: 'GET', url: endpoint(base, `/syncs/progress/${encodeURIComponent(document)}`), headers: authHeaders(auth) };
}

function header(headers: Record<string, string | undefined> | undefined, name: string): string {
  if (!headers) return '';
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name && typeof value === 'string') return value.trim();
  }
  return '';
}

function authorized(headers: Record<string, string | undefined> | undefined): boolean {
  return header(headers, 'x-auth-user') !== '' && header(headers, 'x-auth-key') !== '';
}

function storedPayload(body: unknown, now: number): KoreaderProgressPayload | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const raw = body as Record<string, unknown>;
  const { document, progress, percentage, device, device_id: deviceId } = raw;
  if (typeof document !== 'string' || document.length === 0 || document.length > 128 || document.includes('/') || document.includes('\\')) return undefined;
  if (typeof progress !== 'string' || progress.length === 0 || progress.length > 4096) return undefined;
  if (typeof percentage !== 'number' || !Number.isFinite(percentage) || percentage < 0 || percentage > 1) return undefined;
  if (typeof device !== 'string' || device.length === 0 || device.length > 128) return undefined;
  if (typeof deviceId !== 'string' || deviceId.length === 0 || deviceId.length > 128) return undefined;
  let timestamp = now;
  if (raw.timestamp !== undefined) {
    if (typeof raw.timestamp !== 'number' || !Number.isSafeInteger(raw.timestamp) || raw.timestamp < 0) return undefined;
    timestamp = raw.timestamp;
  }
  const payload: KoreaderProgressPayload = { document, progress, percentage, device, device_id: deviceId, timestamp };
  const metadata = readMetadata(raw.metadata);
  if (metadata && (metadata.filename || metadata.title || metadata.authors)) payload.metadata = metadata;
  return payload;
}

function readMetadata(value: unknown): KoreaderMetadata | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const metadata: KoreaderMetadata = {};
  if (typeof raw.filename === 'string') metadata.filename = raw.filename.slice(0, 512);
  if (typeof raw.title === 'string') metadata.title = raw.title.slice(0, 512);
  if (typeof raw.authors === 'string') metadata.authors = raw.authors.slice(0, 512);
  return metadata;
}

function documentFromPath(path: string): string | undefined {
  const prefix = '/syncs/progress/';
  if (!path.startsWith(prefix)) return undefined;
  try {
    const document = decodeURIComponent(path.slice(prefix.length));
    return document && !document.includes('/') ? document : undefined;
  } catch {
    return undefined;
  }
}

export function createKoreaderProgressIndex(now: () => number = () => Math.floor(Date.now() / 1000)) {
  const records = new Map<string, KoreaderProgressPayload>();
  return {
    handle(request: KoreaderSyncRequest): KoreaderSyncResponse {
      if (!authorized(request.headers)) return { status: 401, body: { message: 'Unauthorized' } };
      const method = request.method.toUpperCase();
      if (method === 'PUT' && request.path === '/syncs/progress') {
        const payload = storedPayload(request.body, now());
        if (!payload) return { status: 400, body: { message: 'Invalid progress.' } };
        records.set(payload.document, payload);
        return { status: 200, body: { ...payload } };
      }
      if (method === 'GET') {
        const document = documentFromPath(request.path);
        if (document === undefined) return { status: 404, body: { message: 'Unknown route.' } };
        const found = records.get(document);
        return { status: 200, body: found ? { ...found } : {} };
      }
      return { status: 404, body: { message: 'Unknown route.' } };
    },
  };
}

function sameQueued(a: KoreaderQueueItem, b: KoreaderQueueItem): boolean {
  return a.document === b.document
    && a.progress === b.progress
    && a.percentage === b.percentage
    && a.device === b.device
    && a.device_id === b.device_id
    && a.timestamp === b.timestamp
    && a.queued_at === b.queued_at;
}

export function createKoreaderQueue(store: KoreaderQueueStore, now: () => number = () => Math.floor(Date.now() / 1000)) {
  let draining = false;
  function push(item: Omit<KoreaderQueueItem, 'queued_at'>): void {
    const queuedAt = now();
    const today = Math.floor(queuedAt / DAY);
    const next = store.load().filter(entry => {
      const at = entry.queued_at ?? 0;
      const sameDay = entry.document === item.document && Math.floor(at / DAY) === today;
      return queuedAt - at < MAX_AGE && !sameDay;
    });
    next.push({ ...item, queued_at: queuedAt });
    while (next.length > MAX_ENTRIES) next.shift();
    store.save(next);
  }
  return {
    push,
    count: () => store.load().length,
    clear: () => store.save([]),
    async drain(send: (item: KoreaderQueueItem) => Promise<boolean>): Promise<number> {
      if (draining) return 0;
      const snapshot = store.load();
      if (snapshot.length === 0) return 0;
      draining = true;
      let sent = 0;
      try {
        for (const item of snapshot) {
          if (!store.load().some(entry => sameQueued(entry, item))) continue;
          let ok = false;
          try { ok = await send(item); } catch { ok = false; }
          if (!ok) return sent;
          const fresh = store.load();
          const index = fresh.findIndex(entry => sameQueued(entry, item));
          if (index >= 0) fresh.splice(index, 1);
          store.save(fresh);
          sent += 1;
        }
        return sent;
      } finally {
        draining = false;
      }
    },
    async sync(
      item: Omit<KoreaderQueueItem, 'queued_at'>,
      send: (item: Omit<KoreaderQueueItem, 'queued_at'>) => Promise<{ status?: number }>,
    ): Promise<'pushed' | 'queued' | 'rejected'> {
      try {
        const result = await send(item);
        if (result?.status === 200 || result?.status === 202) return 'pushed';
        if (result?.status === 401) return 'rejected';
      } catch {
        // Dropped connections are queued below.
      }
      push(item);
      return 'queued';
    },
  };
}
