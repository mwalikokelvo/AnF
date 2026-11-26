/**
 * Spotify catalog search for Kevo (metadata only).
 * Uses Client Credentials flow when Client ID + Secret are provided by the user
 * (stored in OS credential store, never logged).
 * Returns track name, artist, album and a 30-second preview URL when available.
 * Playback control requires Spotify Premium + user token and is not implemented here.
 */

export interface SpotifyTrack {
  name: string;
  artist: string;
  album?: string;
  previewUrl?: string | null;
  id: string;
}

export interface SpotifyCreds {
  clientId: string;
  clientSecret: string;
}

let tokenCache: { token: string; expires: number } | null = null;

async function getClientToken(creds: SpotifyCreds): Promise<string> {
  if (tokenCache && tokenCache.expires > Date.now() + 10_000) return tokenCache.token;
  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(`${creds.clientId}:${creds.clientSecret}`),
    },
    body,
  });
  if (!res.ok) throw new Error(`Spotify auth failed: ${res.status}`);
  const data = await res.json();
  tokenCache = { token: data.access_token, expires: Date.now() + (data.expires_in - 30) * 1000 };
  return data.access_token;
}

export async function searchSpotify(
  query: string,
  creds: SpotifyCreds | null,
  limit = 3,
): Promise<string> {
  if (!creds?.clientId || !creds.clientSecret) {
    return 'Spotify search needs your Client ID and Secret. Add them in Settings > Integrations > Spotify, then try again.';
  }
  try {
    const token = await getClientToken(creds);
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}&market=US`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Spotify search returned ${res.status}`);
    const data = await res.json();
    const tracks: SpotifyTrack[] = (data.tracks?.items || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      artist: t.artists?.[0]?.name || 'Unknown',
      album: t.album?.name,
      previewUrl: t.preview_url,
    }));
    if (!tracks.length) return `I found no Spotify tracks matching "${query}".`;
    const lines = tracks.map((t, i) => {
      const prev = t.previewUrl ? ' (preview available)' : '';
      return `${i + 1}. ${t.name} by ${t.artist}${t.album ? ` from ${t.album}` : ''}${prev}`;
    });
    return `Spotify results for ${query}: ${lines.join(' ')}`;
  } catch (err) {
    return `Spotify search failed: ${String(err).replace(/^Error:\s*/, '')}`;
  }
}

export function isSpotifySearchRequest(text: string): { query: string } | null {
  const m = /(?:search|find|look up|play)\s+(?:on\s+)?spotify(?:\s+for)?\s+(.+)/i.exec(text.trim());
  if (m) return { query: m[1].replace(/[.!?]+$/, '').trim() };
  return null;
}
