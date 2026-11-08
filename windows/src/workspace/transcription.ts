/**
 * Local Speech-to-Text Transcription (OpenWhispr / VoiceStudio integration).
 *
 * Provides private, offline-first transcription of audio memos, recorded clips,
 * and Audio Studio exports into formatted Markdown notes.
 * Connects via local HTTP endpoint (default http://localhost:3900) with zero cloud telemetry.
 */

export interface TranscriptionSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionRequest {
  audio: Blob | Uint8Array;
  filename?: string;
  language?: string;
  format?: 'json' | 'text' | 'verbose_json' | 'srt' | 'vtt';
  serverUrl?: string;
  model?: string;
}

export interface TranscriptionResult {
  text: string;
  duration?: number;
  language?: string;
  segments?: TranscriptionSegment[];
}

export async function transcribeAudio(request: TranscriptionRequest): Promise<TranscriptionResult> {
  const serverUrl = request.serverUrl || 'http://localhost:3900';
  const model = request.model || 'whisper-1';
  const format = request.format || 'verbose_json';

  const formData = new FormData();
  const blob = request.audio instanceof Blob
    ? request.audio
    : new Blob([new Uint8Array(request.audio)], { type: 'audio/wav' });

  formData.append('file', blob, request.filename || 'recording.wav');
  formData.append('model', model);
  formData.append('response_format', format);
  if (request.language) {
    formData.append('language', request.language);
  }

  const res = await fetch(`${serverUrl}/v1/audio/transcriptions`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Transcription failed: HTTP ${res.status}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    return {
      text: typeof data.text === 'string' ? data.text.trim() : '',
      duration: typeof data.duration === 'number' ? data.duration : undefined,
      language: typeof data.language === 'string' ? data.language : undefined,
      segments: Array.isArray(data.segments) ? data.segments : undefined,
    };
  }

  const text = (await res.text()).trim();
  return { text };
}

/** Formats a transcription result into an AnF / Obsidian Markdown note with frontmatter metadata. */
export function transcriptionToMarkdownNote(result: TranscriptionResult, title = 'Audio Transcription'): string {
  const dateIso = new Date().toISOString().slice(0, 10);
  const wordCount = result.text.split(/\s+/).filter(Boolean).length;
  const durationMeta = result.duration !== undefined ? `duration: ${Math.round(result.duration)}s\n` : '';

  let body = result.text;
  if (result.segments && result.segments.length > 1) {
    body = result.segments
      .map(s => `> **[${formatTime(s.start)} - ${formatTime(s.end)}]** ${s.text.trim()}`)
      .join('\n\n');
  }

  return `---
title: "${title}"
date: ${dateIso}
type: voice-memo
words: ${wordCount}
${durationMeta}---

# ${title}

${body}
`;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
