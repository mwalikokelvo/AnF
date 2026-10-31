// Actual workspace UI + real OmniRoute/model. IPC persistence is an isolated
// in-memory fixture; the Rust live test separately verifies the native adapter.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const version=JSON.parse(readFileSync(new URL('../../windows/package.json',import.meta.url),'utf8')).version;
const gateway=new URL(process.env.ANF_LIVE_GATEWAY_URL||'');
assert.equal(gateway.hostname,'127.0.0.1');
const model=process.env.ANF_LIVE_GATEWAY_MODEL,key=process.env.ANF_LIVE_GATEWAY_KEY;
assert(model&&key,'Set the isolated live model and gateway key.');
let connection,project,job=0,generated=0;const calls=[];
async function remote(route,body){const r=await fetch(gateway.href.replace(/\/$/,'')+'/'+route,{method:body?'POST':'GET',headers:{authorization:'Bearer '+key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error('Isolated gateway HTTP '+r.status);return r.json();}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.exposeFunction('qaInvoke',async(command,args={})=>{
  calls.push(command);
  if(command.startsWith('plugin:event|'))return 1;
  if(command==='workspace_list_projects')return project?[{id:project.id,name:project.name,updated:Date.now()}]:[];
  if(command==='workspace_save_project'){project={...args.project,id:'isolated-ui-project',revision:String(Date.now())};return project;}
  if(command==='workspace_load_project')return project;
  if(command==='workspace_diagnostics')return{runtime:true,fast:true,balanced:true,ocr:true,totalRam:8e9,freeRam:4e9,documents:'Isolated QA',log:'Isolated QA',version};
  if(command==='get_boot')return{version,settings:{activeIntegrations:[]},screen:{}};
  if(command==='link_address')return'127.0.0.1';
  if(command==='link_status')return false;
  if(command==='log_line'||command==='workspace_cancel')return;
  if(command==='local_voice_status')throw Error('Optional voice fixture is unavailable.');
  if(command==='music_available')return false;
  if(command==='music_control')return{available:false,state:'unavailable'};
  if(command==='workspace_begin')return ++job;
  if(command==='connection_list')return connection?[connection]:[];
  if(command==='connection_save'){const {secret,...input}=args.input;connection={...input,origin:new URL(input.endpoint).origin,hasSecret:!!secret};return connection;}
  if(command==='connection_action'){
   assert.equal(args.action.service,'gateway');
   if(['models','test'].includes(args.action.operation)){const value=await remote('models');return{items:value.data.map(v=>({id:v.id,name:v.id})).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,200),message:'Real gateway catalog reached; generation is checked separately.'};}
  }
  if(command==='workspace_ask'){
   assert.equal(args.gateway,true);assert.equal(connection.model,model);
   const result=await remote('chat/completions',{model:connection.model,messages:[{role:'system',content:'Answer briefly in one sentence.'},{role:'user',content:args.query}],stream:false,max_tokens:512});
   const text=result.choices?.[0]?.message?.content;assert(text?.length>15);generated++;
   return{text,notice:'Answered through the explicitly selected isolated OmniRoute model.',evidence:[]};
  }
  throw Error('Unexpected isolated UI command: '+command);
 });
 await page.addInitScript(()=>{let id=0;window.__TAURI_INTERNALS__={invoke:(command,args)=>window.qaInvoke(command,args),transformCallback:()=>++id,metadata:{currentWindow:{label:'workspace'},currentWebview:{label:'workspace'}}};});
 await page.goto(process.env.ANF_UI_URL||'http://127.0.0.1:24534/workspace.html');
 await page.waitForFunction(()=>document.querySelector('[aria-label="Appearance"]')?.disabled===false);
 await page.locator('.workspace-navigation [data-view="settings"]').click();
 await page.getByLabel('Connected services',{exact:true}).locator(':scope>summary').click();
 const card=page.locator('[data-service="gateway"]');await card.locator(':scope>summary').click();
 await card.getByLabel('AI gateway · OmniRoute address',{exact:true}).fill(gateway.href);
 await card.getByLabel('AI gateway · OmniRoute secret',{exact:true}).fill(key);
 await card.getByLabel('AI gateway · OmniRoute enabled',{exact:true}).check();
 await card.getByRole('button',{name:'Save connection',exact:true}).click();
 await page.getByText('Connection saved. No service request was sent.',{exact:true}).waitFor();
 await card.getByRole('button',{name:'Discover gateway models',exact:true}).click();
 await card.getByLabel('Discovered gateway models',{exact:true}).selectOption(model);
 await card.getByRole('button',{name:'Save connection',exact:true}).click();
 await page.getByText('Connection saved. No service request was sent.',{exact:true}).waitFor();
 assert.equal(connection.model,model);assert.equal(await card.getByLabel('AI gateway · OmniRoute secret',{exact:true}).inputValue(),'');
 await page.locator('.workspace-navigation [data-view="chat"]').click();
 await page.getByLabel('Answer provider',{exact:true}).selectOption('gateway');
 await page.getByLabel('Your question',{exact:true}).fill('Explain in one short sentence why water freezes when sufficiently cold.');
 await page.getByRole('button',{name:'Ask selected AI',exact:true}).click();
 await page.getByText('Answered through the explicitly selected isolated OmniRoute model.',{exact:true}).waitFor({timeout:60000});
 assert.equal(generated,1);assert.deepEqual(errors,[]);
 console.log('PASS: actual workspace discovery → model selection → saved route → Chat → real local OmniRoute generation. IPC persistence fixture isolated; native adapter tested separately.');
}finally{await browser.close();}
