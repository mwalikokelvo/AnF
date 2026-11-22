/**
 * Ideas for Spotify-like capabilities in Kevo / Music Hub, reverse-engineered from public Spotify Web API docs.
 * Does not include or copy any proprietary Spotify code. Uses free public endpoints where possible (client credentials for search).
 * Spotify search requires an app client ID/secret for access token (user sets up), or falls back to local/Audius/Internet Archive.
 * Capabilities: search tracks/artists/albums, get recommendations based on seeds (energy, danceability via audio features),
 * public playlists metadata. Playback control needs user auth and Premium for full play.
 * Positive addition: expands music discovery beyond local files without sending private data.
 */

export interface SpotifySearchIdea {
  query: string;
  type: 'track' | 'artist' | 'album' | 'playlist';
  limit?: number;
}

/** Example public search URL structure (token obtained separately via client credentials grant, documented at developer.spotify.com). */
export function buildSpotifySearchUrl(idea: SpotifySearchIdea): string {
  const params = new URLSearchParams({
    q: idea.query,
    type: idea.type,
    limit: String(idea.limit ?? 5),
  });
  return `https://api.spotify.com/v1/search?${params.toString()}`;
}

/** Recommendations idea: seed by track/artist and target audio features (valence for mood, energy, tempo). */
export function buildRecommendationsUrl(seedTracks: string[], targetEnergy?: number): string {
  const params = new URLSearchParams({
    seed_tracks: seedTracks.slice(0, 5).join(','),
    limit: '5',
  });
  if (targetEnergy !== undefined) params.set('target_energy', String(targetEnergy));
  return `https://api.spotify.com/v1/recommendations?${params.toString()}`;
}

// Note: Actual implementation would use owner's stored client credentials (in OS credential store, as per AnF design),
// fetch token, then call. No user private library data sent unless owner opts in. Local music preferred for privacy.
