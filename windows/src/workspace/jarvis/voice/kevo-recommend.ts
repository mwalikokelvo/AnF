/**
 * Kevo Music Recommend: Simple recommendation inspired by Spotify seeds,
 * using existing Audius search. No proprietary code copied.
 */

import { searchAudiusTracks } from './audius-search';

export async function recommendMusic(seed: string, limit = 3): Promise<{ speech: string; tracks: any[] } | null> {
  try {
    const results = await searchAudiusTracks(seed, limit);
    if (!results || results.length === 0) return null;
    const titles = results.slice(0, limit).map((t: any) => t.title || t.name).filter(Boolean);
    const speech = `Based on ${seed}, you might like: ${titles.join(', ')}.`;
    return { speech, tracks: results };
  } catch {
    return null;
  }
}
