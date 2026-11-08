import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  transcribeAudio,
  transcriptionToMarkdownNote,
  type TranscriptionRequest,
} from '../src/workspace/transcription.ts';

test('transcribeAudio sends audio payload and parses JSON transcript', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/v1/audio/transcriptions')) {
        return new Response(
          JSON.stringify({
            text: 'This is a test transcription from OpenWhispr.',
            duration: 12.5,
            segments: [{ id: 0, start: 0, end: 12.5, text: 'This is a test transcription from OpenWhispr.' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    const audioBytes = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]);
    const result = await transcribeAudio({
      audio: audioBytes,
      serverUrl: 'http://localhost:3900',
    });

    assert.equal(result.text, 'This is a test transcription from OpenWhispr.');
    assert.equal(result.duration, 12.5);
    assert.equal(result.segments?.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('transcriptionToMarkdownNote formats transcript into Obsidian/AnF note', () => {
  const note = transcriptionToMarkdownNote(
    {
      text: 'Meeting notes discussing the next release.',
      duration: 60,
    },
    'Release Planning'
  );

  assert.match(note, /# Release Planning/);
  assert.match(note, /Meeting notes discussing the next release/);
  assert.match(note, /duration: 60s/);
});

test('transcribeAudio handles backend network errors gracefully', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => {
      return new Response('Transcription service unavailable', { status: 503 });
    }) as any;

    await assert.rejects(
      () =>
        transcribeAudio({
          audio: new Uint8Array([0, 1, 2]),
          serverUrl: 'http://localhost:3900',
        }),
      /HTTP 503/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
