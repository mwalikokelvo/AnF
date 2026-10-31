// Native WebView/Tauri check against an explicitly supplied isolated QA build.
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
assert(process.env.ANF_QA_EXE,'Set ANF_QA_EXE to a build using the QA application identifier.');
const root=fileURLToPath(new URL('../../',import.meta.url)),workspace=path.dirname(root);
const profile=path.join(workspace,'.tools','native-connect-qa-'+randomUUID());await mkdir(profile,{recursive:true});
const expected=JSON.parse(await readFile(path.join(root,'windows/package.json'),'utf8')).version;
const wires=[];
const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;wires.push({url:req.url,auth:req.headers.authorization,body});res.setHeader('Content-Type','application/json');
 res.end(JSON.stringify(req.url==='/v1/models'?{data:[{id:'qa-model'}]}:{choices:[{message:{content:'Native gateway fixture answer.'}}]}));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const child=spawn(process.env.ANF_QA_EXE,[],{env:{...process.env,APPDATA:profile,LOCALAPPDATA:profile,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9224 --remote-debugging-address=127.0.0.1'},stdio:'ignore',windowsHide:true});
let browser,page,created=false;
try{
 const until=Date.now()+45000;
 while(Date.now()<until&&!page){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9224');page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('workspace.html'));if(!page){await browser.close();browser=undefined;}}catch{/* WebView is starting. */}if(!page)await new Promise(r=>setTimeout(r,500));}
 assert(page,'QA workspace did not start.');
 const invoke=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
 assert.equal((await invoke('workspace_diagnostics')).version,expected);
 const initial=await invoke('connection_list');
 // OS credential storage is user-wide: never overwrite a real saved connection.
 if(!initial.some(v=>v.service==='gateway')){
  const saved=await invoke('connection_save',{input:{service:'gateway',endpoint:`http://127.0.0.1:${server.address().port}/v1`,model:'qa-model',enabled:true,secret:'qa-only-token'}});created=true;
  assert.equal(saved.hasSecret,true);assert(!JSON.stringify(saved).includes('qa-only-token'));
  assert.match((await invoke('connection_action',{action:{service:'gateway',operation:'test'}})).message,/model catalog reached/);
  const job=await invoke('workspace_begin');
  const answer=await invoke('workspace_ask',{job,query:'Explain the supplied evidence.',sources:[{name:'QA source',text:'Known evidence.',pages:[],path:null}],history:[],memory:'',model:'fast',gateway:true});
  assert.equal(answer.text,'Native gateway fixture answer.');assert.match(answer.notice,/gateway/);
  assert(wires.every(w=>w.auth==='Bearer qa-only-token'));assert(wires.some(w=>w.url==='/v1/chat/completions'&&w.body.includes('Known evidence')));
  const again=await invoke('connection_list');assert(!JSON.stringify(again).includes('qa-only-token'));
 }else console.log('Existing gateway preserved; credential write and live native gateway fixture skipped.');
 let island;
 for(let attempt=0;attempt<25&&!island;attempt++){
  island=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('http')&&!p.url().includes('workspace.html')&&!p.url().includes('settings.html'));
  if(!island)await new Promise(r=>setTimeout(r,200));
 }
 assert(island,'Floating QA window did not finish navigating.');
 await island.locator('#island').waitFor({state:'attached'});
 if(island){
  const denied=await island.evaluate(()=>window.__TAURI_INTERNALS__.invoke('connection_list').then(()=>false,()=>true));assert.equal(denied,true);
  const gatewayDenied=await island.evaluate(()=>window.__TAURI_INTERNALS__.invoke('workspace_ask',{job:0,query:'No network request should run.',sources:[],history:[],memory:'',model:'fast',gateway:true}).then(()=>false,error=>String(error).includes('workspace')));
  assert.equal(gatewayDenied,true);
 }
 const files=[{name:'SKILL.md',text:'---\nname: qa-skill\ndescription: Test fixture.\n---\n\nQA skill.'},{name:'draft.md',text:'Reviewed fixture.'},{name:'coverage.json',text:'{"coverage":"not verified"}'},{name:'references/source-1.md',text:'Known evidence.'}];
 const calendar='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';const calendarPath=await invoke('workspace_save',{title:'QA calendar',text:calendar,format:'ics'});assert.equal(await readFile(calendarPath,'utf8'),calendar);
 const svg='<svg xmlns="http://www.w3.org/2000/svg"><text>QA storyboard</text></svg>';const svgPath=await invoke('workspace_save',{title:'QA storyboard',text:svg,format:'svg'});assert.equal(await readFile(svgPath,'utf8'),svg);
 const archive=await invoke('workspace_export_skill',{files});const zip=await readFile(archive);assert.equal(zip.readUInt32LE(0),0x04034b50);assert(zip.includes(Buffer.from('references/source-1.md')));
 await page.locator('.workspace-navigation [data-view="settings"]').click();
 await page.getByLabel('Connected services',{exact:true}).locator(':scope>summary').click();
 await page.getByText('Connections loaded. Choose a service to configure or use it.',{exact:true}).waitFor();
 await page.locator('.workspace-navigation [data-view="home"]').click();
 const hub=page.getByLabel('Research, learning and connected tools',{exact:true});
 assert.equal(await hub.locator('[data-tool]').count(),8);
 await hub.locator('[data-tool=notebook] summary').click();await hub.getByRole('button',{name:'Set up or open Open Notebook',exact:true}).click();
 await page.getByLabel('Open Notebook address',{exact:true}).waitFor({state:'visible'});
 await page.locator('.workspace-navigation [data-view="home"]').click();
 await hub.getByRole('button',{name:'Open Books → skills',exact:true}).click();
 await page.getByRole('button',{name:'Prepare skill draft in Chat',exact:true}).click();
 await page.getByText('Add a readable document first, then return to Books → skills on Home.',{exact:true}).waitFor();
 await page.locator('.workspace-navigation [data-view="home"]').click();
 await hub.getByRole('button',{name:'Open Writing review',exact:true}).click();
 assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Review writing style');
 await page.locator('.workspace-navigation [data-view="home"]').click();
 assert.equal(await page.locator('.panel-host').evaluate(el=>el.scrollTop),0);
 const voiceCount=await page.evaluate(()=>window.speechSynthesis?.getVoices().filter(v=>v.localService).length||0);console.log('Installed offline reading voices reported by WebView2: '+voiceCount);
 const readingSource={name:'Native reader fixture',text:'First native page.\n\nSecond native page.',pages:[{number:1,text:'First native page.',ocr:false},{number:2,text:'Second native page.',ocr:false}],path:null};
 await invoke('workspace_save_project',{project:{id:'',name:'QA reader',title:'QA reader',question:'',draft:'',history:[],sources:[readingSource],memory:'',model:'fast'}});
 await page.reload();await page.locator('.workspace-navigation [data-view="documents"]').waitFor();await page.waitForFunction(()=>document.querySelector('[aria-label="Appearance"]')?.disabled===false);
 await page.locator('.workspace-navigation [data-view="documents"]').click();await page.getByRole('button',{name:'Open reader',exact:true}).click();await page.getByText(/Page 1 of 2/).waitFor();
 const inlineReader=page.locator('#panel-documents .reader-inline');
 assert.equal(await inlineReader.isVisible(),true);
 assert.equal(await inlineReader.evaluate(el=>getComputedStyle(el).position),'relative');
 assert.equal(await page.locator('[role="dialog"] .reader-inline,[aria-modal="true"] .reader-inline').count(),0);
 assert.equal(await page.evaluate(()=>document.body.dataset.view),'documents');
 assert.equal(await page.locator('.workspace-navigation').isVisible(),true);
 await inlineReader.getByRole('button',{name:'Read aloud',exact:true}).click();
 assert.equal(await inlineReader.getByLabel('Document read aloud',{exact:true}).isVisible(),true);
 await inlineReader.getByRole('button',{name:'Stop',exact:true}).click();
 assert.equal(await page.locator('.reader-page').textContent(),'First native page.\n\n');await page.getByText('Find in document',{exact:true}).click();await page.getByRole('searchbox',{name:'Find in document'}).fill('Second');await page.getByRole('button',{name:'Find next',exact:true}).click();await page.getByText(/Page 2 of 2/).waitFor();
 await page.screenshot({path:path.join(profile,'reader-native.png')});
 await page.locator('.workspace-navigation [data-view="home"]').click();
 assert.equal(await inlineReader.isVisible(),false);
 assert.equal(await inlineReader.locator('.speech-player').getAttribute('data-state'),'stopped');
 await page.locator('.workspace-navigation [data-view="documents"]').click();
 await page.getByRole('button',{name:'Open reader',exact:true}).click();
 await page.getByText(/Page 2 of 2/).waitFor();
 await page.getByRole('button',{name:'Close reader',exact:true}).click();
 const job=await invoke('workspace_begin');const pdfSource=await invoke('workspace_read_file',{job,path:path.join(root,'windows/src-tauri/tests/data/simple.pdf')});
 const pdfProject=await invoke('workspace_save_project',{project:{id:'',name:'QA original pages',title:'Original PDF',question:'',draft:'',history:[],sources:[pdfSource],memory:'',model:'fast'}});
 const forged=await invoke('workspace_save_project',{project:{id:'',name:'QA denied source',title:'Denied',question:'',draft:'',history:[],sources:[{...pdfSource,path:path.join(root,'windows/src-tauri/tests/data/simple.pdf')}],memory:'',model:'fast'}});await assert.rejects(()=>invoke('workspace_pdf_page',{projectId:forged.id,sourceIndex:0,page:1}));
 // Put the valid retained source back at the top of the recent-project list.
 await invoke('workspace_save_project',{project:{...pdfProject,name:'QA original pages'}});
 const bitmap=await invoke('workspace_pdf_page',{projectId:pdfProject.id,sourceIndex:0,page:1});assert(bitmap.startsWith('data:image/png;base64,'));assert(Buffer.from(bitmap.split(',')[1],'base64').subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
 await assert.rejects(()=>invoke('workspace_pdf_page',{projectId:pdfProject.id,sourceIndex:0,page:0}));await assert.rejects(()=>invoke('workspace_pdf_page',{projectId:pdfProject.id,sourceIndex:0,page:601}));
 const deniedPdf=await island.evaluate(({id})=>window.__TAURI_INTERNALS__.invoke('workspace_pdf_page',{projectId:id,sourceIndex:0,page:1}).then(()=>false,()=>true),{id:pdfProject.id});assert.equal(deniedPdf,true);
 await page.reload();await page.locator('.workspace-navigation [data-view="documents"]').waitFor();await page.waitForFunction(()=>document.querySelector('[aria-label="Appearance"]')?.disabled===false);
 // Fixture saves can share a timestamp. Select the retained PDF explicitly.
 await page.locator('.workspace-navigation [data-view="chat"]').click();await page.locator('.history-item').filter({hasText:'QA original pages'}).click();await page.getByText('Reopened saved project.',{exact:true}).waitFor();await page.locator('.workspace-navigation [data-view="documents"]').click();await page.getByRole('heading',{name:pdfSource.name,exact:true}).first().waitFor();await page.getByRole('button',{name:'Open reader',exact:true}).click();
 await page.getByLabel('Document view',{exact:true}).selectOption('original');await page.waitForFunction(()=>document.querySelector('.reader-original-image')?.naturalWidth>0&&!document.querySelector('.reader-original-image').hidden);
 if(await page.locator('.reader-search-drawer').getAttribute('open')!==null)await page.getByText('Find in document',{exact:true}).click();
 assert(await page.locator('.reader-original-image').evaluate(el=>el.naturalWidth<=1600&&el.naturalHeight<=2400));await page.screenshot({path:path.join(profile,'original-pdf-native.png')});
 await page.getByLabel('Original page zoom',{exact:true}).selectOption('150');await page.getByLabel('Document view',{exact:true}).selectOption('text');assert.equal(await page.locator('.reader-page').isVisible(),true);await page.getByRole('button',{name:'Close reader',exact:true}).click();
 console.log('PASS: real Windows original PDF image, bounded dimensions, invalid-page and non-workspace denial, and original/text switching.');
 const playlistText=JSON.stringify({format:'anf-playlist-1',name:'Native export',tracks:[{title:'Fixture',artist:'Local',name:'fixture.wav'}]});const playlistPath=await invoke('workspace_save',{title:'QA playlist',text:playlistText,format:'json'});assert.equal(await readFile(playlistPath,'utf8'),playlistText);assert(playlistPath.endsWith('.json'));await assert.rejects(()=>invoke('workspace_save',{title:'QA playlist',text:'x'.repeat(200001),format:'json'}));
 await page.evaluate(()=>localStorage.setItem('anf-music-source','local'));await page.reload();await page.locator('.workspace-navigation [data-view="music"]').waitFor();await page.waitForFunction(()=>document.querySelector('[aria-label="Appearance"]')?.disabled===false);await page.locator('.workspace-navigation [data-view="music"]').click();await page.getByLabel('Content type',{exact:true}).selectOption('audiobook');await page.getByText('Import & playback options',{exact:true}).click();await page.getByLabel('Playback speed',{exact:true}).selectOption('1.5');await page.getByRole('button',{name:'Listening recap',exact:true}).click();await page.getByRole('dialog',{name:'Listening recap',exact:true}).waitFor();await page.getByRole('button',{name:'Close recap',exact:true}).click();await page.screenshot({path:path.join(profile,'listening-native.png')});console.log('PASS: native JSON playlist export bytes/limit and visible local listening controls.');
 await page.screenshot({path:path.join(profile,'connections-native.png')});
 await writeFile(path.join(profile,'verified-skill-path.txt'),archive);
 console.log('PASS: native connection command authorization, Credential Manager round trip, gateway HTTP request and source context, and real skill ZIP export. QA profile: '+profile);
}finally{
 if(created&&page)await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('connection_forget',{service:'gateway'})).catch(()=>console.error('Remove the QA-only gateway entry from Connected services.'));
 await browser?.close();child.kill();await new Promise(r=>server.close(r));
}
