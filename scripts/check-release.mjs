import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(path.join(root,'windows/package.json'));
const {build}=require('esbuild');
const out=path.join(root,'windows/target/release-checks');
await mkdir(out,{recursive:true});
const checks=[
  ['windows/dev/reader-check.cjs','windows/src/workspace/reader-data.ts'],
  ['windows/dev/library-check.cjs','windows/src/workspace/library-data.ts'],
  ['windows/dev/dashboard-check.cjs','windows/src/workspace/dashboard-data.ts'],
  ['windows/dev/knowledge-check.cjs','windows/src/workspace/knowledge-data.ts'],
  ['android/project-data-check.cjs','android/web/project-data.ts'],
  ['android/sync-check.cjs','android/web/sync.ts'],
  ['android/storage-check.cjs','android/web/storage.ts'],
  ['android/native-media-check.cjs','android/web/native-media.ts'],
];
function run(script,args=[]) {
  const result=spawnSync(process.execPath,[path.join(root,script),...args],{cwd:path.dirname(path.join(root,script)),stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
// This check reads paths relative to windows/, rather than its dev/ folder.
const timing=spawnSync(process.execPath,['dev/timing-check.cjs'],{cwd:path.join(root,'windows'),stdio:'inherit'});
if(timing.error)throw timing.error;if(timing.status!==0)process.exit(timing.status||1);
for(let i=0;i<checks.length;i++) {
  const [script,source]=checks[i],bundle=path.join(out,`${i}.cjs`);
  await build({entryPoints:[path.join(root,source)],bundle:true,platform:'node',format:'cjs',outfile:bundle});
  run(script,[bundle]);
}
console.log('Passed 9 existing release regression checks.');
