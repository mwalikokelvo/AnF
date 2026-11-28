/**
 * Kevo Music Recommendations: Suggest tracks based on recent listening history genres/artists.
 * Uses local Music Hub data. Minimal, no external calls.
 */

export interface TrackMeta {
  title: string;
  artist?: string;
  genre?: string;
}

export function recommendFromHistory(history: TrackMeta[], library: TrackMeta[], count = 3): string {
  if (!history.length || !library.length) return 'No recent listening history to base recommendations on.';
  const recent = history.slice(0, 5);
  const genres = new Set(recent.map(t => t.genre).filter(Boolean));
  const artists = new Set(recent.map(t => t.artist).filter(Boolean));
  const matches = library.filter(t => 
    (t.genre && genres.has(t.genre)) || (t.artist && artists.has(t.artist))
  ).filter(t => !recent.some(r => r.title === t.title)).slice(0, count);
  if (!matches.length) return 'I could not find similar tracks in your library.';
  return 'Based on what you have been listening to, you might like: ' + matches.map(t => `${t.title} by ${t.artist || 'unknown'}`).join(', ') + '.';
}
