/**
 * Kevo Playlist: local playlist management inspired by Spotify queue/playlists.
 * Stores simple named lists of track titles/paths in memory or local storage.
 * No proprietary code; clean-room based on public music player behaviors.
 */

export interface Playlist {
  name: string;
  tracks: string[];
}

const playlists = new Map<string, Playlist>();

export function createPlaylist(name: string): string {
  const key = name.toLowerCase().trim();
  if (playlists.has(key)) return `Playlist "${name}" already exists.`;
  playlists.set(key, { name, tracks: [] });
  return `Created playlist "${name}".`;
}

export function addToPlaylist(name: string, track: string): string {
  const key = name.toLowerCase().trim();
  const p = playlists.get(key);
  if (!p) return `No playlist named "${name}". Say "create playlist ${name}" first.`;
  p.tracks.push(track);
  return `Added "${track}" to "${p.name}".`;
}

export function listPlaylist(name: string): string {
  const key = name.toLowerCase().trim();
  const p = playlists.get(key);
  if (!p || !p.tracks.length) return `Playlist "${name}" is empty or does not exist.`;
  return `"${p.name}" has: ${p.tracks.join(', ')}.`;
}

export function listPlaylists(): string {
  if (!playlists.size) return 'You have no playlists yet.';
  return 'Your playlists: ' + Array.from(playlists.values()).map(p => p.name).join(', ') + '.';
}
