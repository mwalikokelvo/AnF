/**
 * Kevo Music Recommend: Spotify-inspired recommendations using free Audius search.
 * "Recommend tracks like X" or by mood/genre. Builds on existing Audius integration.
 * Observable differences: uses open Audius catalog (not full Spotify), no audio features analysis, simple keyword expansion.
 */

import { searchAudiusTracks, formatAudiusResults } from './audius-search';

export async function recommendMusic(seed: string, limit = 5): Promise<string> {
  const q = String(seed || '').trim();
  if (!q) return 'What should I base the recommendation on, sir? A song, artist or mood.';
  // Expand seed for better results (Spotify-like related)
  const expanded = `${q} similar OR ${q} remix OR chill ${q}`;
  try {
    const tracks = await searchAudiusTracks(expanded, limit);
    if (!tracks || tracks.length === 0) {
      return `I could not find recommendations similar to ${q} on Audius right now, sir.`;
    }
    return `Here are some tracks inspired by ${q}: ${formatAudiusResults(tracks)}, sir.`;
  } catch {
    return `Recommendation service is unavailable for ${q}, sir.`;
  }
}
