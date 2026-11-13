// Launch only a disposable generated-media QA build for normal Windows UI testing.
// No debugger, UI input injection or changes to the user's installed AnF.
import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile,mkdir,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const evidence=path.join(path.dirname(root),'anf-pr47-evidence');
const {directory}=JSON.parse(await readFile(path.join(evidence,'latest-mkr-workspace-qa.json'),'utf8'));
assert.equal(path.dirname(directory).toLowerCase(),evidence.toLowerCase());
assert.match(path.basename(directory),/^mkr-workspace-qa-[0-9a-f-]{36}$/);
const qa=JSON.parse(await readFile(path.join(directory,'engineering.json'),'utf8'));
assert.equal(qa.engineeringOnly,true);assert.equal(qa.readyForPublication,false);
assert.equal(path.resolve(qa.binaryDir),path.join(directory,'bin'));
assert.equal(path.resolve(qa.cargoTarget),path.join(root,'windows/target'));
let receipt;
if(process.env.GITHUB_ACTIONS==='true'){
 receipt=JSON.parse(await readFile(path.join(directory,'built-receipt.json'),'utf8'));
 assert.equal(receipt.engineeringOnly,true);assert.equal(receipt.readyForPublication,false);
 const source=await readFile(path.join(directory,'source-receipt.json'));
 assert.equal(createHash('sha256').update(source).digest('hex'),receipt.sourceReceiptSha256);
}
const attempt=randomUUID(),profile=path.join(directory,'profile','manual-'+attempt),home=path.join(profile,'home');
await mkdir(home,{recursive:true});
const binary=path.join(qa.binaryDir,'anf-mkr-manual-'+attempt+'.exe');
await copyFile(path.join(qa.cargoTarget,'debug','anf-mkr-qa.exe'),binary,constants.COPYFILE_EXCL);
if(receipt)assert.equal(createHash('sha256').update(await readFile(binary)).digest('hex'),receipt.binarySha256,'QA binary changed after its build receipt');
assert((await readFile(binary)).includes(Buffer.from('fr.louisraille.anf.qa')));
const assets=path.join(directory,'source/windows/dist');
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(assets,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  assert(file.startsWith(assets+path.sep));
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.wasm':'application/wasm'})[path.extname(file)]||'application/octet-stream');
  res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(1420,'127.0.0.1',resolve);});
const log=await open(path.join(directory,'manual-'+attempt+'.log'),'ax');
const env={...process.env,APPDATA:profile,LOCALAPPDATA:profile,USERPROFILE:home,HOME:home};
delete env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS;
const child=spawn(binary,[],{cwd:qa.binaryDir,env,windowsHide:true,stdio:['ignore',log.fd,log.fd]});
const descriptor={attempt,binary,profile,pid:child.pid,engineeringOnly:true,providerBacked:false,...(receipt?{buildReceipt:receipt}:{})};
await writeFile(path.join(directory,'manual-'+attempt+'.json'),JSON.stringify(descriptor,null,2));
console.log(JSON.stringify(descriptor));
await new Promise(resolve=>{
 let ending=false;
 const finish=()=>{if(ending)return;ending=true;clearTimeout(timer);process.stdin.pause();if(child.exitCode===null)child.kill();server.closeAllConnections();server.close(resolve);};
 const timer=setTimeout(finish,20*60*1000);
 child.once('exit',finish);child.once('error',finish);
 process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.includes('stop'))finish();});process.stdin.resume();
});
await log.close();
