import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeStreamError, NOT_AUDIO_MESSAGE } from '../src/workspace/streaming-provider.js';
import { mediaSrcAllows, needsRustFetch, loadRemoteAudio, clearRemoteAudioCache } from '../src/workspace/stream-source.js';

const conf = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const mediaSrc: string[] = (conf.app.security.csp as string).split(';').map(d => d.trim().split(/\s+/)).find(d => d[0] === 'media-src')!.slice(1);
const g = globalThis as unknown as { __TAURI_INTERNALS__?: unknown };
afterEach(() => { delete g.__TAURI_INTERNALS__; clearRemoteAudioCache(); });

test('mediaSrcAllows mirrors the CSP media-src hosts exactly', () => {
  for (const src of mediaSrc.filter(s => s.startsWith('https://'))) {
    const host = src.slice(8);
    const sample = host.startsWith('*.') ? 'a.' + host.slice(2) : host;
    assert.equal(mediaSrcAllows(`https://${sample}/x.mp3`), true, src);
  }
  for (const bad of ['https://cdn.example.com/a.mp3', 'https://archive.org.evil.test/a.mp3', 'https://evilarchive.org/a.mp3', 'https://example.com/archive.org/a.mp3', 'https://pipedproxy-bom.kavin.rocks/videoplayback', 'http://archive.org/a.mp3', 'not a url']) {
    assert.equal(mediaSrcAllows(bad), false, bad);
  }
  assert.equal(mediaSrcAllows('https://rr1---sn-x.googlevideo.com/videoplayback'), true);
});

test('needsRustFetch: only inside the desktop app and only for hosts the CSP blocks', () => {
  assert.equal(needsRustFetch('https://cdn.example.com/a.mp3'), false, 'outside the desktop app the audio element is used as before');
  g.__TAURI_INTERNALS__ = { invoke: async () => null };
  assert.equal(needsRustFetch('https://cdn.example.com/a.mp3'), true);
  assert.equal(needsRustFetch('https://archive.org/download/x/a.mp3'), false);
});

test('loadRemoteAudio goes through safe_fetch_audio, returns a typed blob and reuses the last download', async () => {
  const calls: unknown[] = [];
  g.__TAURI_INTERNALS__ = { invoke: async (cmd: string, args: unknown) => { calls.push([cmd, args]); return new Uint8Array([1, 2, 3]).buffer; } };
  const blob = await loadRemoteAudio('https://cdn.example.com/a.mp3', 'audio/mpeg');
  assert.equal(blob.type, 'audio/mpeg');
  assert.equal(blob.size, 3);
  await loadRemoteAudio('https://cdn.example.com/a.mp3', 'audio/mpeg');
  assert.deepEqual(calls, [['safe_fetch_audio', { url: 'https://cdn.example.com/a.mp3' }]]);
});

test('loadRemoteAudio passes the Rust refusal text through and caches nothing on failure', async () => {
  let n = 0;
  g.__TAURI_INTERNALS__ = { invoke: async () => { n++; throw 'That address did not return audio.'; } };
  await assert.rejects(loadRemoteAudio('https://cdn.example.com/page'), /did not return audio/);
  await assert.rejects(loadRemoteAudio('https://cdn.example.com/page'), /did not return audio/);
  assert.equal(n, 2);
});

test('the desktop download refusal of a page reads like the browser one', () => {
  assert.equal(describeStreamError(new Error('That address did not return audio.')), NOT_AUDIO_MESSAGE);
  assert.match(describeStreamError(new Error('The server answered 404 Not Found.')), /^Could not play that link: The server answered 404/);
});
