#!/usr/bin/env node
/**
 * Phase 3 contract checks (no SQLCipher required).
 * Run from repo root: node scripts/verify-contracts.mjs
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const project = JSON.parse(readFileSync(join(root, 'contracts/fixtures/project-v1.json'), 'utf8'));
const snapshot = JSON.parse(readFileSync(join(root, 'contracts/fixtures/sync-snapshot-v1.json'), 'utf8'));

const bytes = (s) => Buffer.byteLength(String(s), 'utf8');
const isHex64 = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function validateProject(p, label) {
  assert(isHex64(p.id), `${label}: id must be 64 hex`);
  assert(typeof p.name === 'string' && p.name.length <= 160, `${label}: name`);
  assert(typeof p.title === 'string' && p.title.length <= 300, `${label}: title`);
  assert(bytes(p.question) <= 10000, `${label}: question bytes`);
  assert(bytes(p.draft) <= 200000, `${label}: draft bytes`);
  assert(Array.isArray(p.history) && p.history.length <= 1000, `${label}: history`);
  for (const t of p.history) {
    assert(t && typeof t.role === 'string' && t.role, `${label}: turn role`);
    assert(Array.isArray(t.content) && t.content[0] && bytes(t.content[0].text) <= 200000, `${label}: turn text`);
  }
  assert(Array.isArray(p.sources), `${label}: sources`);
  for (const s of p.sources) {
    assert(typeof s.name === 'string', `${label}: source name`);
    assert(bytes(s.text) <= 2000000, `${label}: source text`);
  }
}

function clean(p, documents) {
  const q = structuredClone(p);
  if (!documents) q.sources = [];
  else for (const s of q.sources || []) s.path = null;
  return q;
}

function keys(obj) {
  if (Array.isArray(obj)) return obj.map(keys);
  if (obj && typeof obj === 'object') {
    return Object.keys(obj)
      .sort()
      .reduce((a, k) => {
        a[k] = keys(obj[k]);
        return a;
      }, {});
  }
  return obj;
}

function fixtureRevision(p, documents) {
  return createHash('sha256').update(JSON.stringify(keys(clean(p, documents)))).digest('hex');
}

validateProject(project, 'project-v1');
validateProject(snapshot.project, 'sync-snapshot project');
assert(isHex64(snapshot.revision), 'snapshot.revision must be 64 hex');
assert(
  snapshot.project.sources.every((s) => s.path === null),
  'wire paths must be null',
);

const expected = fixtureRevision(project, true);
assert(
  snapshot.revision === expected,
  `fixture revision mismatch: ${snapshot.revision} vs ${expected}`,
);

const round = JSON.parse(JSON.stringify(clean(project, true)));
validateProject(round, 'round-trip');
assert(fixtureRevision(round, true) === expected, 'round-trip revision stable');

console.log('verify-contracts: ok');
console.log('  project id', project.id.slice(0, 8) + '…');
console.log('  revision  ', expected.slice(0, 16) + '…');
