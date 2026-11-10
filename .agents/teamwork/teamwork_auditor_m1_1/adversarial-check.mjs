import { build } from 'file:///C:/Users/mwali/.gemini/antigravity/scratch/AnF/windows/node_modules/esbuild/lib/main.js';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const windowsDir = 'C:/Users/mwali/.gemini/antigravity/scratch/AnF/windows';
const outfile = 'C:/Users/mwali/.gemini/antigravity/scratch/AnF/.agents/teamwork/teamwork_auditor_m1_1/bundled-test.mjs';

const testCode = `
import assert from 'node:assert/strict';
import { previousTrack, playPreviousTrack, playNextTrack, enqueueTrack, reconcileQueue } from '../shared/audio/queue.ts';
import { cleanTitle, primaryArtist } from './src/workspace/lyrics-provider.ts';
import { parseDuration } from './src/workspace/podcast-feeds.ts';

// 1. Single-element queue previousTrack
assert.equal(previousTrack(['t1'], 't1', 'off'), undefined);
assert.equal(previousTrack(['t1'], 't1', 'track'), 't1');
assert.equal(previousTrack(['t1'], 't1', 'all'), 't1');
assert.equal(previousTrack([], 't1', 'all'), undefined);
assert.equal(previousTrack(['t1', 't2'], 't99', 'off'), 't1');

// 2. playPreviousTrack
assert.deepEqual(playPreviousTrack(['a', 'b'], 'a', 'x'), ['x', 'a', 'b']);
assert.deepEqual(playPreviousTrack(['a', 'b'], undefined, 'x'), ['x', 'a', 'b']);
assert.deepEqual(playPreviousTrack(['a', 'b', 'x'], 'b', 'x'), ['a', 'x', 'b']);

// 3. cleanTitle
assert.equal(cleanTitle('Song (Official 4k Video) [Extended Remix]'), 'Song');
assert.equal(cleanTitle('Song - official live visualizer'), 'Song');
assert.equal(cleanTitle('   '), '');

// 4. primaryArtist
assert.equal(primaryArtist('Adele'), 'Adele');
assert.equal(primaryArtist('Marshmello feat. Bastille'), 'Marshmello');
assert.equal(primaryArtist('Kendrick Lamar, SZA'), 'Kendrick Lamar');
assert.equal(primaryArtist('Drake / 21 Savage'), 'Drake');
assert.equal(primaryArtist('Artist A; Artist B'), 'Artist A');
console.log('Of Monsters and Men ->', primaryArtist('Of Monsters and Men'));

// 5. parseDuration
assert.equal(parseDuration('01:23:45'), 1*3600 + 23*60 + 45);
assert.equal(parseDuration('-100'), undefined);
assert.equal(parseDuration('foo:bar'), undefined);
assert.equal(parseDuration('99.9'), 100);
assert.equal(parseDuration(null), undefined);
assert.equal(parseDuration(undefined), undefined);

console.log('ALL ADVERSARIAL CHECKS PASSED EMPIRICALLY!');
`;

await build({
  stdin: { contents: testCode, resolveDir: windowsDir, loader: 'ts' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  loader: { '.css': 'empty' },
  outfile,
});

await import(pathToFileURL(outfile).href);
