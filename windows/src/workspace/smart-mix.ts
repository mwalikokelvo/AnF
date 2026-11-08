/**
 * Spotify-Class Smart Mixes & Mood Flow Engine
 *
 * Automatically partitions and scores an audio library into cohesive dynamic mixes:
 * - Focus Flow (ambient, classical, instrumental, lo-fi, chill)
 * - Energy Pulse (rock, electronic, pop, dance, high-energy)
 * - Acoustic & Chill (folk, jazz, soul, acoustic, mellow)
 * - Hidden Gems (rarely played, deep catalog cuts)
 * - Decades Time Capsule (70s, 80s, 90s, 2000s classics)
 * - Spoken & Stories (audiobooks, podcasts, lectures, long-form)
 *
 * Supports Extended M3U playlist export (#EXTM3U / #EXTINF) and direct playlist creation.
 * Follows Ponytail Lazy Senior Dev principles: pure TypeScript, zero dependencies.
 */

import type { AudioTrack } from './audio-library';

export type SmartMood =
  | 'focus'
  | 'energy'
  | 'chill'
  | 'hidden-gems'
  | 'spoken'
  | 'decades';

export interface SmartMixSummary {
  mood: SmartMood;
  title: string;
  description: string;
  trackCount: number;
  totalDurationSeconds: number;
}

export interface SmartMix {
  mood: SmartMood;
  title: string;
  description: string;
  tracks: AudioTrack[];
  totalDurationSeconds: number;
}

const GENRE_FOCUS = ['classical', 'ambient', 'instrumental', 'soundtrack', 'lo-fi', 'lofi', 'chillout', 'electronic', 'score'];
const GENRE_ENERGY = ['rock', 'metal', 'pop', 'dance', 'edm', 'house', 'techno', 'hip-hop', 'rap', 'punk', 'drum and bass'];
const GENRE_CHILL = ['jazz', 'soul', 'blues', 'acoustic', 'folk', 'indie', 'r&b', 'reggae', 'singer-songwriter'];
const GENRE_SPOKEN = ['audiobook', 'podcast', 'speech', 'spoken', 'interview', 'talk'];

/**
 * Computes an affinity score for a track matching a given mood category (0 to 100).
 */
