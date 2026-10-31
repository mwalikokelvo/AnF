// Cross-version Node.js test runner using bundled esbuild
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const testsDir = path.join(root, 'tests');
const dirFiles = await readdir(testsDir);
const testFiles = dirFiles.filter(f => f.endsWith('.test.ts'));
const outFiles = [];

try {
  await build({
    entryPoints: testFiles.map(f => path.join(testsDir, f)),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    packages: 'external',
    loader: { '.css': 'empty' },
    outdir: testsDir,
    entryNames: '.[name]',
    outExtension: { '.js': '.mjs' },
  });

  const mjsFiles = testFiles.map(f => path.join(testsDir, `.${f.replace(/\.ts$/, '.mjs')}`));
  outFiles.push(...mjsFiles);

  const res = spawnSync(process.execPath, ['--test', ...mjsFiles], { stdio: 'inherit' });
  process.exitCode = res.status ?? (res.error ? 1 : 0);
} finally {
  for (const f of outFiles) {
    await rm(f, { force: true });
  }
}
