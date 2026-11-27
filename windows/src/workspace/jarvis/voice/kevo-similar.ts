/**
 * Local "play something like" for the Music Hub, inspired by Spotify radio/recommendations but using only the user's own library metadata.
 * No network. From Grok research into Spotify Web API ideas (search, playlists, similar) without proprietary code.
 */

import { bareRequest } from './kevo-fun';

export function isSimilarRequest(lower: string): boolean {
  const said = bareRequest(lower);
  return /^(?:play |put on )?(?:something |more |a track )?like (?:this|that|the current|it)$|^play something similar$|^more like this$/.test(said);
}

/** Given current track metadata, return a simple local filter description for the player to use. */
export function similarFilter(current: { artist?: string; genre?: string; album?: string } | null): string {
  if (!current) return 'any track';
  if (current.genre) return `genre:${current.genre}`;
  if (current.artist) return `artist:${current.artist}`;
  return 'any track';
}
