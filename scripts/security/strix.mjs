// Explicit security gate. --check never runs a scan; --run scans a source-only copy.
import {spawnSync} from 'node:child_process';
import {mkdir,readdir,lstat,readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const mode=process.argv[2];
if(!['--check','--run'].includes(mode)){console.error('Usage: node scripts/security/strix.mjs --check | --run');process.exit(2);}
const strix=spawnSync('strix',['--version'],{encoding:'utf8',timeout:15000,windowsHide:true});
const docker=spawnSync('docker',['info','--format','{{.ServerVersion}}'],{encoding:'utf8',timeout:15000,windowsHide:true});
const ready=!strix.error&&strix.status===0&&!docker.error&&docker.status===0;
console.log(JSON.stringify({strix:!strix.error&&strix.status===0,dockerRunning:!docker.error&&docker.status===0,modelSelected:!!process.env.STRIX_LLM,apiKeyInEnvironment:!!process.env.LLM_API_KEY,scanStarted:false}));
if(!ready){console.error('Security scan pending: install the reviewed Strix CLI and start Docker. Configure LLM access in Strix before running. No scan was performed.');process.exit(2);}
if(mode==='--check'){console.log('CLI/Docker preflight complete. Model access and an actual scan remain unverified.');process.exit(0);}
const root=fileURLToPath(new URL('../../',import.meta.url));
const review=path.join(root,'windows/target','security-review-'+randomUUID()),source=path.join(review,'source');
await mkdir(source,{recursive:true});
const roots=['windows/src','windows/src-tauri/src','windows/src-tauri/capabilities','android/web','android/java','android/spotube-host','integrations/spotube'];
const standalone=['windows/Cargo.toml','windows/Cargo.lock','windows/src-tauri/Cargo.toml','windows/src-tauri/tauri.conf.json','windows/package.json','windows/package-lock.json'];
const extensions=new Set(['.ts','.rs','.java','.mjs','.dart','.cpp','.h','.css','.html','.json','.toml','.md']);
const manifest=[];
async function copy(relative){
 const from=path.join(root,relative),info=await lstat(from);
 if(info.isSymbolicLink())throw Error('Refusing symbolic link in security input: '+relative);
 if(info.isDirectory()){for(const entry of await readdir(from))await copy(path.join(relative,entry));return;}
 if(!info.isFile()||!extensions.has(path.extname(relative))&&!standalone.includes(relative))return;
 if(info.size>10_000_000)throw Error('Unexpected large source file: '+relative);
 const to=path.join(source,relative);await mkdir(path.dirname(to),{recursive:true});await copyFile(from,to);
 manifest.push({file:relative.replaceAll('\\','/'),sha256:createHash('sha256').update(await readFile(from)).digest('hex')});
}
for(const entry of [...roots,...standalone])await copy(entry);
await writeFile(path.join(review,'source-manifest.json'),JSON.stringify({date:new Date().toISOString(),files:manifest},null,2));
const instruction='Assess only this allowlisted AnF source copy and disposable local fixtures you create. Do not contact or scan third-party hosts, provider APIs, user servers or production accounts mentioned in source. Do not read developer credential stores, profile directories, environment credentials or user files. Focus on Tauri IPC authorization, document prompt injection, secrets, URLs and redirects, import/export paths, native IPC, gateway context, webhook replay and dependency boundaries. Report evidence, scope and limitations. Do not mark native UI/audio behavior as tested by source review.';
console.log('Running Strix against source copy: '+source+'. The configured model may receive this source. Reports and input hashes remain in '+review);
const scan=spawnSync('strix',['--non-interactive','--target',source,'--instruction',instruction],{cwd:review,stdio:'inherit',windowsHide:true});
await writeFile(path.join(review,'scan-status.json'),JSON.stringify({date:new Date().toISOString(),exitCode:scan.status,error:scan.error?'Could not launch Strix':null,reviewRequired:true},null,2));
if(scan.error)throw Error('Strix could not start. The scan remains pending.');
console.log('Review the report and retest findings before recording a release decision. Exit code alone is not security approval.');
process.exit(scan.status??1);
