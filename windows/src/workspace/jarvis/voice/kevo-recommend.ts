/**
 * Simple music recommendation for Kevo.
 * Uses the existing free Audius public search to suggest related tracks.
 * "Play something like Radiohead" or "recommend music like the last song".
 * Ideas from Spotify recommendations and open assistants.
 */

export interface RecommendResult {
  ok: boolean;
  speech: string;
  suggestions: string[];
}

export async function recommendSimilar(seed: string): Promise<RecommendResult> {
  if (!seed?.trim()) {
    return { ok: false, speech: 'What should I find music similar to?', suggestions: [] };
  }
  // For now, search Audius for the seed and report titles (extend with better similarity later)
  const url = `https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(seed.trim())}&limit=5`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('api');
    const data = await res.json() as { data?: { title?: string; user?: { name?: string } }[] };
    const suggestions = (data.data || []).slice(0, 3).map((t) => `${t.title || 'Track'} by ${t.user?.name || 'artist'}`);
    if (suggestions.length === 0) {
      return { ok: true, speech: `I could not find similar tracks for ${seed} right now.`, suggestions: [] };
    }
    return {
      ok: true,
      speech: `Here are some tracks related to ${seed}: ${suggestions.join('; ')}.`,
      suggestions,
    };
  } catch {
    return { ok: false, speech: 'Recommendation service is not available right now.', suggestions: [] };
  }
}

export function parseRecommendRequest(text: string): string | null {
  const m = /(?:play something like |recommend (?:music |tracks |songs )?(?:like |similar to )|something like )(.+)/i.exec(text.trim());
  return m ? m[1].trim() : null;
}
