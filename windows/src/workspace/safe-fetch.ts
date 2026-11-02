/**
 * Desktop bridge to the Rust `safe_fetch_*` commands. The webview CSP only
 * names enumerated hosts, so user-entered feed and episode URLs are fetched by
 * Rust (https only, public IPs only, size/time capped, content-type checked).
 * Outside the desktop app (Android WebView, plain browser, tests) none of this
 * exists and callers keep their own path.
 */
type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

function tauriInvoke(): Invoke | undefined {
  const internals = (globalThis as unknown as { __TAURI_INTERNALS__?: { invoke?: Invoke } }).__TAURI_INTERNALS__;
  return typeof internals?.invoke === 'function' ? internals.invoke.bind(internals) : undefined;
}

/** True inside the Tauri desktop app (Windows/Linux). */
export function hasSafeFetch(): boolean {
  return tauriInvoke() !== undefined;
}

export interface SafeTextResponse {
  finalUrl: string;
  contentType: string;
  body: string;
}

function message(err: unknown): string {
  if (typeof err === 'string' && err) return err;
  if (err instanceof Error && err.message) return err.message;
  return 'Could not load that address.';
}

/** Fetch an https feed (RSS/Atom/JSON) or small JSON document through Rust. */
export async function safeFetchText(url: string, kind: 'feed' | 'json' = 'feed'): Promise<SafeTextResponse> {
  const invoke = tauriInvoke();
  if (!invoke) throw new Error('Safe fetch is only available in the desktop app.');
  try {
    return (await invoke('safe_fetch_text', { url, kind })) as SafeTextResponse;
  } catch (err) {
    throw new Error(message(err));
  }
}

/** Fetch a podcast episode's audio through Rust and return it as a Blob. */
export async function safeFetchAudio(url: string, type = 'audio/mpeg'): Promise<Blob> {
  const invoke = tauriInvoke();
  if (!invoke) throw new Error('Safe fetch is only available in the desktop app.');
  let raw: unknown;
  try {
    raw = await invoke('safe_fetch_audio', { url });
  } catch (err) {
    throw new Error(message(err));
  }
  const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : Array.isArray(raw) ? Uint8Array.from(raw as number[]) : raw instanceof Uint8Array ? raw : undefined;
  if (!bytes) throw new Error('The download returned an unexpected response.');
  return new Blob([bytes as BlobPart], { type });
}
