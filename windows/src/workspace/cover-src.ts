import { safeHttpsUrl } from './online-lookups.js';

/**
 * Resolve a cover art URL for `<img>` / CSS backgrounds. On desktop, https hosts
 * outside CSP `img-src` are fetched through Rust and exposed as a blob URL.
 */
export async function resolveCoverSrc(
  url: string | undefined,
  useSafeFetch: boolean,
  fetchImage: (url: string) => Promise<Blob>,
): Promise<string | undefined> {
  const https = safeHttpsUrl(url);
  if (!https) return undefined;
  if (!useSafeFetch) return https;
  const blob = await fetchImage(https);
  return URL.createObjectURL(blob);
}
