// Browser fixture (stubbed Tauri IPC and stubbed network) for pasted streaming links in Music Hub > Streaming.
// It exercises the real built UI (windows/dist; run `npx vite build` in windows/ first). It does NOT contact YouTube
// or any Piped instance: every https request is answered by this script, so live YouTube resolution is not tested here.
import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const base=path.join(root,'windows/dist');
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const file=path.resolve(base,decodeURIComponent(url.pathname.slice(1)));if(!file.startsWith(base+path.sep))throw Error('Path');res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.wasm':'application/wasm'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(4182,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BIN||'/usr/bin/chromium',args:['--no-sandbox'],headless:true});
const YT='https://www.youtube.com/watch?v=zn1FHSWPaTk';
const errors=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark'});
 await context.addInitScript(()=>{
  let current={id:'fixture',name:'Stream QA',title:'Saved work',draft:'',question:'',history:[],sources:[],memory:'',model:'fast'};
  window.__TAURI_INTERNALS__={invoke:async(command,args={})=>{switch(command){case 'workspace_list_projects':return[{id:'fixture',name:'Stream QA',updated:Date.now()}];case 'workspace_load_project':return current;case 'workspace_save_project':current=args.project;return current;case 'workspace_diagnostics':return{runtime:true,fast:true,balanced:true,ocr:true,documents:'Local',log:'Fixture',version:'0.1.20'};case 'link_address':return'';case 'link_status':return false;case 'music_available':return false;case 'music_pause':return;case 'music_hide':return;case 'log_line':return;case 'safe_fetch_audio':throw 'That address did not return audio.';default:throw Error('Unexpected IPC '+command);}}};
 });
 const outbound=[];
 await context.route(/^https:\/\//,route=>{
  const u=new URL(route.request().url());outbound.push(route.request().method()+' '+u.href);
  if(u.hostname==='example.org')return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<html><body>not audio</body></html>'});
  return route.fulfill({status:503,contentType:'text/plain',body:'busy'});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4182/workspace.html');
 await page.locator('[role="tab"][data-mode="listen"]').click();
 await page.locator('[data-view="music"]').click();
 await page.getByRole('tab',{name:'Streaming',exact:true}).click();
 const notice=()=>page.locator('.music-notice').first();
 const direct=page.getByLabel('Direct stream link');
 const search=page.locator('.music-stream-search input');
 const state=()=>page.evaluate(()=>({recent:JSON.parse(localStorage.getItem('anf-music-player')||'{}').recent||[],tracks:document.querySelectorAll('.music-card').length,body:document.body.innerText}));
 const assertClean=async(label)=>{const s=await state();assert.deepEqual(s.recent,[],label+': recent entries were created');assert.doesNotMatch(s.body,/Web Audio Stream|Direct Stream|text\/html/,label+': bogus entry or html format on screen');assert.doesNotMatch(s.body,/Error: Could not extract/,label+': raw error text');};

 // 1. Lookups off (default): both entry points explain how to enable them and contact nothing.
 await direct.fill(YT);await page.getByRole('button',{name:'Play URL',exact:true}).click();
 await page.getByText(/Turn on "Online lookups" in the Music Hub header/).first().waitFor();await assertClean('play, lookups off');
 await search.fill(YT);await page.getByRole('button',{name:'Search',exact:true}).click();
 await page.getByText(/Turn on "Online lookups" in the Music Hub header/).first().waitFor();await assertClean('search, lookups off');
 assert.deepEqual(outbound,[],'requests were sent with lookups off: '+outbound.join(', '));

 // 2. Lookups on, every instance busy: plain message, still no entries; only listed hosts contacted, no youtube.com.
 await page.getByLabel('Online lookups').check();
 await page.getByRole('button',{name:'Play URL',exact:true}).click();
 await page.getByText(/YouTube stream could not be resolved right now/).first().waitFor();await assertClean('play, instances busy');
 await search.fill(YT);await page.getByRole('button',{name:'Search',exact:true}).click();
 await page.getByText(/YouTube stream could not be resolved right now/).first().waitFor();await assertClean('search, instances busy');
 const hosts=new Set(outbound.map(x=>new URL(x.split(' ')[1]).hostname));
 for(const h of hosts)assert.ok(['pipedapi.kavin.rocks','pipedapi.leptons.xyz','piped-api.privacy.com.de','pipedapi.adminforge.de','inv.nadeko.net','invidious.nerdvpn.de'].includes(h),'unexpected host '+h);

 // 3. A link that answers with an HTML page is refused before playback and before saving.
 await direct.fill('https://example.org/stream');await page.getByRole('button',{name:'Play URL',exact:true}).click();
 await page.getByText(/not audio, so it was not played or saved/).first().waitFor();await assertClean('play, html response');
 await page.getByRole('button',{name:'Save Offline',exact:true}).click();
 await page.getByText(/not audio, so it was not played or saved/).first().waitFor();await assertClean('save, html response');
 await page.getByRole('tab',{name:'Cached Offline',exact:true}).click().catch(()=>page.getByRole('button',{name:'Cached Offline'}).click());
 await page.getByText('Offline cached streams (0)').waitFor();
 assert.deepEqual(errors,[],'page errors: '+errors.join(' | '));
 console.log('PASS: pasted YouTube/HTML links in Streaming give clear messages, create no entries, and respect the Online lookups gate (stubbed network; no live YouTube).');
}finally{await browser.close();server.close();}
