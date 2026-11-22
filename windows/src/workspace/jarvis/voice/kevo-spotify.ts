/**
 * Spotify search for Kevo: opens the public Spotify web search for a query.
 * Uses no API key; just constructs the public search URL. From research on Spotify Web API and player.
 * Does not copy proprietary code; reverse-engineers the public search capability.
 */

export function isSpotifySearchRequest(lower: string): string | null {
  const said = lower
    .replace(/[.!?]+$/, '')
    .trim()
    .replace(/^kevo[\s,]+/, '')
    .replace(/^(?:(?:can|could|would|will) you(?: please)?|please)[\s,]+/, '')
    .replace(/[\s,]+(?:please|kevo)$/, '');
  const m = /^(?:search (?:spotify|spoti) for|spotify search|find on spotify|play on spotify|spotify) (.+)$/.exec(said);
  return m ? m[1].trim() : null;
}

export function spotifySearchUrl(query: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
}
