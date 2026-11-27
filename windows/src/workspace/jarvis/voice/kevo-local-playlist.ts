/**
 * Kevo local music helpers inspired by public Spotify playlist patterns.
 * Creates a simple named playlist from a search query against the local library.
 * No proprietary code; pure local matching.
 * Example: "make a playlist called focus from jazz" or "playlist from search rock".
 */

export interface LocalTrack {
  id: string;
  title: string;
  artist?: string;
  genre?: string;
  path: string;
}

export interface LocalPlaylist {
  name: string;
  tracks: LocalTrack[];
  createdAt: number;
}

/**
 * Filters local tracks by a simple keyword match on title, artist or genre.
 * Returns up to `limit` matches.
 */
export function searchLocalTracks(tracks: LocalTrack[], query: string, limit = 10): LocalTrack[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return tracks
    .filter((t) =>
      t.title.toLowerCase().includes(q) ||
      (t.artist && t.artist.toLowerCase().includes(q)) ||
      (t.genre && t.genre.toLowerCase().includes(q))
    )
    .slice(0, limit);
}

/**
 * Builds a new playlist from matching tracks.
 */
export function createPlaylistFromSearch(
  name: string,
  tracks: LocalTrack[],
  query: string,
  limit = 10
): LocalPlaylist {
  const matched = searchLocalTracks(tracks, query, limit);
  return {
    name: name.trim() || `Search: ${query}`,
    tracks: matched,
    createdAt: Date.now(),
  };
}

export function formatPlaylist(playlist: LocalPlaylist): string {
  if (playlist.tracks.length === 0) return `Playlist "${playlist.name}" is empty. No local tracks matched.`;
  const titles = playlist.tracks.map((t) => t.title).slice(0, 3).join(', ');
  const more = playlist.tracks.length > 3 ? ` and ${playlist.tracks.length - 3} more` : '';
  return `Created playlist "${playlist.name}" with ${playlist.tracks.length} tracks: ${titles}${more}.`;
}
