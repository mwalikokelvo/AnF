/**
 * Invidious Service for AnF
 * 
 * Provides privacy-respecting YouTube audio and video transcript extraction
 * via Invidious public/self-hosted API endpoints without tracking or accounts.
 * Inspired by iv-org/invidious.
 */

import { onlineLookupsEnabled } from './online-lookups';
import { STREAM_INSTANCES } from './streaming-provider';

export interface CaptionTrack {
  label: string;
  languageCode: string;
  url: string;
}

export interface TranscriptSegment {
  start: number;
  duration: number;
  text: string;
}

export interface VideoTranscript {
  videoId: string;
  title: string;
  author: string;
  language: string;
  fullText: string;
  segments: TranscriptSegment[];
}

/** Extract standard 11-char YouTube video ID from various URL patterns or bare IDs. */
export function extractVideoId(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  
  const m = trimmed.match(/(?:youtu\.be\/|v=|\/embed\/|\/live\/|\/v\/|\/api\/v1\/videos\/)([a-zA-Z0-9_-]{11})/i);
  return m ? m[1] : null;
}

/** Clean and format WebVTT or SRT caption text into deduplicated clean prose. */
export function cleanVttTranscript(vttContent: string): { fullText: string; segments: TranscriptSegment[] } {
  if (!vttContent) return { fullText: '', segments: [] };

  const lines = vttContent.replace(/\r\n/g, '\n').split('\n');
  const segments: TranscriptSegment[] = [];
  let currentStart: number | null = null;
  let currentDuration = 0;
  let textBuffer: string[] = [];
  let lastAppendedText = '';

  const timeRegex = /(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/;

  function parseTime(hours: string | undefined, mins: string, secs: string, ms: string): number {
    const h = hours ? parseInt(hours, 10) : 0;
    const m = parseInt(mins, 10);
    const s = parseInt(secs, 10);
    const milli = parseInt(ms, 10);
    return h * 3600 + m * 60 + s + milli / 1000;
  }

  function flushBuffer() {
    if (textBuffer.length > 0 && currentStart !== null) {
      let raw = textBuffer.join(' ');
      let prev: string;
      do {
        prev = raw;
        raw = raw.replace(/<[^>]+>/g, '');
      } while (raw !== prev);
      raw = raw.trim();
      if (raw && raw !== lastAppendedText) {
        segments.push({ start: currentStart, duration: currentDuration, text: raw });
        lastAppendedText = raw;
      }
      textBuffer = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('WEBVTT') || line.startsWith('NOTE') || /^\d+$/.test(line)) {
      continue;
    }

    const timeMatch = line.match(timeRegex);
    if (timeMatch) {
      flushBuffer();
      const start = parseTime(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
      const end = parseTime(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
      currentStart = start;
      currentDuration = Math.max(0, end - start);
    } else if (currentStart !== null) {
      textBuffer.push(line);
    }
  }

  flushBuffer();

  // Combine segments into readable paragraphs
  const fullText = segments.map(s => s.text).join(' ');
  return { fullText, segments };
}

/** Format seconds into mm:ss or hh:mm:ss string. */
export function formatTimestamp(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Convert a fetched video transcript into a markdown note. */
export function formatTranscriptMarkdown(transcript: VideoTranscript): string {
  const dateStr = new Date().toISOString().split('T')[0];
  let md = `# ${transcript.title || 'Video Transcript'}\n\n`;
  md += `> **Source:** https://www.youtube.com/watch?v=${transcript.videoId}  \n`;
  md += `> **Author:** ${transcript.author || 'Unknown'}  \n`;
  md += `> **Language:** ${transcript.language}  \n`;
  md += `> **Imported:** ${dateStr} via Invidious\n\n`;
  md += `## Full Text\n\n${transcript.fullText}\n\n`;
  
  if (transcript.segments.length > 0) {
    md += `## Timed Transcript\n\n`;
    for (const seg of transcript.segments) {
      md += `**[${formatTimestamp(seg.start)}]** ${seg.text}\n\n`;
    }
  }
  return md;
}

/** Fetch captions through available Invidious instances. */
export async function fetchInvidiousTranscript(
  videoIdOrUrl: string,
  preferredLang = 'en',
  fetchImpl: typeof fetch = fetch
): Promise<VideoTranscript> {
  if (!onlineLookupsEnabled()) {
    throw new Error('Online lookups are disabled. Enable Online lookups to fetch transcripts.');
  }

  const videoId = extractVideoId(videoIdOrUrl);
  if (!videoId) {
    throw new Error('Invalid YouTube video URL or ID.');
  }

  // Find Invidious instances or use default
  const invidiousInstances = STREAM_INSTANCES.filter(i => i.kind === 'invidious');
  const candidateUrls = invidiousInstances.length > 0
    ? invidiousInstances.map(i => i.url)
    : ['https://inv.nadeko.net'];

  let lastError: Error | null = null;

  for (const instance of candidateUrls) {
    try {
      // 1. Fetch video metadata
      const metaRes = await fetchImpl(`${instance}/api/v1/videos/${videoId}?fields=title,author,captions`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!metaRes.ok) continue;

      const meta = await metaRes.json() as {
        title?: string;
        author?: string;
        captions?: Array<{ label?: string; languageCode?: string; url?: string }>;
      };

      const captions = Array.isArray(meta?.captions) ? meta.captions : [];
      if (captions.length === 0) {
        throw new Error('No captions or transcripts available for this video.');
      }

      // Pick preferred language or English or first available
      const selected = captions.find(c => c.languageCode === preferredLang || c.label?.toLowerCase().includes('english'))
        || captions[0];

      if (!selected?.url) {
        throw new Error('Caption track has no download URL.');
      }

      const captionUrl = selected.url.startsWith('http')
        ? selected.url
        : `${instance}${selected.url}`;

      // 2. Fetch the caption track content
      const capRes = await fetchImpl(captionUrl, { signal: AbortSignal.timeout(6000) });
      if (!capRes.ok) continue;

      const capText = await capRes.text();
      const { fullText, segments } = cleanVttTranscript(capText);

      return {
        videoId,
        title: meta.title || `Video ${videoId}`,
        author: meta.author || 'Unknown',
        language: selected.label || selected.languageCode || 'unknown',
        fullText,
        segments,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error('Could not resolve video transcript through Invidious.');
}
