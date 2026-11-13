// AnF-owned engineering preparation, not a release/publish command. Fresh build
// inputs only; never read an installed AnF runtime or user library as trust.
import {createHash,randomBytes} from 'node:crypto';
import {createReadStream,constants} from 'node:fs';
import {readFile,writeFile,mkdir,copyFile,lstat,readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {checkJdkSourceBinding} from './jdk-source-binding.mjs';
import {fileURLToPath} from 'node:url';

const base=fileURLToPath(new URL('./',import.meta.url));
if(process.argv.slice(2).some(arg=>arg!=='--check-inputs'))throw Error('Unsupported preparation option.');
const report=JSON.parse(await readFile(path.join(base,'engine/build/reports/runtime-dependencies.json'),'utf8'));
if(report.schema!==1||report.readyForPublication!==false||report.sourceCompleteDistributionPrepared!==false||!Array.isArray(report.dependencies)||report.dependencies.length>256)throw Error('Invalid engineering audit.');
async function hash(file){
  const meta=await lstat(file);
  if(!meta.isFile()||meta.isSymbolicLink()||meta.size>536_870_912)throw Error('Unsupported runtime input.');
  const digest=createHash('sha256');let bytes=0;
  for await(const chunk of createReadStream(file)){bytes+=chunk.length;if(bytes>536_870_912)throw Error('Runtime input exceeds its bound.');digest.update(chunk);}
  return digest.digest('hex');
}
async function verifyInput(input){
  if(!/^[a-f0-9]{64}$/.test(input.sha256)||!input.file?.endsWith('.jar')||await hash(input.file)!==input.sha256)throw Error('Build dependency changed since audit.');
}
async function verifiedCopy(input,destination){
  await verifyInput(input);
  await copyFile(input.file,destination,constants.COPYFILE_EXCL);
  if(await hash(destination)!==input.sha256)throw Error('Copied runtime dependency mismatch.');
}
const jdk=path.resolve(report.jdkHome);
const release=await readFile(path.join(jdk,'release'),'utf8');
if(!/^JAVA_VERSION="21\./m.test(release)||!/^OS_NAME="Windows"/m.test(release)||!/^OS_ARCH="x86_64"/m.test(release))throw Error('Expected the audited Windows x64 JDK21 toolchain.');
const jlink=path.join(jdk,'bin/jlink.exe');
const sourceRecord=JSON.parse(await readFile(path.join(base,'native-source-evidence.json'),'utf8')).jdkSource;
const sourceBinding=checkJdkSourceBinding(await readFile(path.join(jdk,'release')),await hash(path.join(jdk,'lib/src.zip')),sourceRecord);
const provenance={jdkReleaseSha256:await hash(path.join(jdk,'release')),jlinkSha256:await hash(jlink),javaSha256:await hash(path.join(jdk,'bin/java.exe')),...sourceBinding};
// Complete preflight before creating any candidate directory or invoking tools.
await verifyInput(report.engine);
for(const [index,dependency] of report.dependencies.entries()){
  if(!/^[A-Za-z0-9._-]+\.jar$/.test(String(index).padStart(3,'0')+'-'+path.basename(dependency.file)))throw Error('Unsupported dependency filename.');
  await verifyInput(dependency);
}
if(process.argv.includes('--check-inputs')){
  console.log('PASS: audited engine, '+report.dependencies.length+' dependency hashes and Windows JDK inputs. No candidate files created.');
  process.exit(0);
}
const candidates=path.join(base,'engine/build/runtime-candidates');await mkdir(candidates,{recursive:true});
const candidate=path.join(candidates,'runtime-'+Date.now()+'-'+randomBytes(4).toString('hex'));
await mkdir(candidate);const bundle=path.join(candidate,'bundle');await mkdir(bundle);await mkdir(path.join(bundle,'lib'));
// The manifest lives OUTSIDE its inventoried bundle, avoiding a self-hashing
// manifest and retaining a separate reviewed source pin for production.
const modules=['java.base','java.desktop','java.logging','java.management','java.naming','java.net.http','java.security.sasl','java.sql','java.xml','jdk.charsets','jdk.crypto.ec','jdk.httpserver','jdk.unsupported','jdk.zipfs'];
const runtime=path.join(bundle,'runtime');
await new Promise((resolve,reject)=>{
  const child=spawn(jlink,['--module-path',path.join(jdk,'jmods'),'--add-modules',modules.join(','),'--strip-debug','--no-header-files','--no-man-pages','--compress=zip-6','--output',runtime],{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
  let output='';
  const append=chunk=>{output+=chunk.toString();if(output.length>65_536){child.kill();reject(Error('Runtime tool output exceeded its bound.'));}};
  child.stdout.on('data',append);child.stderr.on('data',append);child.on('error',()=>reject(Error('Could not start the audited runtime tool.')));
  const timeout=setTimeout(()=>{child.kill();reject(Error('Runtime preparation timed out.'));},180_000);
  child.on('close',code=>{clearTimeout(timeout);if(code===0)resolve();else reject(Error('Audited runtime image creation failed.'));});
});
await verifiedCopy(report.engine,path.join(bundle,'lib/anf-mkr-catalog.jar'));
const classpath=['lib/anf-mkr-catalog.jar'];
for(const [index,dependency] of report.dependencies.entries()){
  const name=String(index).padStart(3,'0')+'-'+path.basename(dependency.file);
  if(!/^[A-Za-z0-9._-]+\.jar$/.test(name))throw Error('Unsupported dependency filename.');
  const relative='lib/'+name;await verifiedCopy(dependency,path.join(bundle,relative));classpath.push(relative);
}
const files={};let bytes=0,nodes=0;
async function inventory(directory,depth=0){
  if(depth>16)throw Error('Runtime tree exceeds its depth bound.');
  for(const entry of (await readdir(directory)).sort()){
    if(++nodes>8192)throw Error('Runtime tree exceeds its node bound.');
    const file=path.join(directory,entry),meta=await lstat(file);
    if(meta.isSymbolicLink())throw Error('Runtime image contains a link; preserve and review it before further preparation.');
    if(meta.isDirectory()){await inventory(file,depth+1);continue;}
    const relative=path.relative(bundle,file).split(path.sep).join('/');
    if(!/^[A-Za-z0-9._/-]+$/.test(relative)||Object.keys(files).length>=4096)throw Error('Unsupported runtime inventory path or count.');
    bytes+=meta.size;if(bytes>1_073_741_824)throw Error('Runtime image exceeds its byte bound.');
    files[relative]=await hash(file);
  }
}
await inventory(bundle);
await writeFile(path.join(candidate,'runtime-manifest.json'),JSON.stringify({schema:1,java:'runtime/bin/java.exe',classpath,files},null,2)+'\n',{flag:'wx'});
await writeFile(path.join(candidate,'dependency-audit.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
await writeFile(path.join(candidate,'candidate-status.json'),JSON.stringify({schema:1,engineeringOnly:true,readyForPublication:false,sourceCompleteDistributionPrepared:false,modules,provenance,files:Object.keys(files).length,bytes,required:['dependency license and corresponding-source review','reviewed source manifest pin','native packaged-runtime acceptance','AnF controls and audio handoff','Android host and release identity gates']},null,2)+'\n',{flag:'wx'});
// A pointer to an internal engineering build, never a public release URL.
await writeFile(path.join(base,'engine/build/reports/latest-runtime-candidate.json'),JSON.stringify({candidate,manifest:path.join(candidate,'runtime-manifest.json'),bundle,readyForPublication:false})+'\n');
console.log('Prepared fresh engineering runtime candidate: '+Object.keys(files).length+' inventoried files, '+bytes+' bytes. Publication/source review remains pending.');
