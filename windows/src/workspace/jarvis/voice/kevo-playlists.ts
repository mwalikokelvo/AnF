/**
 * Kevo Playlist voice control inspired by Spotify: create, add current, list.
 * Actual playback/library lives in Music Hub; these parse the requests.
 */

import { bareRequest } from './kevo-fun';

export function parseCreatePlaylist(lower: string): string | null {
  const m = /^(?:create|make|start) (?:a |the )?playlist (?:called |named )?(.+)$/.exec(bareRequest(lower));
  return m ? m[1].trim() : null;
}

export function isAddToPlaylist(lower: string): boolean {
  return /^(?:add (?:this |the current )?(?:song|track|one) to (?:the |my )?playlist|add to playlist)/.test(bareRequest(lower));
}

export function isListPlaylists(lower: string): boolean {
  return /^(?:list|show|what are) (?:my |the )?playlists$/.test(bareRequest(lower));
}
