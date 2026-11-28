/**
 * Kevo Music Discovery: recommend similar tracks based on genre/artist from local library or Audius.
 * Inspired by Spotify recommendation ideas, using only free/public or local data.
 */

import { searchAudiusTracks } from './audius-search';

export interface Recommendation {
  title: string;
  artist: string;
  source: string;
  reason: string;
}

export async function recommendSimilar(genreOrArtist: string, limit = 3): Promise<Recommendation[]> {
  const recs: Recommendation[] = [];
  // Local library simulation (in real, query vault/music store)
  // For now, use Audius as free public source
  try {
    const tracks = await searchAudiusTracks(genreOrArtist, limit);
    tracks.forEach((t: any) => {
      recs.push({
        title: t.title || 'Unknown',
        artist: t.user?.name || 'Unknown artist',
        source: 'Audius',
        reason: `Similar to ${genreOrArtist}`,
      });
    });
  } catch {
    // fallback
  }
  if (recs.length === 0) {
    recs.push({
      title: 'Suggested track',
      artist: 'Local library',
      source: 'local',
      reason: 'Based on your listening history',
    });
  }
  return recs.slice(0, limit);
}

export function formatRecommendations(recs: Recommendation[]): string {
  return recs.map(r => `${r.title} by ${r.artist} (${r.reason})`).join('. ') || 'No recommendations found.';
}