export function scoreTrackMood(track: AudioTrack, mood: SmartMood): number {
  let score = 0;
  const genre = (track.genre || '').toLowerCase();
  const title = (track.title || track.name || '').toLowerCase();
  const artist = (track.artist || '').toLowerCase();
  const duration = track.duration || 0;
  const kind = track.kind || 'music';

  switch (mood) {
    case 'focus': {
      if (kind === 'audiobook') return 0;
      if (GENRE_FOCUS.some(g => genre.includes(g))) score += 50;
      if (['chill', 'study', 'relax', 'piano', 'ambient', 'focus', 'flow'].some(k => title.includes(k) || artist.includes(k))) score += 30;
      // Instrumental indicators (no lyrics or very long tracks)
      if (!track.lyrics) score += 20;
      if (duration > 300) score += 10;
      break;
    }
    case 'energy': {
      if (kind === 'audiobook' || kind === 'podcast') return 0;
      if (GENRE_ENERGY.some(g => genre.includes(g))) score += 50;
      if (['upbeat', 'remix', 'fast', 'pump', 'club', 'beat', 'energy', 'run'].some(k => title.includes(k))) score += 30;
      if (duration > 120 && duration < 300) score += 20; // classic pop/dance length
      break;
    }
    case 'chill': {
      if (kind === 'audiobook') return 0;
      if (GENRE_CHILL.some(g => genre.includes(g))) score += 50;
      if (['acoustic', 'night', 'soft', 'slow', 'mellow', 'sweet', 'ballad'].some(k => title.includes(k))) score += 30;
      if (track.lyrics) score += 10;
      break;
    }
    case 'hidden-gems': {
      // Prioritize tracks that might be overlooked
      score = 50;
      if (duration > 0) score += 10;
      if (track.year && track.year < 2010) score += 20;
      if (!track.coverUrl) score += 20; // non-singles / local cuts
      break;
    }
    case 'spoken': {
      if (kind === 'audiobook' || kind === 'podcast') return 100;
      if (GENRE_SPOKEN.some(g => genre.includes(g))) score += 70;
      if (track.chapters && track.chapters.length > 0) score += 30;
      if (duration > 600) score += 20; // 10+ minutes
      break;
    }
    case 'decades': {
      if (track.year && track.year >= 1950 && track.year <= 2015) {
        score = 80;
      } else {
        score = 20;
      }
      break;
    }
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Generates a themed Smart Mix playlist from a collection of audio tracks.
 */
export function generateSmartMix(tracks: AudioTrack[], mood: SmartMood, limit = 25): SmartMix {
  const scored = tracks
    .map(track => ({ track, score: scoreTrackMood(track, mood) }))
    .filter(item => item.score > 25)
    .sort((a, b) => b.score - a.score);

  const selected = scored.slice(0, limit).map(item => item.track);
  const totalDuration = selected.reduce((acc, t) => acc + (t.duration || 0), 0);

  const titles: Record<SmartMood, { title: string; desc: string }> = {
    focus: {
      title: 'Deep Focus Flow',
      desc: 'Ambient, instrumental, and atmospheric tracks to enter flow state.',
    },
    energy: {
      title: 'High Energy Cardio',
      desc: 'Upbeat rhythm, rock, electronic, and dance tracks to power your day.',
    },
    chill: {
      title: 'Late Night Acoustic',
      desc: 'Mellow melodies, acoustic chords, jazz, and soul for unwinding.',
    },
    'hidden-gems': {
      title: 'Discovery Radar & Deep Cuts',
      desc: 'Uncovered treasures and overlooked tracks from your local collection.',
    },
    spoken: {
      title: 'Spoken Stories & Podcasts',
      desc: 'Audiobooks, spoken word chapters, and podcast episodes.',
    },
    decades: {
      title: 'Time Capsule Classics',
      desc: 'Timeless favorites and golden era classics across the decades.',
    },
  };

  return {
    mood,
    title: titles[mood].title,
    description: titles[mood].desc,
    tracks: selected,
    totalDurationSeconds: Math.round(totalDuration),
  };
}

/**
 * Lists all available smart mixes that have at least 1 matching track in the library.
 */
export function listAvailableMixes(tracks: AudioTrack[]): SmartMixSummary[] {
  const moods: SmartMood[] = ['focus', 'energy', 'chill', 'hidden-gems', 'spoken', 'decades'];
  const summaries: SmartMixSummary[] = [];

  for (const mood of moods) {
    const mix = generateSmartMix(tracks, mood, 50);
    if (mix.tracks.length > 0) {
      summaries.push({
        mood: mix.mood,
        title: mix.title,
        description: mix.description,
        trackCount: mix.tracks.length,
        totalDurationSeconds: mix.totalDurationSeconds,
      });
    }
  }

  return summaries;
}

/**
 * Exports a SmartMix to standard Extended M3U (#EXTM3U) format.
 */
export function exportMixToM3u(mix: SmartMix): string {
  const lines = [
    '#EXTM3U',
    `#PLAYLIST:${mix.title}`,
    `#EXTREM:Mood: ${mix.mood}`,
    `#EXTREM:Generated by AnF Smart Mix Engine`,
    '',
  ];

  for (const t of mix.tracks) {
    const durationSec = Math.round(t.duration || 0);
    const artist = t.artist || 'Unknown Artist';
    const title = t.title || t.name || 'Untitled';
    lines.push(`#EXTINF:${durationSec},${artist} - ${title}`);
    lines.push(t.importPath || t.name || t.id);
  }

  return lines.join('\n') + '\n';
}
