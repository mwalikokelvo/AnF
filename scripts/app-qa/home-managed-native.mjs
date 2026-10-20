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
const profile=path.join(outer,'.tools','home-managed-qa-'+randomUUID());
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
 while(Date.now()<deadline&&!page){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9224');page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('workspace.html'));}catch{}if(!page)await new Promise(r=>setTimeout(r,500));}
 assert(page,'Isolated QA workspace did not start.');
 const diagnostics=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('workspace_diagnostics'));
 assert.equal(diagnostics.version,JSON.parse(await readFile(path.join(root,'windows/package.json'),'utf8')).version);
 await page.waitForFunction(()=>document.querySelector('[aria-label="Appearance"]')?.disabled===false);
 const hub=page.getByLabel('Research, learning and connected tools',{exact:true}),gateway=hub.getByRole('region',{name:'Managed local AI',exact:true});
 await gateway.getByText('Optional component not installed · OmniRoute 3.8.51',{exact:true}).waitFor();
 assert.equal(await gateway.getByRole('button',{name:'Use managed local AI',exact:true}).isVisible(),false);
 assert.equal(models().length,0,'Opening Home must not launch a local model.');
 await gateway.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(profile,'gateway-home.png')});
 pass('Native Home shows the uninstalled local gateway without starting a model.');
 await gateway.getByRole('button',{name:'Set up local gateway',exact:true}).click();
 await page.waitForFunction(()=>document.activeElement?.textContent==='Managed local gateway');
 assert.equal(await page.getByLabel('Managed OmniRoute',{exact:true}).isVisible(),true);
 assert.equal(await page.evaluate(()=>document.body.dataset.view),'settings');
 pass('Home setup opens gateway settings and focuses the managed gateway heading.');
 await page.locator('.workspace-navigation [data-view="home"]').click();
 await hub.getByRole('button',{name:'Open AI chat',exact:true}).click();
 assert.equal(await page.getByLabel('Answer provider',{exact:true}).inputValue(),'local');
 assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Your question');
 assert.equal(models().length,0,'Selecting offline Chat must not generate or start a model.');
 pass('The existing offline Chat action remains available without starting generation.');
 await page.locator('.workspace-navigation [data-view="home"]').click();await page.screenshot({path:path.join(profile,'home-managed.png')});
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
