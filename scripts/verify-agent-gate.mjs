import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const argument of process.argv.slice(2))if(!['--release','--offline'].includes(argument))throw Error('Unknown gate option: '+argument);
if(process.argv.includes('--offline')&&!process.argv.includes('--release'))throw Error('--offline applies to the mandatory Android release build; include --release.');
function run(args){const r=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);}
for(const name of ['PROTOCOL.md','HANDOFF.md','DECISIONS.md']){const text=readFileSync(path.join(root,name),'utf8');if(text.trim().length<100)throw Error(name+' is incomplete.');}
const handoff=readFileSync(path.join(root,'HANDOFF.md'),'utf8');for(const section of ['Completed Tasks','Active In-Flight Work','Known Blockers','Next Step'])if(!handoff.includes(section))throw Error('Missing handoff section: '+section);
run(['scripts/check-agent-infrastructure.mjs']);
run(['windows/node_modules/typescript/bin/tsc','--noEmit','-p','windows/tsconfig.json']);
run(['scripts/check-branding.mjs']);
run(['scripts/check-identity-migration.mjs']);
run(['scripts/check-release.mjs']);
run(['scripts/check-version-bump.mjs']);
if(process.argv.includes('--release')){
 const args=['scripts/build-android.mjs'];if(process.argv.includes('--offline'))args.push('--offline');
 run(args);
 if(!existsSync(path.join(root,'scripts/verify-android-release.mjs')))throw Error('Android artifact verifier is required for releases.');
 run(['scripts/verify-android-release.mjs']);
 console.log('PASS: release gate includes an actual current Android package.');
}else console.log('PASS: agent source gate. This is not a release gate; use --release for mandatory Android build verification.');
