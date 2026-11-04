const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus', 'wma', 'aif', 'aiff', 'amr', 'alac'];

export type LockTrack = {
  id: string;
  name: string;
  title?: string;
  artist?: string;
  album?: string;
  kind?: string;
  streamUrl?: string;
  blobSize: number;
  bytes?: Uint8Array;
  sha256?: string;
};

export type LockPlan =
  | { kind: 'remote'; url: string }
  | { kind: 'file'; ext: string }
  | { kind: 'stay'; reason: string };

/** Android `mediaRequest` ignores ids longer than 12 digits, so `Date.now()` never arrives. */
export function nativeBridgeId(n: number): string {
  const value = Math.floor(Math.abs(n));
  const id = String(value % 1_000_000_000_000 || 1);
  if (!/^[0-9]{1,12}$/.test(id)) throw Error('Native request id is out of range.');
  return id;
}

export function lockScreenPlan(track: LockTrack): LockPlan {
  const url = track.streamUrl?.trim() || '';
  if (track.kind === 'podcast' || url) {
    if (url.startsWith('https://') && url.length <= 2000 && !url.includes('@')) return { kind: 'remote', url };
    return { kind: 'stay', reason: 'Lock-screen playback needs an https audio link without a username or password.' };
  }
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(track.id)) return { kind: 'stay', reason: 'This track cannot be handed to the Android player.' };
  const ext = track.name.split('.').pop()?.toLowerCase() || '';
  if (!AUDIO_EXT.includes(ext)) return { kind: 'stay', reason: 'Lock-screen playback needs a file name with a known audio extension.' };
  if (track.blobSize < 1 || track.blobSize > 16_000_000) return { kind: 'stay', reason: 'Lock-screen playback accepts one file up to 16 MB.' };
  return { kind: 'file', ext };
}

function base64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}

/** Load the current track into the Android player. A local file is imported first; `play` is never sent to an empty player. */
export async function handOffLockScreen(
  track: LockTrack,
  position: number,
  call: (op: string, data: unknown) => Promise<unknown>,
): Promise<string> {
  const plan = lockScreenPlan(track);
  if (plan.kind === 'stay') return plan.reason;
  const title = track.title || track.name;
  const artist = track.artist || '';
  const album = track.album || '';
  if (plan.kind === 'remote') {
    await call('play_remote', { url: plan.url, title, artist, album, position });
    return 'Handed to the Android player.';
  }
  if (!track.bytes || !track.sha256 || track.bytes.length !== track.blobSize) return 'Lock-screen playback could not read this file.';
  const begin = await call('import_begin', { track: track.id, ext: plan.ext, size: track.bytes.length, sha256: track.sha256 }) as { existing?: boolean };
  if (!begin?.existing) {
    try {
      for (let offset = 0; offset < track.bytes.length; offset += 524288) {
        await call('import_chunk', { track: track.id, base64: base64(track.bytes.subarray(offset, offset + 524288)) });
      }
      await call('import_finish', { track: track.id });
    } catch (error) {
      await call('import_abort', { track: track.id }).catch(() => {});
      throw error;
    }
  }
  await call('queue', { items: [{ track: track.id, ext: plan.ext, title, artist, album }], repeat: 'off' });
  if (position > 0) await call('seek', { position: Math.min(86_400_000, Math.round(position * 1000)) });
  return 'Handed to the Android player.';
}
