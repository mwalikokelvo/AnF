import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKoreaderProgressBody, saveKoreaderSettings } from '../src/workspace/koreader-bridge.ts';

test('parseKoreaderProgressBody accepts kosync JSON and ignores garbage', () => {
  assert.deepEqual(parseKoreaderProgressBody(''), {});
  assert.deepEqual(parseKoreaderProgressBody('{'), {});
  assert.deepEqual(parseKoreaderProgressBody(JSON.stringify({
    document: '594d29c7',
    progress: 'anf:4',
    percentage: 0.36,
    device: 'AnF',
    device_id: 'device-1',
    timestamp: 1,
  })), {
    document: '594d29c7',
    progress: 'anf:4',
    percentage: 0.36,
    device: 'AnF',
    device_id: 'device-1',
    timestamp: 1,
  });
});

test('saveKoreaderSettings round-trips through localStorage keys', () => {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
  try {
    store.set('anf-koreader-device-id', 'fixed-id');
    const saved = saveKoreaderSettings({
      enabled: true,
      serverUrl: 'https://sync.example.test/',
      username: 'ada',
      deviceName: 'Desk',
    });
    assert.equal(saved.enabled, true);
    assert.equal(store.get('anf-koreader-sync-enabled'), '1');
    assert.equal(store.get('anf-koreader-server-url'), 'https://sync.example.test/');
    assert.equal(store.get('anf-koreader-username'), 'ada');
    assert.equal(store.get('anf-koreader-device-name'), 'Desk');
    assert.equal(saved.deviceId, 'fixed-id');
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: previous, configurable: true });
  }
});
