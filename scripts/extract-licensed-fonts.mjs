// Local-only companion to lucaschultz/adobe-font-extractor. No font downloads.
import {readdir,lstat,realpath,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
export function fontMagic(b){return b.length>=12&&b.length<=10*1024*1024&&(b.subarray(0,4).equals(Buffer.from([0,1,0,0]))||['OTTO','wOFF','wOF2'].includes(b.subarray(0,4).toString('ascii')));}
export async function extract(source,destination){
 const root=await realpath(source);let dest=path.resolve(destination);
 for(let p=dest;;p=path.dirname(p)){try{if((await lstat(p)).isSymbolicLink())throw Error('Destination may not traverse symbolic links.');}catch(e){if(e.code!=='ENOENT')throw e;}if(path.dirname(p)===p)break;}
 if(dest===root||dest.startsWith(root+path.sep)||root.startsWith(dest+path.sep))throw Error('Destination must be separate from the source cache.');
 await mkdir(dest,{recursive:true});dest=await realpath(dest);if(dest===root||dest.startsWith(root+path.sep)||root.startsWith(dest+path.sep))throw Error('Destination must be separate from the source cache.');let scanned=0;const copied=[];
 async function visit(dir,depth){if(depth>12)throw Error('Cache nesting exceeds limit.');for(const entry of await readdir(dir,{withFileTypes:true})){
  if(++scanned>50000)throw Error('Cache entry limit exceeded.');const p=path.join(dir,entry.name),s=await lstat(p);if(s.isSymbolicLink())continue;
  if(s.isDirectory()){await visit(p,depth+1);continue;}if(!s.isFile()||s.size>10*1024*1024||s.size<12)continue;
  // Adobe cache filenames need not carry font extensions. Validate actual bytes.
  if(!(await realpath(p)).startsWith(root+path.sep))throw Error('Cache file escaped source.');
  const b=await readFile(p);if(!fontMagic(b))continue;if(copied.length>=200)throw Error('Extraction limit is 200 fonts.');
  const hash=createHash('sha256').update(b).digest('hex'),ext=b.subarray(0,4).toString()==='OTTO'?'.otf':b.subarray(0,4).toString()==='wOFF'?'.woff':b.subarray(0,4).toString()==='wOF2'?'.woff2':'.ttf';
  await writeFile(path.join(dest,hash+ext),b,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});copied.push({file:hash+ext,sha256:hash,bytes:b.length});
 }}await visit(root,0);await writeFile(path.join(dest,'font-manifest.json'),JSON.stringify({license:'User must hold an appropriate font license; extraction grants no redistribution rights.',fonts:copied},null,2),{flag:'wx'});return copied;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length!==3||args[0]!=='--licensed'){console.error('Usage: node scripts/extract-licensed-fonts.mjs --licensed SOURCE_CACHE DESTINATION\nRun only for local fonts you are licensed to use.');process.exitCode=1;}else console.log(`Extracted ${(await extract(args[1],args[2])).length} local fonts.`);
}
