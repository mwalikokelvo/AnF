// Radio Browser API provider for live global internet radio streaming.
// Connects to community Radio Browser mirrors with multi-node failover and request pacing.
// Zero credentials, zero DRM, zero telemetry.

import { PaceGate } from './pace-gate';

export interface RadioStation {
  id: string;
  stationuuid: string;
  name: string;
  streamUrl: string;
  homepage?: string;
  favicon?: string;
  country?: string;
  countrycode?: string;
  tags: string[];
  bitrate?: number;
  codec?: string;
  votes?: number;
}

export const RADIO_BROWSER_MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
];

export const POPULAR_RADIO_TAGS = [
  'lofi',
  'jazz',
  'ambient',
  'classical',
  'electronic',
  'chillout',
  'rock',
  'synthwave',
  'news',
  'soundtrack',
] as const;

export const radioPaceGate = new PaceGate();

const USER_AGENT = 'AnF-Workspace/0.1.48';

/** Safely parses raw station items returned by Radio-Browser API into typed RadioStation objects. */
export function parseRadioStations(data: unknown): RadioStation[] {
  if (!Array.isArray(data)) return [];
  const stations: RadioStation[] = [];
  const seenIds = new Set<string>();

  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, any>;
    const uuid = String(raw.stationuuid || raw.changeuuid || '').trim();
    const url = String(raw.url_resolved || raw.url || '').trim();
    const name = String(raw.name || '').trim();

    if (!uuid || !url || !name) continue;
    if (seenIds.has(uuid)) continue;
    seenIds.add(uuid);

    // Validate stream url scheme (http/https only)
    if (!/^https?:\/\//i.test(url)) continue;

    const rawTags = typeof raw.tags === 'string'
      ? raw.tags.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean)
      : [];

    const favicon = typeof raw.favicon === 'string' && /^https?:\/\//i.test(raw.favicon.trim())
      ? raw.favicon.trim()
      : undefined;

    const homepage = typeof raw.homepage === 'string' && /^https?:\/\//i.test(raw.homepage.trim())
      ? raw.homepage.trim()
      : undefined;

    stations.push({
      id: 'radio:' + uuid,
      stationuuid: uuid,
      name,
      streamUrl: url,
      homepage,
      favicon,
      country: raw.country ? String(raw.country).trim() : undefined,
      countrycode: raw.countrycode ? String(raw.countrycode).trim().toUpperCase() : undefined,
      tags: rawTags.slice(0, 8),
      bitrate: typeof raw.bitrate === 'number' && raw.bitrate > 0 ? raw.bitrate : undefined,
      codec: typeof raw.codec === 'string' && raw.codec.trim() ? raw.codec.trim().toUpperCase() : undefined,
      votes: typeof raw.votes === 'number' ? raw.votes : undefined,
    });
  }

  return stations;
}

/** Queries Radio-Browser with multi-mirror failover and adaptive pacing. */
async function queryRadioMirrors(endpoint: string, fetcher: typeof fetch = fetch): Promise<RadioStation[]> {
  let lastError: Error | null = null;

  for (const mirror of RADIO_BROWSER_MIRRORS) {
    if (radioPaceGate.isCoolingDown(mirror)) continue;

    try {
      await radioPaceGate.acquire(mirror, 120);
      const url = `${mirror}${endpoint}`;
      const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(6500) : undefined;
      const res = await fetcher(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
        signal: signal as any,
      });

      if (res.ok) {
        const json = await res.json();
        return parseRadioStations(json);
      }

      if (res.status === 429 || res.status === 503) {
        radioPaceGate.triggerCooldown(mirror, 30000);
      }

      lastError = new Error(`Radio mirror ${mirror} returned HTTP ${res.status}`);
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error('All Radio Browser mirrors failed or are cooling down');
}

/** Searches radio stations by name, artist or keyword. */
export async function searchRadioStations(
  query: string,
  limit = 24,
  fetcher: typeof fetch = fetch
): Promise<RadioStation[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const endpoint = `/json/stations/search?name=${encodeURIComponent(trimmed)}&limit=${limit}&hidebroken=true&order=clickcount&reverse=true`;
  return queryRadioMirrors(endpoint, fetcher);
}

/** Fetches top trending/clicked radio stations worldwide. */
export async function getTopRadioStations(
  limit = 24,
  fetcher: typeof fetch = fetch
): Promise<RadioStation[]> {
  const endpoint = `/json/stations/topclick?limit=${limit}&hidebroken=true`;
  return queryRadioMirrors(endpoint, fetcher);
}

/** Fetches radio stations by specific music genre or tag (e.g. lofi, jazz, ambient). */
export async function getRadioStationsByTag(
  tag: string,
  limit = 24,
  fetcher: typeof fetch = fetch
): Promise<RadioStation[]> {
  const trimmed = tag.trim().toLowerCase();
  if (!trimmed) return [];
  const endpoint = `/json/stations/bytag/${encodeURIComponent(trimmed)}?limit=${limit}&hidebroken=true&order=clickcount&reverse=true`;
  return queryRadioMirrors(endpoint, fetcher);
}
