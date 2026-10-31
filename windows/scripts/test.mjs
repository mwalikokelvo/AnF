// Cross-version Node.js test runner using bundled esbuild
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outfile = path.join(root, 'tests/.test-bundle.mjs');

try {
  const testsDir = path.join(root, 'tests');
  const dirFiles = await readdir(testsDir);
  const testFiles = dirFiles
    .filter(f => f.endsWith('.test.ts'))
    .map(f => path.join(testsDir, f));

  const entryCode = testFiles.map(f => `import ${JSON.stringify(f.replace(/\\/g, '/'))};`).join('\n');

  await build({
    stdin: {
      contents: entryCode,
      resolveDir: testsDir,
      sourcefile: 'all-tests.js',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    packages: 'external',
    loader: { '.css': 'empty' },
    outfile,
  });

  const res = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' });
  process.exitCode = res.status ?? (res.error ? 1 : 0);
} finally {
  await rm(outfile, { force: true });
}
