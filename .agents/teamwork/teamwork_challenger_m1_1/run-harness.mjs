// Runner for adversarial stress harness
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const testFile = path.join(dir, 'adversarial-harness.test.ts');
const windowsDir = 'C:/Users/mwali/.gemini/antigravity/scratch/AnF/windows';
const bundleOut = path.join(windowsDir, 'tests/.challenger-bundle.mjs');

const windowsPkg = path.join(windowsDir, 'package.json');
const require = createRequire(windowsPkg);
const { build } = require('esbuild');

console.log('Bundling adversarial harness...');
try {
  await build({
    entryPoints: [testFile],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    packages: 'external',
    loader: { '.css': 'empty' },
    outfile: bundleOut,
  });

  console.log('Executing adversarial stress tests via Node.js test runner in windows cwd...');
  const res = spawnSync(process.execPath, ['--test', bundleOut], {
    cwd: windowsDir,
    stdio: 'inherit'
  });
  process.exitCode = res.status ?? (res.error ? 1 : 0);
} finally {
  await rm(bundleOut, { force: true });
}
