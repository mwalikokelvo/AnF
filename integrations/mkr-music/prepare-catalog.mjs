// AnF-owned source preparation. No app/lyrics modules, credentials or native runtime.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');

export function checkManifest(manifest){
 if(manifest.schema!==1||manifest.commit!=='78ac80c5101c293a5591a4cd5a1ebc90ccbc3138'||manifest.profile!=='innertube-common'||!Array.isArray(manifest.sources)||manifest.sources.length!==105)throw Error('Unexpected MKR source profile.');
 const paths=new Set();
 for(const entry of manifest.sources){
  if(typeof entry.path!=='string'||!(entry.path==='LICENSE'||/^innertube\/src\/main\/kotlin\/(?:[A-Za-z0-9_]+\/)*[A-Za-z0-9_]+\.kt$/.test(entry.path))||entry.path.includes('..')||paths.has(entry.path))throw Error('Unexpected or duplicate MKR source path.');
  if(!/^[a-f0-9]{64}$/.test(entry.sha256)||!Number.isSafeInteger(entry.bytes)||entry.bytes<1||entry.bytes>1024*1024)throw Error('Invalid MKR source digest/size.');
  paths.add(entry.path);
 }
 if(!paths.has('LICENSE'))throw Error('MKR upstream license is required.');
}

export function checkSource(entry,bytes){
 if(bytes.length!==entry.bytes||sha256(bytes)!==entry.sha256)throw Error('MKR pinned source mismatch: '+entry.path);
 if(entry.path==='LICENSE')return; // Keep the original restriction and GPL text, verbatim.
 const text=bytes.toString('utf8');
 if(/musixmatch|BuildConfig\.(?:.*KEY|.*SECRET)|(?:apiKey|clientSecret|accessToken|refreshToken|cookie)\s*=\s*"[^"\r\n]+"/i.test(text))throw Error('Restricted/credential-bearing MKR source rejected: '+entry.path);
 if(/^import\s+(?:android\.|androidx\.)/m.test(text))throw Error('The shared MKR catalog profile must be platform-neutral: '+entry.path);
}

function productFiles(dir,prefix=''){
 const files=[];
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const name=prefix+entry.name,absolute=path.join(dir,entry.name);
  if(entry.isSymbolicLink())throw Error('Linked MKR prepared input rejected.');
  if(entry.isDirectory())files.push(...productFiles(absolute,name+'/'));
  else if(entry.isFile())files.push(name);
  else throw Error('Unexpected MKR prepared input type.');
 }
 return files.sort();
}

export function verifyPrepared(directory,manifest){
 checkManifest(manifest);
 const root=fs.lstatSync(directory);
 if(root.isSymbolicLink()||!root.isDirectory())throw Error('Linked/non-directory MKR prepared root rejected.');
 const expected=[...manifest.sources.map(e=>e.path),'source-manifest.json'].sort();
 if(JSON.stringify(productFiles(directory))!==JSON.stringify(expected))throw Error('MKR prepared inputs changed; preserve them and choose a clean generated directory.');
 const saved=JSON.parse(fs.readFileSync(path.join(directory,'source-manifest.json'),'utf8'));
 if(JSON.stringify(saved)!==JSON.stringify(manifest))throw Error('MKR prepared source manifest changed.');
 for(const entry of manifest.sources)checkSource(entry,fs.readFileSync(path.join(directory,entry.path)));
}

export function prepareCatalog(source,directory=path.join(here,'engine/vendor/mkr')){
 const manifest=JSON.parse(fs.readFileSync(path.join(here,'catalog-source.json'),'utf8'));
 checkManifest(manifest);
 if(fs.existsSync(directory)){verifyPrepared(directory,manifest);return directory;}
 if(!source)throw Error('Pass --source with a checkout containing the pinned MKR revision. No external player is a fallback.');
 const blobs=manifest.sources.map(entry=>{
  const result=spawnSync('git',['-C',path.resolve(source),'show',manifest.commit+':'+entry.path],{maxBuffer:2*1024*1024});
  if(result.error||result.status!==0)throw Error('Pinned MKR source object unavailable: '+entry.path);
  const bytes=result.stdout;checkSource(entry,bytes);return[entry,bytes];
 });
 // Validate every blob before any source is written. Never replace a changed tree.
 if(fs.existsSync(path.dirname(directory))&&fs.lstatSync(path.dirname(directory)).isSymbolicLink())throw Error('Linked MKR prepared parent rejected.');
 fs.mkdirSync(path.dirname(directory),{recursive:true});
 fs.mkdirSync(directory); // Exclusive creation: a concurrent preparer must not overwrite it.
 for(const [entry,bytes] of blobs){const target=path.join(directory,entry.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});}
 fs.writeFileSync(path.join(directory,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 verifyPrepared(directory,manifest);
 return directory;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2);
 if(args.length!==0&&(args.length!==2||args[0]!=='--source'))throw Error('Use prepare-catalog.mjs --source <pinned upstream checkout>.');
 const directory=prepareCatalog(args[1]);
 console.log('Verified MKR catalog sources only: '+directory+'. No native player or AnF capability is enabled.');
}
