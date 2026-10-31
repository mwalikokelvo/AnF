// Read-only baseline against an already prepared, isolated QA installation.
// Never starts/imports/repairs the gateway or synthesizes text.
import {chromium} from 'playwright-core';
import {spawn,spawnSync} from 'node:child_process';
import {readFile,open,mkdir,writeFile,lstat} from 'node:fs/promises';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const repo=fileURLToPath(new URL('../../',import.meta.url)),outer=path.dirname(repo),tools=path.join(outer,'.tools');
const exe=process.env.ANF_QA_EXE,profile=path.resolve(process.env.ANF_QA_PROFILE||'');
assert(exe&&process.env.ANF_QA_PROFILE,'Supply an existing isolated ANF_QA_EXE and ANF_QA_PROFILE.');
assert((await readFile(exe)).includes(Buffer.from('fr.louisraille.anf.qa')),'A QA application identity is required.');
assert.equal(path.dirname(profile).toLowerCase(),tools.toLowerCase());
assert.match(path.basename(profile),/^managed-native-qa-[0-9a-f-]{36}$/);
assert.equal((await lstat(profile)).isSymbolicLink(),false);
const manifest=path.join(profile,'AnF/managed-omniroute/component/component.json');
const manifestBytes=(await readFile(manifest)).length;
const reservation=createServer();await new Promise((resolve,reject)=>{reservation.once('error',reject);reservation.listen(9224,'127.0.0.1',resolve);});
await new Promise(resolve=>reservation.close(resolve));
const output=path.join(tools,'benchmarks');await mkdir(output,{recursive:true});
const id=randomUUID(),log=await open(path.join(output,'status-'+id+'.log'),'a');
const child=spawn(exe,[],{windowsHide:true,stdio:['ignore',log.fd,log.fd],env:{...process.env,APPDATA:profile,LOCALAPPDATA:profile,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9224 --remote-debugging-address=127.0.0.1'}});
const report={schema:1,manifestBytes,sourceVersion:JSON.parse(await readFile(path.join(repo,'windows/package.json'),'utf8')).version,groups:[]};
let browser,page;
function counters(){
 assert(Number.isInteger(child.pid)&&child.pid>0&&child.exitCode===null,'QA process exited.');
 const cmd='[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); '+`Get-CimInstance Win32_Process -Filter "ProcessId=${child.pid}" | Select-Object ProcessId,ReadTransferCount,WriteTransferCount,KernelModeTime,UserModeTime | ConvertTo-Json -Compress`;
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',cmd],{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,'Cannot inspect the exact QA process.');
 const value=JSON.parse(result.stdout);assert.equal(value.ProcessId,child.pid);return value;
}
function delta(a,b){return {readBytes:Number(b.ReadTransferCount)-Number(a.ReadTransferCount),writeBytes:Number(b.WriteTransferCount)-Number(a.WriteTransferCount),cpuMs:(Number(b.KernelModeTime)+Number(b.UserModeTime)-Number(a.KernelModeTime)-Number(a.UserModeTime))/10000};}
const invoke=command=>page.evaluate(command=>window.__TAURI_INTERNALS__.invoke(command),command);
try{
 const deadline=Date.now()+45000;
 while(Date.now()<deadline&&!page){
  try{browser=await chromium.connectOverCDP('http://127.0.0.1:9224');page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('workspace.html'));if(!page){await browser.close();browser=undefined;}}catch{}
  if(!page)await new Promise(resolve=>setTimeout(resolve,500));
 }
 assert(page,'Isolated QA workspace did not open.');
 assert.equal((await invoke('workspace_diagnostics')).version,report.sourceVersion);
 const connections=await invoke('connection_list');
 const verify=state=>{assert(state.installed);assert.equal(state.running,false);assert.equal(state.owned,false);assert.equal(state.recoveryPending,false);};
 for(let i=0;i<3;i++)verify(await invoke('omniroute_status'));
 await new Promise(resolve=>setTimeout(resolve,2000));
 for(const kind of (process.env.ANF_BENCH_PROGRESS==='1'?['transport-only','progress','status','progress','progress']:['transport-only','status','transport-only','status','status'])){
  const before=counters(),times=[];
  for(let i=0;i<10;i++){
   const start=performance.now();
   if(kind==='status')verify(await invoke('omniroute_status'));else if(kind==='progress'){const value=await invoke('omniroute_progress');assert.deepEqual(Object.keys(value).sort(),['done','phase','total']);assert.equal(typeof value.phase,'string');}else await page.evaluate(()=>true);
   times.push(performance.now()-start);
  }
  const d=delta(before,counters()),sorted=[...times].sort((a,b)=>a-b);
  const group={kind,calls:times.length,...d,medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.ceil(sorted.length*.95)-1]};
  report.groups.push(group);console.log(JSON.stringify(group));
 }
 assert.deepEqual(await invoke('connection_list'),connections);
 verify(await invoke('omniroute_status'));
 report.passed=true;
 report.notes=['ReadTransferCount measures logical process reads, not physical disk traffic.','Transport-only control measures CDP overhead; it is not a native RPC baseline.','No gateway/model startup, import, repair, selection or synthesis command was sent.','Installed-state validation and all execution-time integrity checks remain unchanged.'];
}catch(error){report.passed=false;report.failure=String(error);throw error;}
finally{
 if(browser)await browser.close().catch(()=>{});
 if(child.exitCode===null){child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise((_,reject)=>setTimeout(()=>reject(Error('QA exit timed out.')),15000))]);}
 await log.close();
 await writeFile(path.join(output,'managed-status-'+id+'.json'),JSON.stringify(report,null,2));
 console.log('Benchmark report: '+path.join(output,'managed-status-'+id+'.json'));
}
