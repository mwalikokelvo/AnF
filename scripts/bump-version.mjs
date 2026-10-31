// Target application identities only. Never replace version strings globally:
// a dependency may legitimately have the same version as AnF.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
export const versionFiles=['Cargo.toml','Cargo.lock','package.json','package-lock.json','src-tauri/tauri.conf.json'];
export function planVersionBump(input,next){
 if(!/^\d+\.\d+\.\d+$/.test(next))throw Error('Use a stable three-part version.');
 const pkg=JSON.parse(input['package.json']),lock=JSON.parse(input['package-lock.json']),tauri=JSON.parse(input['src-tauri/tauri.conf.json']),old=pkg.version;
 if(lock.version!==old||lock.packages?.['']?.version!==old||tauri.version!==old)throw Error('Application versions disagree; nothing written.');
 const out={...input};let workspace=false,count=0;
 out['Cargo.toml']=input['Cargo.toml'].replace(/[^\n]*\n|[^\n]+$/g,line=>{
  if(/^\s*\[/.test(line))workspace=line.trim()==='[workspace.package]';
  if(workspace&&/^version\s*=/.test(line)){
   if(!line.includes('"'+old+'"'))throw Error('Workspace version disagrees; nothing written.');
   count++;return line.replace('"'+old+'"','"'+next+'"');
  }return line;
 });if(count!==1)throw Error('Exactly one workspace version is required.');
 const found=new Set();
 out['Cargo.lock']=input['Cargo.lock'].replace(/\[\[package\]\][\s\S]*?(?=\n\[\[package\]\]|$)/g,block=>{
  const name=block.match(/^name = "([^"]+)"$/m)?.[1];if(!['anf','anf-hook'].includes(name))return block;
  if(found.has(name)||block.match(/^version = "([^"]+)"$/m)?.[1]!==old)throw Error('Own crate lock version disagrees; nothing written.');
  found.add(name);return block.replace(/^version = "[^"]+"$/m,'version = "'+next+'"');
 });if(found.size!==2)throw Error('Both application crate entries are required.');
 pkg.version=next;lock.version=next;lock.packages[''].version=next;tauri.version=next;
 for(const [name,data] of [['package.json',pkg],['package-lock.json',lock],['src-tauri/tauri.conf.json',tauri]])out[name]=JSON.stringify(data,null,2)+'\n';
 return out;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2),dry=args[0]==='--dry-run';if(dry)args.shift();if(args.length!==1)throw Error('Usage: node scripts/bump-version.mjs [--dry-run] VERSION');
 const root=fileURLToPath(new URL('../windows/',import.meta.url));
 const input=Object.fromEntries(versionFiles.map(name=>[name,readFileSync(path.join(root,name),'utf8').replace(/\r\n/g,'\n')]));
 const out=planVersionBump(input,args[0]); // Validate every file before any write.
 if(!dry)for(const name of versionFiles)writeFileSync(path.join(root,name),out[name]);
 console.log((dry?'Validated application-only version plan: ':'Updated application versions: ')+args[0]);
}
