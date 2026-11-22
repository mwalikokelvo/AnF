/**
 * Kevo: What's playing?
 * Reports the current track from the Music Hub if available.
 * Inspired by "what's playing" in major voice assistants.
 */

export interface CurrentTrack {
  title: string;
  artist?: string;
  album?: string;
}

export function formatWhatsPlaying(track: CurrentTrack | null): string {
  if (!track || !track.title) return 'Nothing is playing right now, sir.';
  let reply = `Now playing ${track.title}`;
  if (track.artist) reply += ` by ${track.artist}`;
  if (track.album) reply += ` from ${track.album}`;
  return reply + ', sir.';
}
