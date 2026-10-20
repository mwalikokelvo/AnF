// Run only against the isolated QA identifier and the reviewed optional component.
import {chromium} from 'playwright-core';
import {spawn,spawnSync} from 'node:child_process';
import {createServer,request} from 'node:http';
import {mkdir,readFile,writeFile,copyFile,lstat,open} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

assert(process.env.ANF_QA_EXE,'Supply ANF_QA_EXE built with fr.louisraille.anf.qa.');
assert(process.env.ANF_COMPONENT_MANIFEST,'Supply the reviewed extracted component manifest.');
assert((await readFile(process.env.ANF_QA_EXE)).includes(Buffer.from('fr.louisraille.anf.qa')),'Refusing to launch a non-QA application binary.');
const root=fileURLToPath(new URL('../../',import.meta.url));
const sourceRoot=process.env.ANF_QA_SOURCE_ROOT?path.resolve(process.env.ANF_QA_SOURCE_ROOT):root;
const outer=path.dirname(root),tools=path.join(outer,'.tools');
const profile=process.env.ANF_QA_PROFILE?path.resolve(process.env.ANF_QA_PROFILE):path.join(tools,'managed-native-qa-'+randomUUID());
assert.equal(path.dirname(profile).toLowerCase(),tools.toLowerCase(),'QA profile must remain directly inside this workspace .tools directory.');
assert.match(path.basename(profile),/^managed-native-qa-[0-9a-f-]{36}$/);
await mkdir(profile,{recursive:true});
assert.equal((await lstat(profile)).isSymbolicLink(),false,'Linked QA profiles are refused.');
if(process.env.ANF_QA_PROFILE)await copyFile(path.join(profile,'report.json'),path.join(profile,'report-before-reuse-'+randomUUID()+'.json'));
const report={checks:[],profile};
const pass=name=>{report.checks.push(name);console.log('PASS: '+name);};
let proxyRequests=0;
const trap=createServer((req,res)=>{proxyRequests++;res.writeHead(502);res.end();});
await new Promise(r=>trap.listen(0,'127.0.0.1',r));
const proxy=`http://127.0.0.1:${trap.address().port}`;
const env={...process.env,APPDATA:profile,LOCALAPPDATA:profile,HTTP_PROXY:proxy,HTTPS_PROXY:proxy,ALL_PROXY:proxy,http_proxy:proxy,https_proxy:proxy,all_proxy:proxy,
 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9224 --remote-debugging-address=127.0.0.1'};
// CDP/WebView traffic must not use the application-side proxy trap.
const appLog=await open(path.join(profile,'app-native.log'),'a');
const child=spawn(process.env.ANF_QA_EXE,[],{env,stdio:['ignore',appLog.fd,appLog.fd],windowsHide:true});
child.on('exit',(code,signal)=>{report.childExit={code,signal};});
let browser,page,invoke,initialConnections,primaryError;
async function recoverWorkspace(){
 assert.equal(child.exitCode,null,'QA application exited; transport recovery cannot hide a native crash.');
 const deadline=Date.now()+15000;
 while(Date.now()<deadline){
  try{
   const attached=await chromium.connectOverCDP('http://127.0.0.1:9224');
   const workspace=attached.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('workspace.html'));
   if(workspace){browser=attached;page=workspace;report.transportReconnects=(report.transportReconnects||0)+1;console.log('Recovered CDP transport to the same running QA app.');return;}
  }catch{}
  await new Promise(r=>setTimeout(r,500));
 }
 assert.fail('The running QA workspace could not be recovered after its CDP target closed.');
}
function ownedNodes(){
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,'Cannot inspect QA-owned Node processes.');
 const parsed=result.stdout.trim()?JSON.parse(result.stdout):[];
 return (Array.isArray(parsed)?parsed:[parsed]).filter(p=>typeof p.ExecutablePath==='string'&&p.ExecutablePath.toLowerCase().startsWith(profile.toLowerCase()+path.sep));
}
async function waitNoNodes(){for(let i=0;i<30;i++){if(!ownedNodes().length)return;await new Promise(r=>setTimeout(r,250));}assert.fail('QA-owned Node process remained after shutdown.');}
async function checkOwnedListener(){
 const nodes=ownedNodes();assert.equal(nodes.length,1,'Expected one managed Node runtime.');
 const pid=nodes[0].ProcessId;assert(Number.isInteger(pid)&&pid>0);
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Get-NetTCPConnection -State Listen -OwningProcess ${pid} | Select-Object LocalAddress,LocalPort | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,'Cannot inspect managed listener.');
 const parsed=JSON.parse(result.stdout);const listeners=Array.isArray(parsed)?parsed:[parsed];
 assert.equal(listeners.length,1,'Unused dashboard websocket listener must remain disabled.');
 assert.equal(listeners[0].LocalAddress,'127.0.0.1','Managed service must bind numeric IPv4 loopback only.');
 const status=await new Promise((resolve,reject)=>{
  const req=request({hostname:'127.0.0.1',port:listeners[0].LocalPort,path:'/v1/chat/completions',method:'POST',headers:{'Content-Type':'application/json'},timeout:10000},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
  req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('Unauthenticated request timed out.')));
  req.end(JSON.stringify({model:'anfmanaged/anf-local',messages:[{role:'user',content:'This unauthenticated request must be refused.'}]}));
 });
 assert([401,403].includes(status),'Managed chat accepted a request without its private API key.');
 pass('Managed runtime exposes one loopback listener and refuses unauthenticated chat.');
}
try{
 const deadline=Date.now()+45000;
 while(Date.now()<deadline&&!page){
  try{browser=await chromium.connectOverCDP('http://127.0.0.1:9224');page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('workspace.html'));if(!page){await browser.close();browser=undefined;}}catch{}
  if(!page)await new Promise(r=>setTimeout(r,500));
 }
 assert(page,'The isolated QA workspace did not start.');
 page.on('crash',()=>{report.rendererCrashed=true;});
 page.on('close',()=>{report.workspaceClosed=true;});
 invoke=async(command,args={})=>{
  try{return await page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});}
  catch(error){
   if(!/Target page, context or browser has been closed/.test(String(error))||!['omniroute_start','omniroute_install'].includes(command))throw error;
   await recoverWorkspace();
   // The original native operation can continue after CDP disconnects. Observe
   // its outcome instead of submitting a second install/start operation.
   const deadline=Date.now()+600000;
   while(Date.now()<deadline){
    const state=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('omniroute_status'));
    if(command==='omniroute_start'?state.running:state.installed)return state;
    if(state.error)throw Error(state.error);
    await new Promise(r=>setTimeout(r,500));
   }
   throw Error('Native operation did not complete after transport recovery.');
  }
 };
 assert.equal((await invoke('workspace_diagnostics')).version,JSON.parse(await readFile(path.join(sourceRoot,'windows/package.json'),'utf8')).version);
 initialConnections=await invoke('connection_list');
 const initial=await invoke('omniroute_status');assert.equal(initial.running,false);
 await assert.rejects(()=>invoke('omniroute_use'));
 const bad=path.join(profile,'untrusted-component.json');await writeFile(bad,'{"schema":1,"files":[]}');
 if(!process.env.ANF_QA_PROFILE){
 assert.equal(initial.installed,false);
 await assert.rejects(()=>invoke('omniroute_install',{manifest:bad}));
 assert.equal((await invoke('omniroute_status')).installed,false);
 pass('Unreviewed manifest refused; absent runtime cannot be selected.');
 const importing=Date.now();
 const installed=await invoke('omniroute_install',{manifest:path.resolve(process.env.ANF_COMPONENT_MANIFEST)});
 report.importMs=Date.now()-importing;
 assert.equal(installed.installed,true);assert.equal(installed.running,false);
 await assert.rejects(()=>invoke('omniroute_install',{manifest:path.resolve(process.env.ANF_COMPONENT_MANIFEST)}));
 pass(`Reviewed component imported in ${(report.importMs/1000).toFixed(1)} seconds; repeat import cannot overwrite it.`);
 }else{
  assert.equal(initial.installed,true,'Reuse requires the same pinned component previously imported by QA.');
  report.reusedComponent=true;pass('Reused isolated QA component; prior import report preserved.');
 }
 const starting=Date.now();
 const started=await invoke('omniroute_start');report.startMs=Date.now()-starting;assert.equal(started.running,true);assert(ownedNodes().length>0);
 await checkOwnedListener();
 assert.deepEqual(await invoke('connection_list'),initialConnections);
 await page.locator('.workspace-navigation [data-view="settings"]').click();
 const services=page.getByLabel('Connected services',{exact:true});
 await services.locator(':scope>summary').click();
 const gatewayCard=services.locator('[data-service="gateway"]');
 await gatewayCard.locator(':scope>summary').click();
 const managed=page.getByLabel('Managed OmniRoute',{exact:true});
 await managed.getByRole('button',{name:'Refresh managed gateway status',exact:true}).click();
 await managed.getByRole('button',{name:'Use managed local AI in Chat',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[aria-label="Answer provider"]')?.value==='managed'&&document.body.dataset.view==='chat');
 assert.equal(await page.getByLabel('Answer provider',{exact:true}).inputValue(),'managed');
 assert.equal(await page.evaluate(()=>document.body.dataset.view),'chat');
 assert.deepEqual(await invoke('connection_list'),initialConnections);
 assert.equal(proxyRequests,0);
 pass('Managed service started with private ownership, no external configuration change and no proxy traffic.');
 await page.getByRole('button',{name:'New conversation',exact:true}).click();
 assert.equal(await page.getByLabel('Answer provider',{exact:true}).inputValue(),'managed');
 await page.getByLabel('Your question',{exact:true}).fill('Reply in one short sentence explaining why books are useful.');
 await page.getByRole('button',{name:'Ask selected AI',exact:true}).click();
 try{await page.locator('.message.assistant').first().waitFor({state:'visible',timeout:220000});}
 catch(error){
  if(!/Target page, context or browser has been closed/.test(String(error)))throw error;
  await recoverWorkspace();
  await page.locator('.message.assistant').first().waitFor({state:'visible',timeout:220000});
 }
 assert((await page.locator('.message.assistant').first().innerText()).length>15);assert.equal(proxyRequests,0);
 pass('Native Chat controls selected the managed route and generated a new local-model answer.');
 const island=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('http')&&!p.url().includes('workspace.html')&&!p.url().includes('settings.html'));
 assert(island,'Floating QA window missing.');
 for(const command of ['omniroute_status','omniroute_start','omniroute_stop','omniroute_cancel','omniroute_use','omniroute_pick_component','omniroute_install']){
  assert.equal(await island.evaluate(({command,manifest})=>window.__TAURI_INTERNALS__.invoke(command,{manifest}).then(()=>false,()=>true),{command,manifest:bad}),true,command+' allowed from floating window');
 }
 pass('All managed lifecycle commands denied outside the workspace.');
 assert.equal((await invoke('omniroute_stop')).running,false);await waitNoNodes();
 await assert.rejects(async()=>{const job=await invoke('workspace_begin');await invoke('workspace_ask',{job,query:'This must fail without a running managed gateway.',sources:[],history:[],memory:'',model:'fast',gateway:false,managedGateway:true});});
 assert.equal(proxyRequests,0);assert.deepEqual(await invoke('connection_list'),initialConnections);
 pass('Stop terminated owned service; stopped route fails without fallback.');
 const pendingStart=invoke('omniroute_start').then(value=>({value}),error=>({error}));
 let active=false;
 for(let i=0;i<100;i++){
  const state=await invoke('omniroute_status');
  if(!state.running&&/verifying|starting/i.test(state.phase)){active=true;break;}
  await new Promise(r=>setTimeout(r,100));
 }
 assert(active,'Did not observe the cancellable startup operation.');
 await invoke('omniroute_cancel');
 assert('error' in await pendingStart,'Cancelled startup was unexpectedly published as running.');
 assert.equal((await invoke('omniroute_status')).running,false);await waitNoNodes();
 pass('Cancelling startup prevents stale service publication and cleans owned processes.');
 assert.equal((await invoke('omniroute_start')).running,true);
 assert.deepEqual(await invoke('connection_list'),initialConnections);
 await page.screenshot({path:path.join(profile,'managed-native.png')});
 await browser.close();browser=undefined;
 child.kill();await waitNoNodes();
 pass('Restart succeeds; exiting QA app removes its managed Node process.');
 report.passed=true;
}catch(error){
 primaryError=error;report.failure=String(error);throw error;
}finally{
 let cleanupError;
 report.childAliveBeforeCleanup=child.exitCode===null;
 if(page&&browser&&!page.isClosed()){await invoke('omniroute_stop').catch(()=>{});if(initialConnections){try{assert.deepEqual(await invoke('connection_list'),initialConnections);}catch(error){cleanupError=error;}}}
 await browser?.close().catch(()=>{});child.kill();
 if(child.exitCode===null)await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,5000))]);
 await appLog.close();
 await new Promise(r=>trap.close(r));
 report.proxyRequests=proxyRequests;
 if(cleanupError)report.passed=false;
 await writeFile(path.join(profile,'report.json'),JSON.stringify(report,null,2));
 console.log('QA evidence: '+profile);
 if(cleanupError&&!primaryError)throw cleanupError;
}
