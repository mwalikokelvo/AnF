// End-to-End Test Suite Runner across Tiers 1-4
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const e2eDir = path.join(root, 'tests/e2e');
const outfile = path.join(root, 'tests/.e2e-bundle.mjs');

try {
  const dirFiles = await readdir(e2eDir);
  const testFiles = dirFiles
    .filter(f => f.endsWith('.test.ts'))
    .sort()
    .map(f => path.join(e2eDir, f));

  console.log(`\n========================================`);
  console.log(`Bundling ${testFiles.length} E2E Test Suites:`);
  testFiles.forEach(f => console.log(` - ${path.basename(f)}`));
  console.log(`========================================\n`);

  const entryCode = testFiles.map(f => `import ${JSON.stringify(f.replace(/\\/g, '/'))};`).join('\n');

  await build({
    stdin: {
      contents: entryCode,
      resolveDir: e2eDir,
      sourcefile: 'all-e2e-tests.js',
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
