/**
 * Audius free music search for Kevo.
 * Uses the public Audius API (https://api.audius.co/v1) — free, documented, no key required for basic search.
 * Inspired by music capabilities in Siri/Alexa/Google Assistant/OVOS, but reverse-engineered for ideas only.
 * Never copies proprietary code.
 */

export interface AudiusTrack {
  id: string;
  title: string;
  artist: string;
  duration?: number;
  artwork?: string;
  streamUrl?: string;
}

const BASE = 'https://api.audius.co/v1';

/** Search tracks on Audius. Returns up to `limit` results. Fails soft on network errors. */
export async function searchAudiusTracks(query: string, limit = 5): Promise<AudiusTrack[]> {
  if (!query.trim()) return [];
  try {
    const url = `${BASE}/tracks/search?query=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map((t: any) => ({
      id: t.id,
      title: t.title || 'Unknown',
      artist: t.user?.name || t.user?.handle || 'Unknown artist',
      duration: t.duration,
      artwork: t.artwork?.['150x150'] || t.artwork?.['480x480'],
      streamUrl: t.id ? `${BASE}/tracks/${t.id}/stream` : undefined,
    }));
  } catch {
    return [];
  }
}

/** Format results for speech. */
export function formatAudiusResults(tracks: AudiusTrack[]): string {
  if (!tracks.length) return 'No tracks found on Audius.';
  return tracks.map((t, i) => `${i + 1}. ${t.title} by ${t.artist}`).join('. ');
}
