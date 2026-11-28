/**
 * Local music recommendations for Kevo (Spotify-inspired, pure local).
 * Uses listening history + metadata (genre, artist, BPM) — no cloud, no proprietary Spotify code.
 * "Recommend something like this" / "more of this genre".
 */

export interface TrackMeta {
  id: string;
  title: string;
  artist: string;
  genre?: string;
  bpm?: number;
  lastPlayed?: number;
  playCount?: number;
}

export function recommendLocal(tracks: TrackMeta[], seed?: string, limit = 5): TrackMeta[] {
  if (!tracks?.length) return [];
  const lower = seed?.toLowerCase() || '';
  let scored = tracks.map(t => {
    let score = (t.playCount || 0) * 2 + (t.lastPlayed ? 1 : 0);
    if (lower && (t.artist.toLowerCase().includes(lower) || t.title.toLowerCase().includes(lower) || t.genre?.toLowerCase().includes(lower))) {
      score += 10;
    }
    if (t.genre && lower.includes(t.genre.toLowerCase())) score += 5;
    return { ...t, score };
  });
  // Prefer recent / frequent, diversify a bit
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const out: TrackMeta[] = [];
  for (const t of scored) {
    const key = `${t.artist}|${t.genre || ''}`;
    if (seen.has(key) && out.length > 1) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

export function formatRecommendations(recs: TrackMeta[]): string {
  if (!recs.length) return 'I could not find recommendations from your local library yet, sir.';
  const list = recs.map(r => `${r.title} by ${r.artist}`).join(', ');
  return `Based on your listening, you might like: ${list}.`;
}
