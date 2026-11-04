// Tauri bridge for kosync: Rust performs HTTPS with pinned DNS; user key stays in the OS secret store.

import { invoke } from '@tauri-apps/api/core';
import {
  createKoreaderQueue,
  documentDigest,
  koreaderPullRequest,
  koreaderPushRequest,
  koreaderQueueFromText,
  restoreReadingState,
  toKoreaderPayload,
  type KoreaderAuth,
  type KoreaderProgressPayload,
} from './koreader-sync';
import { type ReadingState } from './reader-data';

const ENABLED_KEY = 'anf-koreader-sync-enabled';
const SERVER_KEY = 'anf-koreader-server-url';
const USERNAME_KEY = 'anf-koreader-username';
const DEVICE_NAME_KEY = 'anf-koreader-device-name';
const DEVICE_ID_KEY = 'anf-koreader-device-id';
const QUEUE_KEY = 'anf-koreader-offline-queue';
const LAST_PUSH_TS_KEY = 'anf-koreader-last-push-ts';

export interface KoreaderSettings {
  enabled: boolean;
  serverUrl: string;
  username: string;
  deviceName: string;
  deviceId: string;
}

export function loadKoreaderSettings(): KoreaderSettings {
  let enabled = false;
  let serverUrl = '';
  let username = '';
  let deviceName = 'AnF';
  let deviceId = '';
  try {
    enabled = localStorage.getItem(ENABLED_KEY) === '1';
    serverUrl = localStorage.getItem(SERVER_KEY) || '';
    username = localStorage.getItem(USERNAME_KEY) || '';
    deviceName = localStorage.getItem(DEVICE_NAME_KEY) || 'AnF';
    deviceId = localStorage.getItem(DEVICE_ID_KEY) || '';
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
  } catch {
    if (!deviceId) deviceId = crypto.randomUUID();
  }
  return { enabled, serverUrl, username, deviceName, deviceId };
}

export function saveKoreaderSettings(patch: Partial<KoreaderSettings>): KoreaderSettings {
  const current = loadKoreaderSettings();
  const next = { ...current, ...patch };
  try {
    localStorage.setItem(ENABLED_KEY, next.enabled ? '1' : '0');
    localStorage.setItem(SERVER_KEY, next.serverUrl.trim());
    localStorage.setItem(USERNAME_KEY, next.username.trim());
    localStorage.setItem(DEVICE_NAME_KEY, next.deviceName.trim() || 'AnF');
    localStorage.setItem(DEVICE_ID_KEY, next.deviceId);
  } catch {
    /* applies for this session */
  }
  return next;
}

export function koreaderSyncConfigured(settings: KoreaderSettings): boolean {
  return settings.enabled && settings.serverUrl.trim() !== '' && settings.username.trim() !== '';
}

interface SyncHttpResponse {
  status: number;
  body: string;
}

async function koreaderHttp(method: 'GET' | 'PUT', url: string, username: string, body?: string): Promise<SyncHttpResponse> {
  return invoke<SyncHttpResponse>('koreader_sync_request', { method, url, username, body });
}

export function parseKoreaderProgressBody(text: string): Partial<KoreaderProgressPayload> {
  if (!text.trim()) return {};
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') return {};
    return raw as Partial<KoreaderProgressPayload>;
  } catch {
    return {};
  }
}

function queueStore() {
  return koreaderQueueFromText(
    () => {
      try {
        return localStorage.getItem(QUEUE_KEY) || '[]';
      } catch {
        return '[]';
      }
    },
    (text) => {
      try {
        localStorage.setItem(QUEUE_KEY, text);
      } catch {
        /* offline queue not persisted */
      }
    },
  );
}

const sharedQueue = createKoreaderQueue(queueStore());

function auth(settings: KoreaderSettings): KoreaderAuth {
  return { username: settings.username.trim(), userkey: 'stored-in-os-secret-store' };
}

async function sendPayload(settings: KoreaderSettings, payload: KoreaderProgressPayload): Promise<{ status?: number }> {
  const req = koreaderPushRequest(settings.serverUrl.trim(), auth(settings), payload);
  const res = await koreaderHttp('PUT', req.url, settings.username.trim(), JSON.stringify(req.body));
  return { status: res.status };
}

