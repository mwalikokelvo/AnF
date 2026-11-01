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
  assert.ok(!csp.includes('localhost:'), 'OCR must use the explicit 127.0.0.1 loopback');
});

test('CSP keeps the main-branch baseline and enumerates network hosts', () => {
  assert.deepEqual(directive('script-src'), ["'self'"]);
  for (const name of ['img-src', 'media-src', 'connect-src']) {
    assert.ok(directive(name).includes("'self'"), name);
  }
  assert.ok(directive('connect-src').includes('ipc:') && directive('connect-src').includes('http://ipc.localhost'));
  for (const src of directive('connect-src').filter(s => /^https?:/.test(s) && !s.startsWith('http://ipc.'))) {
    assert.ok(/^(https:\/\/[a-z0-9*.-]+|http:\/\/127\.0\.0\.1:(8000|3900))$/.test(src), src);
  }
  assert.ok(directive('connect-src').includes('https://lrclib.net'));
});
