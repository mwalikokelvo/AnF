/**
 * Kevo Music Controls — Spotify-style playback modifiers.
 * Observable behaviors recovered from public Spotify Web API docs:
 * - volume 0-100, shuffle boolean, repeat: off|track|context.
 * Failure modes: no active device, premium required (graceful), network.
 */
export type RepeatMode = 'off' | 'one' | 'all';

export interface MusicState {
  volume: number; // 0-100
  shuffle: boolean;
  repeat: RepeatMode;
  nextTrack?: string;
}

let state: MusicState = { volume: 50, shuffle: false, repeat: 'off' };

export function setVolume(level: number): string {
  state.volume = Math.max(0, Math.min(100, Math.round(level)));
  return `Volume set to ${state.volume} percent.`;
}

export function volumeUp(): string {
  return setVolume(state.volume + 10);
}

export function volumeDown(): string {
  return setVolume(state.volume - 10);
}

export function mute(): string {
  state.volume = 0;
  return 'Muted.';
}

export function toggleShuffle(): string {
  state.shuffle = !state.shuffle;
  return state.shuffle ? 'Shuffle on.' : 'Shuffle off.';
}

export function setRepeat(mode: RepeatMode): string {
  state.repeat = mode;
  return `Repeat set to ${mode}.`;
}

export function getNext(): string {
  return state.nextTrack ? `Next up: ${state.nextTrack}.` : 'Nothing is queued next.';
}

export function getState(): MusicState {
  return { ...state };
}
