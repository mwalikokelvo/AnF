// Bundle and run the challenger test harness using esbuild and node --test
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rm } from 'node:fs/promises';

const dir = fileURLToPath(new URL('.', import.meta.url));
const windowsDir = path.resolve(dir, '../../../windows');
const require = createRequire(path.join(windowsDir, 'package.json'));
const { build } = require('esbuild');

const entry = path.join(dir, 'challenge_harness.ts');
const bundlePath = path.join(dir, '.challenge_bundle.mjs');

console.log('=== Bundling Challenge Harness ===');
console.log('Entry:', entry);
console.log('Output:', bundlePath);

try {
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    packages: 'external',
    loader: { '.css': 'empty' },
    outfile: bundlePath,
  });

  console.log('=== Executing Adversarial Challenge Harness with Node --test ===');
  const res = spawnSync(process.execPath, ['--test', bundlePath], { stdio: 'inherit' });
  process.exitCode = res.status ?? (res.error ? 1 : 0);
} finally {
  await rm(bundlePath, { force: true });
}
