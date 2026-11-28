/**
 * Kevo music discovery via free MusicBrainz public API (no key required).
 * Suggests similar artists or related works. Does not play proprietary streams.
 */

import { onlineGet, type LookupFetch } from './kevo-online';

const MB = 'https://musicbrainz.org/ws/2';

export async function findSimilarArtists(artist: string, fetchFn?: LookupFetch): Promise<string> {
  const clean = artist.trim();
  if (!clean) return 'Which artist should I look up, sir?';
  try {
    const searchUrl = `${MB}/artist/?query=${encodeURIComponent(clean)}&fmt=json&limit=1`;
    const searchRes = await onlineGet(searchUrl, 'MusicBrainz', fetchFn, { 'User-Agent': 'AnF-Kevo/1.0 (https://github.com/mwalikokelvo/AnF)' });
    if (!searchRes.ok) throw new Error(`search ${searchRes.status}`);
    const searchData = await searchRes.json() as { artists?: { id: string; name: string }[] };
    const found = searchData.artists?.[0];
    if (!found) return `I could not find an artist named "${clean}" on MusicBrainz, sir.`;

    const relUrl = `${MB}/artist/${found.id}?inc=artist-rels&fmt=json`;
    const relRes = await onlineGet(relUrl, 'MusicBrainz', fetchFn, { 'User-Agent': 'AnF-Kevo/1.0 (https://github.com/mwalikokelvo/AnF)' });
    if (!relRes.ok) throw new Error(`rels ${relRes.status}`);
    const relData = await relRes.json() as { relations?: { type: string; artist?: { name: string } }[] };
    const similar = (relData.relations || [])
      .filter(r => /similar|collaboration|member of/i.test(r.type) && r.artist?.name)
      .map(r => r.artist!.name)
      .filter((n, i, a) => a.indexOf(n) === i)
      .slice(0, 4);

    if (!similar.length) return `${found.name} is known, but MusicBrainz has no similar artists listed right now, sir.`;
    return `Artists related to ${found.name}: ${similar.join(', ')}. You can search your library or open sources for them, sir.`;
  } catch {
    return 'The music database did not answer. Check the internet connection, sir.';
  }
}

export function isMusicRecommendRequest(lower: string): string | null {
  const m = /\b(?:similar|like|recommend|artists? like|who is like|related to) (?:to |the artist )?(.+?)(?:\?|$)/i.exec(lower)
    || /\bfind (?:me )?(?:similar|artists? like) (.+)/i.exec(lower);
  return m ? m[1].trim() : null;
}
