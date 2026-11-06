// Fixture check for the "End of chapter" sleep timer (docs/specs/sleep-end-of-chapter.md).
// Serves windows/dist, seeds one synthetic WAV with chapter markers, stubs IPC. Not an installed-app test.
import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const base=path.join(root,'windows/dist');
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const file=path.resolve(base,decodeURIComponent(url.pathname.slice(1)));if(!file.startsWith(base+path.sep))throw Error('Path');res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.wasm':'application/wasm'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(4183,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BIN||'/usr/bin/chromium',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required'],headless:true});
const errors=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark'});
 await context.addInitScript(()=>{
  const NativeAudio=window.Audio;window.Audio=function(...a){const e=new NativeAudio(...a);(window.__audios||=[]).push(e);return e;};
  let current={id:'fixture',name:'Sleep QA',title:'Saved work',draft:'',question:'',history:[],sources:[],memory:'',model:'fast'};
  window.__TAURI_INTERNALS__={invoke:async(command,args={})=>{switch(command){case 'workspace_list_projects':return[{id:'fixture',name:'Sleep QA',updated:Date.now()}];case 'workspace_load_project':return current;case 'workspace_save_project':current=args.project;return current;case 'workspace_diagnostics':return{runtime:true,fast:true,balanced:true,ocr:true,documents:'Local',log:'Fixture',version:'0.1.47'};case 'link_address':return'';case 'link_status':return false;case 'music_available':return false;case 'music_pause':return;case 'music_hide':return;case 'log_line':return;default:throw Error('Unexpected IPC '+command);}}};
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4183/workspace.html');await page.locator('[data-view="music"]').waitFor({state:'attached'});
 await page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('coucou-audio',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const seconds=12,rate=8000,bytes=new ArrayBuffer(44+rate*2*seconds),view=new DataView(bytes);const text=(at,s)=>Array.from(s).forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
  text(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,bytes.byteLength-44,true);
  for(let i=44;i<bytes.byteLength;i+=2)view.setInt16(i,Math.sin((i-44)*.15)*1000,true);
  const tx=db.transaction('tracks','readwrite');
  // Test-only fictional titles. Chapters at 0 s, 4 s and 8 s; the plain track has none.
  tx.objectStore('tracks').put({id:'qa-book',name:'Book.wav',title:'Chapter Book',artist:'QA Narrator',album:'QA',created:200,blob:new Blob([bytes],{type:'audio/wav'}),duration:seconds,chapters:[{title:'One',start:0},{title:'Two',start:4},{title:'Three',start:8}]});
  tx.objectStore('tracks').put({id:'qa-plain',name:'Plain.wav',title:'Plain Song',artist:'QA Artist',album:'QA',created:100,blob:new Blob([bytes],{type:'audio/wav'}),duration:seconds});
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
 });
 await page.reload();await page.locator('.mode-rail [data-mode="listen"]').click();await page.locator('[data-view="music"]').click();await page.locator('.music-card').first().waitFor();
 const dock=page.locator('.music-player');
 const sleepSelect=dock.getByLabel('Sleep timer',{exact:true});
 assert.deepEqual(await sleepSelect.locator('option').allTextContents(),['Off','15 min','30 min','45 min','60 min','End of track','End of chapter']);
 // Chapters: pause at 4 s, not at the end of the 12 s file.
 await page.locator('.music-card-play[aria-label="Play Chapter Book"]').click();await dock.locator('button[aria-label="Pause"]').waitFor();
 await page.getByRole('button',{name:'Open full player',exact:true}).click();await page.getByRole('dialog',{name:'Now playing'}).waitFor();
 await page.locator('.music-chip[data-sleep="chapter"]:visible').first().click();
 await dock.locator('button[aria-label="Play"]').waitFor({timeout:8000});
 const stopped=await page.evaluate(()=>window.__audios.find(a=>a.src).currentTime);
 assert(stopped>=3.6&&stopped<5.5,'paused at the end of chapter one, got '+stopped);
 assert.equal(await sleepSelect.inputValue(),'0','timer returns to Off');
 // Chip path and the no-chapter fallback.
 await page.getByRole('button',{name:'Close player',exact:true}).click();
 await page.locator('.music-card-play[aria-label="Play Plain Song"]').click();await dock.locator('button[aria-label="Pause"]').waitFor();
 await page.getByRole('button',{name:'Open full player',exact:true}).click();await page.getByRole('dialog',{name:'Now playing'}).waitFor();
  await page.locator('.music-chip[data-sleep="chapter"]:visible').first().click();
 assert.equal(await sleepSelect.inputValue(),'end','falls back to end of track without chapters');
 await page.getByText('No chapters in this track',{exact:false}).first().waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: End of chapter sleep timer pauses at the chapter boundary, resets to Off, and falls back to End of track without chapters (synthetic WAV fixture).');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
