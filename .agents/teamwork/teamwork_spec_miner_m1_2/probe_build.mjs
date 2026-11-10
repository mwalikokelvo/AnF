// Probe script for lyrics.ts and lyrics-provider.ts
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire('C:/Users/mwali/.gemini/antigravity/scratch/AnF/windows/package.json');
const { build } = require('esbuild');

const root = path.resolve('C:/Users/mwali/.gemini/antigravity/scratch/AnF/windows');

await build({
  entryPoints: [
    path.join(root, 'src/workspace/lyrics.ts'),
    path.join(root, 'src/workspace/lyrics-provider.ts')
  ],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  outdir: path.resolve('C:/Users/mwali/.gemini/antigravity/scratch/AnF/.agents/teamwork/teamwork_spec_miner_m1_2/dist'),
});

console.log('Build succeeded.');
