/**
 * Opt-in switch and URL hygiene for third-party music lookups (lyrics, metadata,
 * streaming resolvers). Off by default: nothing leaves the device for these
 * services until the user turns "Online lookups" on in the Music Hub header.
 */
const KEY = 'anf-online-lookups';
let memory: boolean | null = null;

export function onlineLookupsEnabled(): boolean {
  if (memory !== null) return memory;
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setOnlineLookups(on: boolean): void {
  memory = on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* applies for this session only */ }
}

export const ONLINE_LOOKUPS_OFF = 'Online lookups are off. Turn on "Online lookups" in the Music Hub header to contact third-party lyrics and streaming services.';

/** fetch() that refuses to run until the user has opted in. */
export function gatedFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  if (!onlineLookupsEnabled()) return Promise.reject(new Error(ONLINE_LOOKUPS_OFF));
  return fetch(input, init);
}

/** Returns the normalised URL only if it is a plain https URL, otherwise undefined. */
export function safeHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : undefined;
  } catch { return undefined; }
}

/** CSS `url("...")` for an https (or app-created blob:) URL with everything that could break out of the string escaped; `none` otherwise. */
export function cssUrl(value: unknown): string {
  const href = typeof value === 'string' && /^blob:/i.test(value) ? value : safeHttpsUrl(value);
  if (!href) return 'none';
  return `url("${href.replace(/[\\"()\n\r\f]/g, c => '\\' + c.charCodeAt(0).toString(16) + ' ')}")`;
}
