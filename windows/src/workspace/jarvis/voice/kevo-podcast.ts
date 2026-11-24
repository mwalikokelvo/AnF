/**
 * Podcast search for Kevo using Apple's free public iTunes Search API.
 * https://itunes.apple.com/search?term=...&media=podcast
 * No key, documented by Apple. Rate limit ~20/min.
 * Ideas from Alexa/Google Assistant podcast skills and Mycroft podcast skill.
 */

export interface PodcastHit {
  name: string;
  author: string;
  feedUrl?: string;
  episodeCount?: number;
  genre?: string;
}

export interface PodcastSearchResult {
  ok: boolean;
  speech: string;
  hits: PodcastHit[];
}

export async function searchPodcasts(query: string, limit = 3): Promise<PodcastSearchResult> {
  if (!query?.trim()) {
    return { ok: false, speech: 'What podcast would you like me to look for?', hits: [] };
  }
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query.trim())}&media=podcast&entity=podcast&limit=${limit}&country=US`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { ok: false, speech: 'The podcast search service is not available right now.', hits: [] };
    }
    const data = await res.json() as { resultCount: number; results: any[] };
    const hits: PodcastHit[] = (data.results || []).slice(0, limit).map((r) => ({
      name: r.collectionName || r.trackName || 'Unknown',
      author: r.artistName || 'Unknown',
      feedUrl: r.feedUrl,
      episodeCount: r.trackCount,
      genre: r.primaryGenreName,
    }));
    if (hits.length === 0) {
      return { ok: true, speech: `I found no podcasts matching ${query}.`, hits: [] };
    }
    const names = hits.map((h) => `${h.name} by ${h.author}`).join(', ');
    return {
      ok: true,
      speech: `I found ${hits.length} podcast${hits.length > 1 ? 's' : ''}: ${names}.`,
      hits,
    };
  } catch {
    return { ok: false, speech: 'Could not search for podcasts right now.', hits: [] };
  }
}

export function parsePodcastRequest(text: string): string | null {
  const m = /(?:search (?:for )?podcasts? (?:about |on |for )|find podcasts? (?:about |on |for )|podcasts? about |listen to podcasts? (?:about |on ))(.+)/i.exec(text.trim());
  return m ? m[1].trim() : null;
}
