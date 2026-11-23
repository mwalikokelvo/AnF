/**
 * Kevo: What's playing?
 * Reports the current track from the Music Hub if available.
 */

import { bareRequest } from './kevo-fun';

export interface CurrentTrack {
  title: string;
  artist?: string;
  album?: string;
}

export function formatWhatsPlaying(track: CurrentTrack | null | undefined): string {
  if (!track || !track.title || !track.title.trim()) {
    return 'Nothing is playing right now, sir.';
  }
  let reply = `Now playing ${track.title.trim()}`;
  if (track.artist && track.artist.trim()) {
    reply += ` by ${track.artist.trim()}`;
  }
  if (track.album && track.album.trim()) {
    reply += ` from ${track.album.trim()}`;
  }
  return reply + ', sir.';
}

/** "what's playing", "what song is this", "what is playing right now", "what track is playing", "current song" */
export function isWhatsPlayingRequest(lower: string): boolean {
  const said = bareRequest(lower).replace(/^(?:(?:can|could|would) you )?(?:tell me |show me )?/, '');
  return /^(?:what(?:'s| is) (?:currently |now )?(?:playing|on)(?: right now)?|what song is (?:this|that|playing)(?: right now)?|what track is (?:this|that|playing)(?: right now)?|what(?:'s| is) (?:this|the|that) song|what(?:'s| is) (?:this|the|that) track|what are we listening to|current (?:song|track)|who is (?:this|singing))$/.test(
    said
  );
}
