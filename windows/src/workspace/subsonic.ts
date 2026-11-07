// Subsonic / Navidrome settings and IPC. The password is only ever sent to the
// OS secret store; Rust reads it for search and streaming.
import { invoke } from '@tauri-apps/api/core';

const SERVER_KEY = 'anf-subsonic-server';
const USER_KEY = 'anf-subsonic-user';

export interface SubsonicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  suffix: string;
}

export interface SubsonicSettings {
  server: string;
  username: string;
}

export function loadSubsonicSettings(): SubsonicSettings {
  try {
    return {
      server: localStorage.getItem(SERVER_KEY) || '',
      username: localStorage.getItem(USER_KEY) || '',
    };
  } catch {
    return { server: '', username: '' };
  }
}

export function saveSubsonicSettings(patch: Partial<SubsonicSettings>): SubsonicSettings {
  const next = { ...loadSubsonicSettings(), ...patch };
  try {
    localStorage.setItem(SERVER_KEY, next.server.trim());
    localStorage.setItem(USER_KEY, next.username.trim());
  } catch {
    /* applies for this session */
  }
  return { server: next.server.trim(), username: next.username.trim() };
}

export function subsonicReady(settings: SubsonicSettings): boolean {
  return settings.server.trim() !== '' && settings.username.trim() !== '';
}

export async function saveSubsonicPassword(value: string): Promise<void> {
  await invoke('secret_set', { key: 'subsonic-password', value });
}

export async function subsonicPasswordSaved(): Promise<boolean> {
  return invoke<boolean>('secret_present', { key: 'subsonic-password' });
}

export async function testSubsonic(server: string, username: string): Promise<string> {
  return invoke<string>('subsonic_test', { server, username });
}

export async function searchSubsonic(
  server: string,
  username: string,
  query: string,
): Promise<SubsonicTrack[]> {
  const rows = await invoke<SubsonicTrack[]>('subsonic_search', { server, username, query });
  return Array.isArray(rows) ? rows : [];
}

/** Raw IPC responses arrive as an ArrayBuffer; older bridges use a number array. */
export function responseBytes(raw: unknown): Uint8Array | undefined {
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (raw instanceof Uint8Array) return raw;
  if (Array.isArray(raw)) return Uint8Array.from(raw as number[]);
  return undefined;
}

export async function streamSubsonic(
  server: string,
  username: string,
  id: string,
): Promise<Blob> {
  const raw = await invoke<unknown>('subsonic_stream', { server, username, id });
  const bytes = responseBytes(raw);
  if (!bytes?.length) throw new Error('The server returned an empty track.');
  return new Blob([bytes as BlobPart], { type: 'audio/mpeg' });
}
