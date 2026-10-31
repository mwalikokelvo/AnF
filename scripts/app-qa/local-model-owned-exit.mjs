// Real Windows QA app: inference must work, then forced owner death must kill its model.
import {chromium} from 'playwright-core';
import {spawn,spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile,open,realpath} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../../',import.meta.url)),outer=path.dirname(root);
const executable=path.resolve(process.env.ANF_QA_EXE||'');
assert(process.env.ANF_QA_EXE,'ANF_QA_EXE is required.');
assert((await readFile(executable)).includes(Buffer.from('fr.louisraille.anf.qa')),'Production applications are refused.');
const profile=path.join(outer,'.tools','local-model-qa-'+randomUUID());
await mkdir(profile);
const report={profile,checks:[]},pass=message=>{report.checks.push(message);console.log('PASS: '+message);};
const log=await open(path.join(profile,'app-native.log'),'a');
const child=spawn(executable,[],{env:{...process.env,APPDATA:profile,LOCALAPPDATA:profile,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9224 --remote-debugging-address=127.0.0.1'},stdio:['ignore',log.fd,log.fd],windowsHide:true});
let browser,page,modelPid;
const models=()=>{
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); Get-CimInstance Win32_Process -Filter \"name='llama-server.exe'\" | Select-Object ProcessId,ParentProcessId,ExecutablePath | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,'Cannot inspect model process ownership.');
 const parsed=result.stdout.trim()?JSON.parse(result.stdout):[];
 return (Array.isArray(parsed)?parsed:[parsed]).filter(p=>p.ParentProcessId===child.pid||p.ProcessId===modelPid);
};
try{
 const deadline=Date.now()+45000;
 while(Date.now()<deadline&&!page){
  try{browser=await chromium.connectOverCDP('http://127.0.0.1:9224');page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('workspace.html'));}catch{}
  if(!page)await new Promise(r=>setTimeout(r,500));
 }
 assert(page,'Isolated QA workspace did not start.');
 const diagnostics=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('workspace_diagnostics'));
 assert.equal(diagnostics.version,JSON.parse(await readFile(path.join(root,'windows/package.json'),'utf8')).version);
 assert(diagnostics.fast&&diagnostics.runtime,'Bundled Fast model is required.');
 await page.locator('.workspace-navigation [data-view="chat"]').click();
 await page.getByRole('button',{name:'New conversation',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.message.assistant').length===0&&Array.from(document.querySelectorAll('footer [role="status"]')).some(e=>e.textContent==='New conversation ready.'));
 await page.getByLabel('Answer provider',{exact:true}).selectOption('local');
 assert.equal(await page.getByLabel('Local model',{exact:true}).inputValue(),'fast','Fresh offline conversations should use the Fast model by default.');
 await page.getByLabel('Your question',{exact:true}).fill('In one short sentence, explain why books are useful. Test run '+randomUUID()+'.');
 await page.getByRole('button',{name:'Ask selected AI',exact:true}).click();
 await page.locator('.message.assistant').first().waitFor({state:'visible',timeout:220000});
 assert((await page.locator('.message.assistant').first().innerText()).length>15);
 const active=models();assert.equal(active.length,1,'One model must be running immediately before forced exit.');
 modelPid=active[0].ProcessId;report.modelImage=active[0].ExecutablePath;
 assert.equal((await realpath(report.modelImage)).toLowerCase(),(await realpath(path.join(path.dirname(executable),'local-ai','llama-server.exe'))).toLowerCase());
 pass('A fresh offline answer came from the model in this QA installation, including its spaces and Unicode path.');
 const killing=Date.now();
 assert.equal(child.exitCode,null,'QA application already exited.');
 child.kill();
 const exitDeadline=Date.now()+15000;
 while(Date.now()<exitDeadline&&models().length)await new Promise(r=>setTimeout(r,250));
 assert.equal(models().length,0,'Forcibly ending the app left its model process running.');
 report.forcedExitCleanupMs=Date.now()-killing;
 pass('Forced app termination killed the model that was confirmed running immediately beforehand.');
 report.passed=true;
}catch(error){
 report.failure=String(error);
 if(page&&!page.isClosed())report.activityStatus=await page.locator('footer [role="status"]').allTextContents().catch(()=>[]);
 throw error;
}finally{
 await browser?.close().catch(()=>{});child.kill();
 if(child.exitCode===null)await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,5000))]);
 await log.close();
 await writeFile(path.join(profile,'report.json'),JSON.stringify(report,null,2));
 console.log('QA evidence: '+profile);
}
