// Real Chromium rendering checks. Desktop IPC is a fixture; installed-app QA is separate.
import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const version=JSON.parse(await readFile(path.join(root,'windows/src-tauri/tauri.conf.json'),'utf8')).version;
const out=path.join(root,`releases/anf-${version}/previews`);await mkdir(out,{recursive:true});
const types={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.png':'image/png','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{
 try{const url=new URL(req.url,'http://localhost'),mobile=url.pathname.startsWith('/android/');
  const base=path.join(root,mobile?'android/build/assets/web':'windows/dist');
  const rel=decodeURIComponent(mobile?url.pathname.slice(9):url.pathname.slice(1));
  const file=path.resolve(base,rel||'workspace.html');if(!file.startsWith(base+path.sep))throw Error('Invalid path');
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.statusCode=404;res.end('Not found');}
});await new Promise(r=>server.listen(4180,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BIN||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const errors=[];let checks=0;
try{
 for(const platform of ['windows','android']){
  const context=await browser.newContext({viewport:{width:platform==='windows'?1440:390,height:platform==='windows'?1000:844},colorScheme:'light'});
  if(platform==='windows')await context.addInitScript(()=>{
   let current=JSON.parse(localStorage.getItem('anf-ui-qa')||'null')||{id:'fixture',name:'A fresh perspective',title:'Notes for a quieter week',question:'',draft:'# Make room for ideas\n\nA good day starts with a little space to think.\n\n- Read something inspiring\n- Put one idea into words\n- Keep the important things close',history:[],sources:[{name:'Reading notes.txt',text:'Make time for focused work and a moment to reflect.',pages:[],path:null}],memory:'',model:'fast'};
   window.__TAURI_INTERNALS__={invoke:async(command,args={})=>{
    switch(command){
     case 'workspace_list_projects':return[{id:current.id,name:current.name,updated:Date.now(),snippet:current.draft}];
     case 'workspace_load_project':return structuredClone(current);
     case 'workspace_save_project':current={...args.project,id:'fixture'};localStorage.setItem('anf-ui-qa',JSON.stringify(current));return structuredClone(current);
     case 'workspace_diagnostics':return{runtime:true,fast:true,balanced:true,ocr:true,totalRam:16000000000,freeRam:8000000000,documents:'Local documents',log:'Local startup log',version:'0.1.20'};
     case 'link_address':return'';case 'link_status':return false;case 'music_available':return false;case 'music_pause':return;case 'music_hide':return;case 'log_line':return;
     default:throw Error('Unexpected preview IPC: '+command);
    }
   }};
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(platform+': '+e.message));
  await page.goto('http://127.0.0.1:4180/'+(platform==='android'?'android/index.html':'workspace.html'));
  await page.locator('[data-view="home"]').waitFor();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Appearance"]')?.disabled===false);
  const nav=async id=>{await page.locator(`[data-view="${id}"]`).click();};
  if(platform==='android'){
   await page.getByLabel('Conversation title',{exact:true}).fill('A fresh perspective');
   await nav('writing');await page.getByLabel('Live Markdown writing',{exact:true}).fill('# Make room for ideas\n\nA good day starts with a little space to think.\n\n- Read something inspiring\n- Put one idea into words');
   await page.getByText('Saved on this device.',{exact:true}).waitFor();
   await nav('documents');await page.getByLabel('Choose a document',{exact:true}).setInputFiles({name:'Reading notes.txt',mimeType:'text/plain',buffer:Buffer.from('Make time for focused work and a moment to reflect.')});
   await page.getByText('Document added. Read it here or use its text in Writing.',{exact:true}).waitFor();
   await page.reload();await page.locator('[data-view="home"]').waitFor();
   assert.equal(await page.getByLabel('Conversation title',{exact:true}).inputValue(),'A fresh perspective');
  }
  assert.match(await page.title(),/AnF/);
  await nav('home');await page.locator('.dashboard-heading').waitFor({state:'visible'});
  assert.notEqual(await page.locator('.brand-mark').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  for(const theme of ['light','dark']){
   await nav('settings');await page.getByLabel('Appearance',{exact:true}).selectOption(theme);
   for(const width of platform==='windows'?[1440,1000,760]:[390,320,768]){
    await page.setViewportSize({width,height:platform==='windows'?1000:844});
    for(const id of ['home','chat','documents','writing','music','audio','settings']){
     await nav(id);
     await page.evaluate(()=>document.fonts.ready);
     const dimensions=await page.evaluate(()=>({body:document.body.scrollWidth,width:innerWidth,host:(document.querySelector('.panel-host')||document.querySelector('#app>main'))?.clientWidth,scroll:(document.querySelector('.panel-host')||document.querySelector('#app>main'))?.scrollWidth}));
     assert(dimensions.body<=dimensions.width+1,`${platform} ${theme} ${width} ${id}: page overflow ${JSON.stringify(dimensions)}`);
     assert(dimensions.scroll<=dimensions.host+1,`${platform} ${theme} ${width} ${id}: content overflow ${JSON.stringify(dimensions)}`);
     assert(!/\bCoucou\b/.test(await page.locator('body').innerText()),'Visible legacy brand');
     const buttons=page.locator(platform==='windows'?'.workspace-navigation button':'.bottom-nav button');assert.equal(await buttons.count(),7);
     if(width===(platform==='windows'?1440:390))await page.screenshot({path:path.join(out,`${platform}-${theme}-${id}.png`)});
     checks++;
    }
   }
  }
  await nav('writing');assert.match(await page.getByLabel('Live Markdown writing',{exact:true}).innerText(),/Make room for ideas/);
  // Preferences and stored drafts must survive the visual redesign and reload.
  await page.reload();await page.getByLabel('Appearance',{exact:true}).waitFor({state:'attached'});
  assert.equal(await page.getByLabel('Appearance',{exact:true}).inputValue(),'dark');
  await nav('writing');assert.match(await page.getByLabel('Live Markdown writing',{exact:true}).innerText(),/Make room for ideas/);
  if(platform==='android'){
   await page.getByRole('button',{name:'Open conversation history',exact:true}).click();
   await page.locator('.drawer').waitFor({state:'visible'});await page.getByRole('button',{name:'Close',exact:true}).click();
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log(`PASS: ${checks} rendered views; both themes, desktop/mobile widths, retained drafts/preferences, seven-section navigation and AnF branding.`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
