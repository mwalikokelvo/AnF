/**
 * Where an https audio link may be played from. The webview CSP (`media-src`) names only a few hosts, so a pasted
 * direct link, a podcast enclosure or a proxied YouTube stream on any other host cannot be given to the audio element.
 * In the desktop app those are downloaded by Rust (`safe_fetch_audio`: https, public hosts, size capped, audio type
 * required) and played from a blob instead. Outside it (Android WebView, plain browser, tests) nothing changes.
 * Keep MEDIA_SRC_HOSTS in sync with `media-src` in tauri.conf.json (tests/stream-source.test.ts compares them).
 */
import { hasSafeFetch, safeFetchAudio } from './safe-fetch';

const MEDIA_SRC_EXACT = ['archive.org', 'audio-ssl.itunes.apple.com'];
const MEDIA_SRC_SUFFIX = ['.archive.org', '.mzstatic.com', '.googlevideo.com'];

/** True when the CSP lets the audio element load this https URL directly. */
export function mediaSrcAllows(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return MEDIA_SRC_EXACT.includes(host) || MEDIA_SRC_SUFFIX.some(s => host.endsWith(s) && host.length > s.length);
}

/** True when this URL must be fetched by Rust and played from a blob. */
export function needsRustFetch(url: string): boolean {
  return hasSafeFetch() && !mediaSrcAllows(url);
}

let last: { url: string; blob: Blob } | undefined;

export function clearRemoteAudioCache(): void { last = undefined; }

/** Download audio through Rust. The last download is kept so repeat, seek-restart and Save Offline do not fetch it twice. */
export async function loadRemoteAudio(url: string, type = 'audio/mpeg'): Promise<Blob> {
  if (last && last.url === url) return last.blob;
  const blob = await safeFetchAudio(url, type);
  last = { url, blob };
  return blob;
}
