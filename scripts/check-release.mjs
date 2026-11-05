import {mkdir,mkdtemp,writeFile,readFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
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
  ['windows/dev/lyrics-check.cjs','windows/src/workspace/lyrics.ts'],
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


run('scripts/check-workflows.mjs');
run('scripts/check-android-contract.mjs');
run('scripts/check-skill-pack.mjs');

run('scripts/check-listening.cjs');
run('scripts/check-mkr-player.mjs');
run('scripts/check-mkr-source.mjs');

// package-release.py must refuse to package a release when inputs are missing.
{
  const py=['python3','python'].find(c=>spawnSync(c,['--version']).status===0);
  if(!py)throw Error('check-release needs python3 to test scripts/package-release.py');
  for(const script of ['test-android-apk-check.py','test-android-entrypoints.py','check-android-release.py']){
    const apkGates=spawnSync(py,['-B',path.join(root,'scripts',script)],{stdio:'inherit'});
    if(apkGates.error)throw apkGates.error;
    if(apkGates.status!==0)process.exit(apkGates.status||1);
  }
  const tmp=await mkdtemp(path.join(tmpdir(),'anf-pkg-'));
  await mkdir(path.join(tmp,'windows/src-tauri'),{recursive:true});
  await mkdir(path.join(tmp,'windows/release'),{recursive:true});
  await writeFile(path.join(tmp,'windows/src-tauri/tauri.conf.json'),'{"version":"9.9.9"}');
  const pkg=a=>spawnSync(py,[path.join(root,'scripts/package-release.py'),'--root',tmp,...a],{encoding:'utf8'});
  const sums=path.join(tmp,'releases/anf-9.9.9/SHA256SUMS');
  const exists=f=>access(f).then(()=>true,()=>false);
  const assert=(c,m)=>{if(!c){console.error('package-release check failed: '+m);process.exit(1);}};
  let r=pkg([]);
  assert(r.status!==0,'missing artifacts must exit non-zero');
  for(const n of ['setup.exe','portable.zip','debug.apk','unsigned.apk'])assert(r.stderr.includes(n),'stderr must list '+n);
  assert(!await exists(sums),'no SHA256SUMS when artifacts are missing');
  assert(!r.stdout.includes('Successfully packaged'),'must not claim success');
  r=pkg(['--allow-partial']);
  assert(r.status!==0&&!await exists(sums),'--allow-partial with nothing must not write an empty SHA256SUMS');
  r=pkg(['--version','1.0.0']);
  assert(r.status!==0&&r.stderr.includes('does not match'),'--version mismatch must be refused');
  await writeFile(path.join(tmp,'windows/release/AnF-Windows-9.9.9-setup.exe'),'x');
  r=pkg(['--allow-partial']);
  assert(r.status===0&&r.stdout.includes('NOT fully verified')&&!r.stdout.includes('Successfully packaged'),'partial run must be labelled unverified');
  assert((await readFile(sums,'utf8')).includes('AnF-Windows-9.9.9-setup.exe'),'SHA256SUMS must list the packaged file');
}
console.log(`Passed ${checks.length+5} base release regression checks, plus the workflow, skill, listening and MKR checks above.`);
