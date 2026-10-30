// Prepare and bundle MKR Music modules for AnF.
import {spawnSync} from 'node:child_process';
import {cp,mkdir,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = process.env.MKR_MUSIC_SOURCE || path.join(root, '../mkr-music');
const target = path.join(root, 'android/mkr-music');

console.log('--- Preparing MKR Music Integration for AnF ---');

try {
  await access(path.join(source, '.git'));
  console.log(`Found MKR Music source at: ${source}`);
} catch {
  console.log('Cloning MKR Music upstream repository...');
  await mkdir(path.dirname(source), { recursive: true });
  spawnSync('git', ['clone', 'https://github.com/mkr-infinity/mkr-music.git', source], { stdio: 'inherit' });
}

// Copy reusable Kotlin multiplatform / Android modules
const modules = ['innertube', 'lyricsProvider', 'spotify', 'shazamkit', 'lastfm'];
await mkdir(target, { recursive: true });

for (const mod of modules) {
  const modSrc = path.join(source, mod);
  const modDst = path.join(target, mod);
  try {
    await access(modSrc);
    await cp(modSrc, modDst, { recursive: true });
    console.log(`✓ Synchronized module :${mod}`);
  } catch (err) {
    console.warn(`! Module ${mod} not found or skipped:`, err.message);
  }
}

console.log('MKR Music integration modules prepared successfully.');
