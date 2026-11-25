import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractVideoId,
  cleanVttTranscript,
  formatTimestamp,
  formatTranscriptMarkdown,
  fetchInvidiousTranscript
} from '../src/workspace/invidious-service';

describe('Invidious Service & Transcript Importer', () => {
  it('extracts video ID from multiple URL styles', () => {
    assert.equal(extractVideoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.equal(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.equal(extractVideoId('https://youtu.be/dQw4w9WgXcQ?t=42'), 'dQw4w9WgXcQ');
    assert.equal(extractVideoId('https://youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.equal(extractVideoId('https://inv.nadeko.net/api/v1/videos/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.equal(extractVideoId('not-a-valid-id'), null);
  });

  it('formats timestamps properly', () => {
    assert.equal(formatTimestamp(45), '0:45');
    assert.equal(formatTimestamp(65), '1:05');
    assert.equal(formatTimestamp(3665), '1:01:05');
  });

  it('parses and deduplicates WebVTT captions into clean segments and text', () => {
    const vtt = `WEBVTT
Kind: captions
Language: en

00:00:01.000 --> 00:00:04.500
Welcome to this lecture on artificial intelligence.

00:00:04.500 --> 00:00:07.200
Welcome to this lecture on artificial intelligence.

00:00:07.200 --> 00:00:10.000
Today we examine local-first architectures.
`;
    const res = cleanVttTranscript(vtt);
    assert.equal(res.segments.length, 2);
    assert.equal(res.segments[0].text, 'Welcome to this lecture on artificial intelligence.');
    assert.equal(res.segments[1].text, 'Today we examine local-first architectures.');
    assert.equal(
      res.fullText,
      'Welcome to this lecture on artificial intelligence. Today we examine local-first architectures.'
    );
  });

  it('formats transcript into markdown note with metadata', () => {
    const md = formatTranscriptMarkdown({
      videoId: 'dQw4w9WgXcQ',
      title: 'Rick Astley - Never Gonna Give You Up',
      author: 'Rick Astley',
      language: 'English',
      fullText: 'Never gonna give you up',
      segments: [{ start: 5, duration: 3, text: 'Never gonna give you up' }]
    });
    assert.ok(md.includes('# Rick Astley - Never Gonna Give You Up'));
    assert.ok(md.includes('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
    assert.ok(md.includes('**[0:05]** Never gonna give you up'));
  });

  it('fetches transcript with mocked network', async () => {
    const mockFetch = async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('/api/v1/videos/')) {
        return {
          ok: true,
          json: async () => ({
            title: 'Test Lecture',
            author: 'Prof. Smith',
            captions: [{ label: 'English', languageCode: 'en', url: '/api/v1/captions/xyz?label=English' }]
          })
        } as unknown as Response;
      }
      if (u.includes('/api/v1/captions/')) {
        return {
          ok: true,
          text: async () => `WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello class.\n`
        } as unknown as Response;
      }
      return { ok: false } as unknown as Response;
    };

    const res = await fetchInvidiousTranscript('xyz12345678', 'en', mockFetch as typeof fetch);
    assert.equal(res.title, 'Test Lecture');
    assert.equal(res.author, 'Prof. Smith');
    assert.equal(res.fullText, 'Hello class.');
  });
});
