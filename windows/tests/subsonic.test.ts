import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSubsonicSettings,
  responseBytes,
  saveSubsonicSettings,
  subsonicReady,
} from '../src/workspace/subsonic';

const data = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => void data.set(key, value),
  removeItem: (key: string) => void data.delete(key),
  clear: () => data.clear(),
  key: () => null,
  length: 0,
} as Storage;

test('subsonic settings persist trimmed values', () => {
  data.clear();
  assert.deepEqual(loadSubsonicSettings(), { server: '', username: '' });
  const saved = saveSubsonicSettings({
    server: '  https://music.example.com/  ',
    username: '  ada  ',
  });
  assert.deepEqual(saved, { server: 'https://music.example.com/', username: 'ada' });
  assert.deepEqual(loadSubsonicSettings(), saved);
  assert.equal(subsonicReady(saved), true);
});

test('subsonic readiness requires both fields', () => {
  assert.equal(subsonicReady({ server: 'https://x', username: '' }), false);
  assert.equal(subsonicReady({ server: '', username: 'ada' }), false);
  assert.equal(subsonicReady({ server: 'https://x', username: 'ada' }), true);
});

test('raw IPC responses are accepted as ArrayBuffer, Uint8Array or number arrays', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  assert.deepEqual(responseBytes(bytes.buffer), bytes);
  assert.deepEqual(responseBytes(bytes), bytes);
  assert.deepEqual(responseBytes([1, 2, 3]), bytes);
  assert.equal(responseBytes('nope'), undefined);
});
