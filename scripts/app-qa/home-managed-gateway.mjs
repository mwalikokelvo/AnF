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
 import {createToolHub} from './src/workspace/tool-hub';
 import './src/workspace/workspace.css';import './src/workspace/anf-design.css';
 window.hub=createToolHub({allowed:()=>window.allowed,connect:id=>window.opened=id,local:id=>window.local=id,managed:()=>window.selected=true,writing:()=>{},skill:()=>{}});
 document.body.append(window.hub.root);void window.hub.refresh();
 `,resolveDir:path.join(root,'windows'),loader:'ts'},bundle:true,format:'esm',outdir:'qa',write:false});
const js=built.outputFiles.find(f=>f.path.endsWith('.js')).contents,css=built.outputFiles.find(f=>f.path.endsWith('.css')).contents;
const server=createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(js);}else if(req.url==='/app.css'){res.setHeader('Content-Type','text/css');res.end(css);}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><script type="module" src="/app.js"></script></body></html>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BIN||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{window.allowed=true;window.qaCalls=[];window.mode='missing';window.connectionFailure=false;window.__TAURI_INTERNALS__={invoke:async command=>{window.qaCalls.push(command);if(command==='connection_list'){if(window.connectionFailure)throw Error('credential store unavailable');return [];}if(command==='omniroute_status'){if(window.mode==='error')throw Error('status failed');return {installed:window.mode!=='missing',running:window.mode==='running',version:'3.8.51',phase:'',done:0,total:0,error:''};}if(command==='omniroute_use'){if(window.rejectUse)throw Error('Gateway stopped. Start it in settings.');return;}throw Error('Unexpected command '+command);}};});
 await page.goto('http://127.0.0.1:'+server.address().port);
 const card=page.locator('[data-tool="gateway"]'),local=card.getByRole('region',{name:'Managed local AI',exact:true});
 await local.getByText('Optional component not installed · OmniRoute 3.8.51',{exact:true}).waitFor();
 await local.getByRole('button',{name:'Set up local gateway',exact:true}).click();assert.equal(await page.evaluate(()=>window.opened),'gateway');
 assert.equal(await card.getByRole('button',{name:'Use managed local AI',exact:true}).isVisible(),false);
 await page.evaluate(async()=>{window.mode='stopped';await window.hub.refresh();});
 await local.getByText('Installed · stopped · OmniRoute 3.8.51',{exact:true}).waitFor();
 assert.equal(await local.getByRole('button',{name:'Manage local gateway',exact:true}).isVisible(),true);
 await page.evaluate(async()=>{window.mode='running';window.connectionFailure=true;await window.hub.refresh();});
 await local.getByText('Running locally · OmniRoute 3.8.51',{exact:true}).waitFor();
 await local.getByRole('button',{name:'Use managed local AI',exact:true}).click();await page.waitForFunction(()=>window.selected===true);
 assert.equal(await page.evaluate(()=>window.qaCalls.filter(c=>c==='omniroute_use').length),1);
 await page.evaluate(()=>{window.selected=false;window.allowed=false;});await local.getByRole('button',{name:'Use managed local AI',exact:true}).click();assert.equal(await page.evaluate(()=>window.selected),false);
 await page.evaluate(()=>{window.allowed=true;window.rejectUse=true;window.mode='error';});
 await local.getByRole('button',{name:'Use managed local AI',exact:true}).click();await local.getByText('Gateway stopped. Start it in settings.',{exact:true}).waitFor();await local.getByText('Managed local gateway status unavailable. Open settings to inspect it.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.selected),false);assert.equal(await local.getByRole('button',{name:'Use managed local AI',exact:true}).isVisible(),false);
 assert.equal(await local.getByRole('button',{name:'Check local gateway',exact:true}).isVisible(),true);
 assert((await page.evaluate(()=>window.qaCalls)).every(c=>['connection_list','omniroute_status','omniroute_use'].includes(c)),'Home must not start, install, stop, generate or change external connections.');
 assert.deepEqual(errors,[]);console.log('PASS: Home missing/stopped/running/error states, independent credential failure, explicit managed selection and busy guard; no automatic lifecycle or provider mutation.');
}finally{await browser.close();server.close();}
