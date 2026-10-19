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
     case 'connection_list':return [];
     case 'workspace_list_projects':return[{id:current.id,name:current.name,updated:Date.now(),snippet:current.draft}];
     case 'workspace_load_project':return structuredClone(current);
     case 'workspace_save_project':current={...args.project,id:'fixture'};localStorage.setItem('anf-ui-qa',JSON.stringify(current));return structuredClone(current);
     case 'workspace_diagnostics':return{runtime:true,fast:true,balanced:true,ocr:true,totalRam:16000000000,freeRam:8000000000,documents:'Local documents',log:'Local startup log',version:'0.1.20'};
     case 'workspace_begin':return 1;case 'app_check_updates':return {available:true,message:'Version 0.1.26 is available.'};case 'app_export_diagnostics':return 'Support report.json';
     case 'workspace_ask':window.qaLastAsk=args;return {text:current.draft,notice:'Gateway fixture answer.',evidence:[]};
     case 'workspace_search_web':return[{title:'Useful source',snippet:'A useful page.',url:'https://example.org/guide?tracking='+('x'.repeat(4000))}];
     case 'open_url':window.qaOpenedUrl=args.url;return;
     case 'link_address':return'';case 'link_status':return false;case 'music_available':return false;case 'music_pause':return;case 'music_hide':return;case 'log_line':return;
     default:throw Error('Unexpected preview IPC: '+command);
    }
   }};
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(platform+': '+e.message));
  await page.goto('http://127.0.0.1:4180/'+(platform==='android'?'android/index.html':'workspace.html'));
  await page.locator('button[data-view="home"]').waitFor();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Appearance"]')?.disabled===false);
  if(platform==='windows'){
   const hub=page.getByLabel('Research, learning and connected tools',{exact:true});
   assert.equal(await hub.locator('[data-tool]').count(),8);
   assert.equal(await hub.getByText('Local · no API key',{exact:true}).count(),8);
   await hub.locator('[data-tool=notebook] summary').click();await hub.getByRole('button',{name:'Set up or open Open Notebook',exact:true}).click();
   await page.getByLabel('Open Notebook address',{exact:true}).waitFor({state:'visible'});
   assert.equal(await page.locator('[data-service="notebook"]').getAttribute('open'),'');
   await page.locator('.workspace-navigation [data-view="home"]').click();
   assert.equal(await page.locator('.panel-host').evaluate(el=>el.scrollTop),0);
   await hub.getByRole('button',{name:'Open Books → skills',exact:true}).click();
   await page.getByRole('button',{name:'Prepare skill draft in Chat',exact:true}).click();
   assert.match(await page.getByLabel('Your question',{exact:true}).inputValue(),/Markdown skill DRAFT/);
   await page.locator('button[data-view="chat"]').click();
   assert.equal(await page.locator('.task-tools').getAttribute('open'),null);
   assert.equal(await page.getByRole('button',{name:'Compare documents',exact:true}).count(),0);
   await page.getByText('Start a task',{exact:true}).click();
   const tasks=page.getByRole('combobox',{name:'Reading and writing task',exact:true});
   assert.equal(await tasks.locator('option').count(),8);
   await tasks.selectOption('skill');
   await page.getByRole('button',{name:'Prepare task',exact:true}).click();
   assert.match(await page.getByRole('textbox',{name:'Your question',exact:true}).inputValue(),/Markdown skill DRAFT/);
   assert.equal(await page.getByLabel('AI context',{exact:true}).inputValue(),'loaded');
   await tasks.selectOption('research');
   await page.getByRole('button',{name:'Prepare task',exact:true}).click();
   assert.match(await page.getByRole('textbox',{name:'Your question',exact:true}).inputValue(),/research brief/);
   await tasks.selectOption('podcast');
   await page.getByRole('button',{name:'Prepare task',exact:true}).click();
   assert.match(await page.getByRole('textbox',{name:'Your question',exact:true}).inputValue(),/Produce text only/);
   await tasks.selectOption('highlights');
   assert.equal(await page.getByRole('button',{name:'Continue to next part',exact:true}).isVisible(),false);
   await page.getByLabel('Answer provider',{exact:true}).selectOption('gateway');
   await page.getByLabel('Your question',{exact:true}).fill('Explain these source notes.');
   await page.getByRole('button',{name:'Ask selected AI',exact:true}).click();
   await page.waitForFunction(()=>window.qaLastAsk?.gateway===true);
   assert.equal((await page.evaluate(()=>window.qaLastAsk)).sources[0].name,'Reading notes.txt');
   await page.getByRole('button',{name:'Ask selected AI',exact:true}).waitFor({state:'visible'});
   await page.waitForFunction(()=>document.querySelector('[aria-label="Answer provider"]').disabled===false);
   await page.getByLabel('Answer provider',{exact:true}).selectOption('local');
   await page.getByText('Start a task',{exact:true}).click();
   assert.equal(await page.getByRole('button',{name:'Continue to next part',exact:true}).isVisible(),true);
   assert.equal(await page.locator('.studio-header-tools').getByRole('button',{name:'Settings',exact:true}).count(),0);
   await page.locator('button[data-view="documents"]').click();
   await page.getByLabel('Search the web',{exact:true}).check();
   await page.getByLabel('Public web search terms',{exact:true}).fill('source');
   await page.getByRole('button',{name:'Search web',exact:true}).click();
   await page.getByText('Useful source',{exact:true}).waitFor();
   assert.equal(await page.locator('.source-domain').innerText(),'example.org');
   await page.getByRole('button',{name:'Open website',exact:true}).click();
   assert.match(await page.evaluate(()=>window.qaOpenedUrl),/\?tracking=x{4000}$/);
  }
  const nav=async id=>{if(platform==='windows'){const group=id==='writing'?'documents':id==='audio'?'music':id;await page.locator('.workspace-navigation [data-view="'+group+'"]').click();if(group!==id)await page.locator('.context-tabs [data-view="'+id+'"]').click();}else await page.locator('button[data-view="'+id+'"]').click();};
  if(platform==='android'){
   await page.getByLabel('Conversation title',{exact:true}).fill('A fresh perspective');
   await nav('writing');await page.getByLabel('Live Markdown writing',{exact:true}).fill('# Make room for ideas\n\nA good day starts with a little space to think.\n\n- Read something inspiring\n- Put one idea into words');
   await page.getByText('Saved on this device.',{exact:true}).waitFor();
   await nav('documents');await page.getByLabel('Choose a document',{exact:true}).setInputFiles({name:'Reading notes.txt',mimeType:'text/plain',buffer:Buffer.from('Make time for focused work and a moment to reflect.')});
   await page.getByText('Document added. Read it here or use its text in Writing.',{exact:true}).waitFor();
   await page.reload();await page.locator('button[data-view="home"]').waitFor();
   assert.equal(await page.getByLabel('Conversation title',{exact:true}).inputValue(),'A fresh perspective');
   await nav('chat');
   await page.getByRole('combobox',{name:'Reading and writing task',exact:true}).selectOption('skill');
   await page.getByRole('button',{name:'Prepare task',exact:true}).click();
   assert.match(await page.getByRole('textbox',{name:'Your question',exact:true}).inputValue(),/Markdown skill DRAFT/);
   assert.equal(await page.getByLabel('AI context',{exact:true}).inputValue(),'loaded');
   // Preparing a source task must not opt into document sharing with the PC.
   assert.equal(await page.getByLabel('Include document text when syncing',{exact:true}).isChecked(),false);
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
     if(platform==='windows'&&id==='music'){
      const background=await page.locator('.music-hub').evaluate(el=>getComputedStyle(el).backgroundColor);
      const channels=background.match(/\d+/g).slice(0,3).map(Number);
      assert.equal(channels.reduce((a,b)=>a+b,0)/3>150,theme==='light','Music must follow the workspace appearance');
     }
     await page.evaluate(()=>document.fonts.ready);
     const dimensions=await page.evaluate(()=>({body:document.body.scrollWidth,width:innerWidth,host:(document.querySelector('.panel-host')||document.querySelector('#app>main'))?.clientWidth,scroll:(document.querySelector('.panel-host')||document.querySelector('#app>main'))?.scrollWidth}));
     assert(dimensions.body<=dimensions.width+1,`${platform} ${theme} ${width} ${id}: page overflow ${JSON.stringify(dimensions)}`);
     assert(dimensions.scroll<=dimensions.host+1,`${platform} ${theme} ${width} ${id}: content overflow ${JSON.stringify(dimensions)}`);
     assert(!/\bAnF\b/.test(await page.locator('body').innerText()),'Visible legacy brand');
     const buttons=page.locator(platform==='windows'?'.workspace-navigation button':'.bottom-nav button');assert.equal(await buttons.count(),platform==='windows'?5:7);
     if(width===(platform==='windows'?1440:390))await page.screenshot({path:path.join(out,`${platform}-${theme}-${id}.png`)});
     checks++;
    }
   }
  }
  if(platform==='windows'){
   await nav('home');assert.equal(await page.getByLabel('Search saved conversations',{exact:true}).isVisible(),false);assert.equal(await page.getByLabel('Project name',{exact:true}).isVisible(),false);
   await nav('chat');assert.equal(await page.getByLabel('Search saved conversations',{exact:true}).isVisible(),true);
   await nav('settings');await page.getByRole('button',{name:'Check for updates',exact:true}).click();await page.getByText('Version 0.1.26 is available.',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Export support report',exact:true}).click();await page.getByText('Support report saved: Support report.json',{exact:true}).waitFor();
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
