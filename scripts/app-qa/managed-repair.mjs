// Browser user-flow tests with explicit IPC fixtures; native HTTP contracts are Rust tests.
import {chromium} from 'playwright-core';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(path.join(root,'windows/package.json'));
const {build}=require('esbuild');
const built=await build({stdin:{contents:`
 import {managedGateway} from './src/workspace/managed-gateway';
 import './src/workspace/workspace.css';import './src/workspace/anf-design.css';
 const notice=document.createElement('p');notice.setAttribute('role','status');notice.id='notice';
 document.body.append(managedGateway(()=>window.used=true,text=>notice.textContent=text),notice);
 `,resolveDir:path.join(root,'windows'),loader:'ts'},bundle:true,format:'esm',outdir:'qa',write:false});
const js=built.outputFiles.find(f=>f.path.endsWith('.js')).contents,css=built.outputFiles.find(f=>f.path.endsWith('.css')).contents;
const server=createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(js);}else if(req.url==='/app.css'){res.setHeader('Content-Type','text/css');res.end(css);}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><script type="module" src="/app.js"></script></body></html>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BIN||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{window.running=false;window.qaCalls=[];window.__TAURI_INTERNALS__={invoke:async(command,args)=>{window.qaCalls.push({command,args});if(command==='omniroute_status')return {installed:false,repairable:true,recoveryPending:true,running:window.running,owned:window.owned||window.running,version:'3.8.51',phase:window.qaPhase||'',done:window.qaDone||0,total:window.qaTotal||0,error:''};if(command==='omniroute_stop'){window.owned=false;window.running=false;return {};}if(command==='omniroute_pick_component')return 'C:/reviewed/component.json';if(command==='omniroute_repair')return new Promise(resolve=>window.finishRepair=resolve);throw Error('Unexpected '+command);}};});
 await page.goto('http://127.0.0.1:'+server.address().port);
 const panel=page.getByLabel('Managed OmniRoute',{exact:true}),repair=panel.getByRole('button',{name:'Repair installed component',exact:true});
 await page.getByText(/Recovery pending; start or repair while stopped/).waitFor();assert.equal(await repair.isDisabled(),true);
 await panel.getByRole('button',{name:'Choose OmniRoute component',exact:true}).click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Repair installed component').disabled);
 assert.equal(await panel.getByRole('button',{name:'Install optional component',exact:true}).isVisible(),false);
 await repair.click();await page.waitForFunction(()=>!!window.finishRepair);
 assert.equal(await panel.getByRole('button',{name:'Cancel gateway operation',exact:true}).isVisible(),true);assert.equal(await repair.isVisible(),false);
 assert.deepEqual(await page.evaluate(()=>window.qaCalls.filter(c=>c.command==='omniroute_repair').map(c=>c.args)),[{manifest:'C:/reviewed/component.json'}]);
 const meter=panel.getByRole('progressbar',{name:'OmniRoute component progress'});
 await page.evaluate(()=>{window.qaPhase='Copying and verifying component files';window.qaDone=100;window.qaTotal=100;});
 await panel.getByText(/Working.*Copying and verifying component files.*100%/).waitFor();
 assert.equal(await panel.getAttribute('aria-busy'),'true');assert.equal(await page.locator('#notice').textContent(),'');
 await page.evaluate(()=>{window.qaPhase='Verifying component files';window.qaDone=25;window.qaTotal=100;});
 await panel.getByText(/Working.*Verifying component files.*25%/).waitFor();
 await page.evaluate(()=>{window.qaPhase='Cleaning repair rollback data';window.qaDone=0;window.qaTotal=0;});
 await panel.getByText(/Working.*Cleaning repair rollback data/).waitFor();
 assert.equal(await meter.isVisible(),true);assert.equal(await meter.getAttribute('value'),null);
 assert.equal((await panel.getByRole('status').textContent()).includes('%'),false);
 assert.equal(await repair.isVisible(),false);assert.equal(await panel.getByRole('button',{name:'Start managed gateway',exact:true}).isVisible(),false);

 await page.evaluate(()=>window.finishRepair({}));await page.locator('#notice').getByText('Reviewed component repaired. Choose Start managed gateway when ready.',{exact:true}).waitFor();
 assert.equal(await panel.getAttribute('aria-busy'),'false');assert.equal(await meter.isVisible(),false);
 await page.evaluate(()=>{window.running=true;window.qaPhase='';});await panel.getByRole('button',{name:'Refresh managed gateway status',exact:true}).click();assert.equal(await repair.isVisible(),false);assert.equal(await panel.getByRole('button',{name:'Choose OmniRoute component',exact:true}).isVisible(),false);
 await page.evaluate(()=>{window.running=false;window.owned=true;});await panel.getByRole('button',{name:'Refresh managed gateway status',exact:true}).click();
 await panel.getByText(/Not ready · stop to reset/).waitFor();
 assert.equal(await panel.getByRole('button',{name:'Stop managed gateway',exact:true}).isVisible(),true);assert.equal(await repair.isVisible(),false);
 assert.equal(await panel.getByRole('button',{name:'Start managed gateway',exact:true}).isVisible(),false);
 await panel.getByRole('button',{name:'Stop managed gateway',exact:true}).click();await repair.waitFor({state:'visible'});
 assert.equal(await panel.getByRole('button',{name:'Stop managed gateway',exact:true}).isVisible(),false);
 assert((await page.evaluate(()=>window.qaCalls)).every(c=>['omniroute_status','omniroute_pick_component','omniroute_repair','omniroute_stop'].includes(c.command)));
 assert.deepEqual(errors,[]);console.log('PASS: damaged/pending component repair, explicit source selection, operation guard, running-state exclusion, explicit stale-owned reset, copy/verify/indeterminate cleanup progress and no premature completion or automatic start/provider selection.');
}finally{await browser.close();server.close();}
