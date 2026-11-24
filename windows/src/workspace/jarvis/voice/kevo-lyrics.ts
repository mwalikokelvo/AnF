/**
 * Lyrics lookup for Kevo using the free public lyrics.ovh API.
 * GET https://api.lyrics.ovh/v1/{artist}/{title}
 * No key required. Documented at https://lyricsovh.docs.apiary.io
 * Ideas from leading assistants that support "what are the lyrics to..."
 */

export interface LyricsResult {
  ok: boolean;
  lyrics?: string;
  speech: string;
  artist?: string;
  title?: string;
}

export async function fetchLyrics(artist: string, title: string): Promise<LyricsResult> {
  if (!artist?.trim() || !title?.trim()) {
    return { ok: false, speech: 'Please tell me the artist and the song title.' };
  }
  const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist.trim())}/${encodeURIComponent(title.trim())}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { ok: false, speech: `I could not find lyrics for ${title} by ${artist}.` };
    }
    const data = await res.json() as { lyrics?: string; error?: string };
    if (data.lyrics) {
      // Speak a short excerpt so it stays usable in voice
      const excerpt = data.lyrics.split('\n').slice(0, 8).join('\n').slice(0, 400);
      return {
        ok: true,
        lyrics: data.lyrics,
        speech: `Here are the opening lines of ${title} by ${artist}: ${excerpt}`,
        artist,
        title,
      };
    }
    return { ok: false, speech: data.error || `No lyrics found for ${title} by ${artist}.` };
  } catch {
    return { ok: false, speech: 'The lyrics service is not available right now.' };
  }
}

export function parseLyricsRequest(text: string): { artist: string; title: string } | null {
  const lower = text.toLowerCase();
  // "lyrics for Yellow by Coldplay", "what are the lyrics to Bohemian Rhapsody by Queen"
  const m = /(?:lyrics (?:for|of|to)|what are the lyrics (?:for|of|to))\s+(.+?)(?:\s+by\s+(.+))?$/i.exec(text.trim());
  if (m) {
    const title = m[1].trim();
    const artist = m[2]?.trim() || '';
    if (title) return { artist, title };
  }
  return null;
}