async function drainQueue(settings: KoreaderSettings): Promise<number> {
  return sharedQueue.drain(async (item) => {
    try {
      const result = await sendPayload(settings, item);
      return result.status === 200 || result.status === 202;
    } catch {
      return false;
    }
  });
}

function lastPushTimestamp(): number {
  try {
    const n = Number(localStorage.getItem(LAST_PUSH_TS_KEY));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function rememberPushTimestamp(ts: number): void {
  try {
    localStorage.setItem(LAST_PUSH_TS_KEY, String(ts));
  } catch {
    /* not remembered */
  }
}

export async function koreaderPullIntoState(
  settings: KoreaderSettings,
  text: string,
  local: ReadingState,
): Promise<{ state: ReadingState; notice: string }> {
  if (!koreaderSyncConfigured(settings)) return { state: local, notice: '' };
  const req = koreaderPullRequest(settings.serverUrl.trim(), auth(settings), documentDigest(text));
  try {
    const res = await koreaderHttp('GET', req.url, settings.username.trim());
    if (res.status === 401) return { state: local, notice: 'KOReader sync: check username and user key.' };
    if (res.status !== 200) return { state: local, notice: `KOReader sync: server answered ${res.status}.` };
    const remote = parseKoreaderProgressBody(res.body);
    if (!remote.progress && remote.percentage === undefined) return { state: local, notice: '' };
    const state = restoreReadingState(text, local, remote, {
      device_id: settings.deviceId,
      timestamp: lastPushTimestamp(),
    });
    const moved = state.offset !== local.offset;
    return { state, notice: moved ? 'KOReader progress applied.' : '' };
  } catch (e) {
    return { state: local, notice: String(e).replace(/^Error: /, '') };
  }
}

let pushTimer: ReturnType<typeof setTimeout> | undefined;
let pushInFlight = false;

export function scheduleKoreaderPush(
  settings: KoreaderSettings,
  text: string,
  state: ReadingState,
  notify: (message: string) => void,
  debounceMs = 1500,
): void {
  if (!koreaderSyncConfigured(settings)) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void flushKoreaderPush(settings, text, state, notify);
  }, debounceMs);
}

export async function flushKoreaderPush(
  settings: KoreaderSettings,
  text: string,
  state: ReadingState,
  notify: (message: string) => void,
): Promise<void> {
  if (!koreaderSyncConfigured(settings) || pushInFlight) return;
  pushInFlight = true;
  try {
    const payload = toKoreaderPayload(text, state, {
      device: settings.deviceName.trim() || 'AnF',
      device_id: settings.deviceId,
      timestamp: Math.floor(Date.now() / 1000),
    });
    const outcome = await sharedQueue.sync(payload, (item) => sendPayload(settings, item as KoreaderProgressPayload));
    if (outcome === 'pushed') {
      rememberPushTimestamp(payload.timestamp);
      notify('Reading progress synced with KOReader.');
      await drainQueue(settings);
    } else if (outcome === 'queued') {
      notify('KOReader sync offline — progress queued.');
    } else if (outcome === 'rejected') {
      notify('KOReader sync: check username and user key.');
    }
  } catch (e) {
    notify(String(e).replace(/^Error: /, ''));
  } finally {
    pushInFlight = false;
  }
}

export async function koreaderOnReaderOpen(
  settings: KoreaderSettings,
  text: string,
  local: ReadingState,
  notify: (message: string) => void,
): Promise<ReadingState> {
  const pulled = await koreaderPullIntoState(settings, text, local);
  if (pulled.notice) notify(pulled.notice);
  void drainQueue(settings);
  return pulled.state;
}

export async function koreaderOnReaderClose(
  settings: KoreaderSettings,
  text: string,
  state: ReadingState,
  notify: (message: string) => void,
): Promise<void> {
  clearTimeout(pushTimer);
  await flushKoreaderPush(settings, text, state, notify);
}
