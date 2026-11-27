/**
 * Kevo Music Radio: generate a "radio" queue of similar tracks from the local library.
 * Inspired by Spotify Radio / "play similar" / artist radio from public player behavior:
 * - Seed from current or named track/artist/genre
 * - Prefer same artist, then same genre, then related
 * - Shuffle-ish order, avoid immediate repeats
 * Implemented from scratch matching observable semantics (queue built, play starts).
 * No proprietary Spotify code copied.
 */

export interface TrackMeta {
  id: string;
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  composer?: string;
}

export function buildRadioQueue(seed: TrackMeta, library: TrackMeta[], max = 20): TrackMeta[] {
  if (!library.length) return [];
  const seedArtist = (seed.artist || '').toLowerCase();
  const seedGenre = (seed.genre || '').toLowerCase();
  const scored = library
    .filter(t => t.id !== seed.id)
    .map(t => {
      let score = 0;
      if ((t.artist || '').toLowerCase() === seedArtist) score += 10;
      if ((t.genre || '').toLowerCase() === seedGenre && seedGenre) score += 5;
      if ((t.composer || '').toLowerCase() === (seed.composer || '').toLowerCase() && seed.composer) score += 3;
      // simple title word overlap
      const seedWords = new Set(seed.title.toLowerCase().split(/\W+/));
      const overlap = t.title.toLowerCase().split(/\W+/).filter(w => seedWords.has(w)).length;
      score += overlap;
      return { t, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(x => x.t);

  // light shuffle of the top results
  for (let i = scored.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [scored[i], scored[j]] = [scored[j], scored[i]];
  }
  return scored;
}

export function formatRadioStart(seed: TrackMeta, count: number): string {
  return `Starting radio based on ${seed.title} by ${seed.artist}. Queued ${count} similar tracks from your library.`;
}
