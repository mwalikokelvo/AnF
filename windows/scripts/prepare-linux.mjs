import {cp, mkdir, readdir, stat, chmod} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

if (process.platform !== 'linux' || process.arch !== 'x64') throw Error('Linux x64 is required.');
const root=fileURLToPath(new URL('../',import.meta.url));
const local=path.join(root,'local-ai'), extract=path.join(root,'target/offline-runtime-linux');
function run(program,args,env=process.env) {
  const result=spawnSync(program,args,{stdio:'inherit',cwd:root,env});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error(`${program} failed (${result.status})`);
}
run(process.execPath,[...process.execArgv,path.join(root,'scripts/prepare-offline.mjs')]);
await mkdir(extract,{recursive:true});
run('tar',['-xzf',path.join(local,'runtime.tar.gz'),'-C',extract]);
async function files(dir) {
  const out=[];
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...await files(file));else out.push(file);
  }
  return out;
}
const extracted=await files(extract);
for(const file of extracted.filter(f=>/^lib.*\.so(?:\..*)?$/.test(path.basename(f)) || path.basename(f)==='llama-server')) {
  await cp(file,path.join(local,path.basename(file)),{dereference:false,verbatimSymlinks:true});
}
if(await stat(path.join(local,'runtime-vulkan.tar.gz')).catch(()=>null)) {
  const vulkanExtract=path.join(root,'target/offline-runtime-vulkan-linux');
  await mkdir(vulkanExtract,{recursive:true});
  run('tar',['-xzf',path.join(local,'runtime-vulkan.tar.gz'),'-C',vulkanExtract]);
  const vulkanFiles=await files(vulkanExtract);
  for(const file of vulkanFiles.filter(f=>/^lib.*\.so(?:\..*)?$/.test(path.basename(f)))) {
    await cp(file,path.join(local,path.basename(file)),{dereference:false,verbatimSymlinks:true});
  }
}
const env={...process.env,LD_LIBRARY_PATH:local+(process.env.LD_LIBRARY_PATH?':'+process.env.LD_LIBRARY_PATH:'')};
await chmod(path.join(local,'llama-server'),0o755);
run(path.join(local,'llama-server'),['--version'],env);
