// Audius music discovery and streaming provider.
// Free, decentralized music with an official REST API. No user accounts, credentials, or DRM required.

export interface AudiusTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  artworkUrl?: string;
  genre?: string;
  streamUrl: string;
}

const APP_NAME = 'AnF';
const DISCOVERY_ENDPOINT = 'https://discoveryprovider.audius.co/v1';

export function audiusStreamUrl(trackId: string): string {
  return `${DISCOVERY_ENDPOINT}/tracks/${encodeURIComponent(trackId)}/stream?app_name=${APP_NAME}`;
}

export function parseAudiusTracks(data: unknown): AudiusTrack[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((item): item is Record<string, any> => Boolean(item && typeof item === 'object' && item.id))
    .map((item) => ({
      id: String(item.id),
      title: String(item.title || 'Untitled Track'),
      artist: String(item.user?.name || item.user?.handle || 'Unknown Artist'),
      duration: Number(item.duration) || 0,
      artworkUrl: item.artwork?.['480x480'] || item.artwork?.['150x150'] || undefined,
      genre: item.genre ? String(item.genre) : undefined,
      streamUrl: audiusStreamUrl(String(item.id)),
    }));
}

export async function searchAudius(query: string, limit = 20, fetcher: typeof fetch = fetch): Promise<AudiusTrack[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const url = `${DISCOVERY_ENDPOINT}/tracks/search?query=${encodeURIComponent(trimmed)}&app_name=${APP_NAME}&limit=${limit}`;
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`Audius API returned status ${res.status}`);
  const body = (await res.json()) as { data?: unknown };
  return parseAudiusTracks(body?.data);
}

export async function trendingAudius(limit = 20, fetcher: typeof fetch = fetch): Promise<AudiusTrack[]> {
  const url = `${DISCOVERY_ENDPOINT}/tracks/trending?app_name=${APP_NAME}&limit=${limit}`;
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`Audius API returned status ${res.status}`);
  const body = (await res.json()) as { data?: unknown };
  return parseAudiusTracks(body?.data);
}
