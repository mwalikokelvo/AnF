import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const conf = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const csp: string = conf.app.security.csp;
const directive = (name: string) => (csp.split(';').map(d => d.trim().split(/\s+/)).find(d => d[0] === name) ?? []).slice(1);

test('CSP has no scheme-wide or wildcard sources', () => {
  for (const part of csp.split(/[\s;]+/)) {
    assert.ok(!['https:', 'http:', '*', 'ws:', 'wss:'].includes(part), `bare source ${part}`);
  }
  const hosts = csp.split(/[\s;]+/).filter(t => /^https?:\/\//.test(t)).map(t => new URL(t.replace('*.', 'wild.')).hostname);
  assert.ok(!hosts.includes('localhost'), 'no localhost source');
});

test('CSP has no loopback connect-src: OCR goes through the Rust ocr_request command', () => {
  for (const key of ['csp', 'devCsp']) {
    const text: string = conf.app.security[key];
    assert.ok(!/127\.0\.0\.1|localhost:(8000|3900)|\[::1\]/.test(text), `${key} must not allow OCR loopback ports`);
    for (const part of text.split(/[\s;]+/)) assert.ok(!['https:', 'http:', '*', 'wss:'].includes(part), `${key} bare source ${part}`);
  }
});

test('CSP keeps the main-branch baseline and enumerates network hosts', () => {
  assert.deepEqual(directive('script-src'), ["'self'"]);
  for (const name of ['img-src', 'media-src', 'connect-src']) {
    assert.ok(directive(name).includes("'self'"), name);
  }
  const connect = new Set(directive('connect-src'));
  assert.ok(connect.has('ipc:') && connect.has('http://ipc.localhost'));
  const allowed = new Set(['http://ipc.localhost']);
  for (const src of connect) {
    if (!/^https?:\/\//.test(src) || allowed.has(src)) continue;
    const u = new URL(src.replace('*.', 'wild.'));
    assert.equal(u.protocol, 'https:', src);
    assert.equal(u.pathname, '/', src);
    assert.equal(`${u.protocol}//${src.slice(8)}`, src);
  }
  assert.ok(connect.has('https://lrclib.net'));
});
