/**
 * Echo Music Flow - Vertical Discovery Reel & Candidate Ranking Engine
 * Reverse-engineered from EchoMusicApp/Echo-Music (musicflow module & MusicFlowPage.kt)
 * Implements Resso-style vertical swipe reel, 80px blurred backdrop, synced lyric HUD,
 * 56dp play glyph, and Nothing OS 5.0 minimal action bar.
 */
import { cleanTitle, primaryArtist, type ParsedLyrics } from './lyrics-provider';
import type { AudioTrack } from './audio-library';

export type MusicFlowSource =
  | 'NOW_PLAYING'
  | 'HISTORY'
  | 'LIKED'
  | 'QUICK_PICKS'
  | 'CATALOG'
  | 'OFFLINE';

export interface MusicFlowItem {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  coverUrl?: string;
  streamUrl?: string;
  source: MusicFlowSource;
  lyrics?: ParsedLyrics;
  dnaSummary?: string;
}

export interface MusicFlowRankingConfig {
  artistSpacing: number;
  likedArtistBoost: number;
  lessLikeThisPenalty: number;
  positionDecay: number;
  sourceWeights: Record<MusicFlowSource, number>;
}

export const DEFAULT_MUSIC_FLOW_CONFIG: MusicFlowRankingConfig = {
  artistSpacing: 2,
  likedArtistBoost: 1.0,
  lessLikeThisPenalty: 2.5,
  positionDecay: 0.02,
  sourceWeights: {
    HISTORY: 0.6,
    LIKED: 0.8,
    QUICK_PICKS: 0.5,
    CATALOG: 0.2,
    OFFLINE: 0.4,
    NOW_PLAYING: 1.0,
  },
};

export function trackKeyOf(title: string, artist: string): string {
  return `${cleanTitle(title).toLowerCase()}::${primaryArtist(artist).toLowerCase()}`;
}

export function primaryArtistKey(artist?: string): string {
  return artist ? primaryArtist(artist).toLowerCase().trim() : '';
}

/**
 * Filter and deduplicate candidates by seen track keys, song IDs, and recent IDs.
 */
export function filterMusicFlowCandidates(
  candidates: MusicFlowItem[],
  seenTrackKeys: Set<string> = new Set(),
  excludedTrackKeys: Set<string> = new Set()
): MusicFlowItem[] {
  const batchKeys = new Set<string>();
  const batchIds = new Set<string>();

  return candidates.filter(item => {
    const key = trackKeyOf(item.title, item.artist);
    if (!item.id || !item.title.trim()) return false;
    if (batchIds.has(item.id) || seenTrackKeys.has(key) || excludedTrackKeys.has(key) || batchKeys.has(key)) {
      return false;
    }
    batchIds.add(item.id);
    batchKeys.add(key);
    return true;
  });
}

/**
 * Rank candidates using source weights, liked-artist boost, position decay, and greedy artist spacing.
 * Directly mirrors Echo Music's rankMusicFlowCandidates in MusicFlowRanking.kt.
 */
export function rankMusicFlowCandidates(
  candidates: MusicFlowItem[],
  feedTailArtists: string[] = [],
  likedArtists: Set<string> = new Set(),
  lessLikeArtists: Set<string> = new Set(),
  config: MusicFlowRankingConfig = DEFAULT_MUSIC_FLOW_CONFIG
): MusicFlowItem[] {
  // 1. Compute scores
  const scored = candidates
    .map((item, index) => {
      const artist = primaryArtistKey(item.artist);
      let score = config.sourceWeights[item.source] ?? 0.2;
      score -= index * config.positionDecay;
      if (artist && likedArtists.has(artist)) score += config.likedArtistBoost;
      if (artist && lessLikeArtists.has(artist)) score -= config.lessLikeThisPenalty;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.item);

  // 2. Greedy pick enforcing artist spacing
  const recent: string[] = [...feedTailArtists.slice(-config.artistSpacing)];
  const result: MusicFlowItem[] = [];
  const pool = [...scored];

  while (pool.length > 0) {
    let pickIndex = pool.findIndex(item => {
      const art = primaryArtistKey(item.artist);
      return !art || !recent.includes(art);
    });

    if (pickIndex < 0) pickIndex = 0; // Fallback if all remaining share recent artist

    const picked = pool.splice(pickIndex, 1)[0];
    result.push(picked);

    const pickedArtist = primaryArtistKey(picked.artist);
    recent.push(pickedArtist);
    while (recent.length > config.artistSpacing) {
      recent.shift();
    }
  }

  return result;
}

/**
 * Convert local AudioTrack to MusicFlowItem
 */
export function audioTrackToFlowItem(track: AudioTrack, source: MusicFlowSource = 'OFFLINE'): MusicFlowItem {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist || 'Unknown Artist',
    album: track.album,
    duration: track.duration,
    coverUrl: track.coverUrl,
    streamUrl: track.streamUrl,
    source,
  };
}
