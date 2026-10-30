// Cross-version Node.js test runner using bundled esbuild
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outfile = path.join(root, 'tests/.test-bundle.mjs');

try {
  await build({
    entryPoints: [path.join(root, 'tests/lyrics-provider.test.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    packages: 'external',
    outfile,
  });

  const res = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' });
  process.exitCode = res.status ?? (res.error ? 1 : 0);
} finally {
  await rm(outfile, { force: true });
}
