// Regression: the docked music player must not overlap the left sidebar (rail) at common desktop sizes.
// Drives the real built workspace (windows/dist) in a browser with a stubbed Tauri IPC and synthetic WAV tracks.
// Browser fixture only: it does not replace installed-app QA. Run `npm run build` in windows/ first.
// Optional: SHOT_DIR=<dir> writes screenshots (SHOT_TAG prefixes names); DIST_DIR=<dir> serves another build; CHROMIUM_BIN=<path> picks a browser (default: msedge channel).
import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const shots=process.env.SHOT_DIR;if(shots)await mkdir(shots,{recursive:true});
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const base=path.resolve(process.env.DIST_DIR||path.join(root,'windows/dist'));const file=path.resolve(base,decodeURIComponent(url.pathname.slice(1)));if(!file.startsWith(base+path.sep))throw Error('Path');res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.wasm':'application/wasm'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const browser=await chromium.launch(process.env.CHROMIUM_BIN?{executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required'],headless:true}:{channel:'msedge',args:['--autoplay-policy=no-user-gesture-required'],headless:true});
const errors=[],failures=[];
try{
 const context=await browser.newContext({viewport:{width:1920,height:1080},colorScheme:'dark'});
 await context.addInitScript(()=>{
   let current={id:'fixture',name:'Music QA',title:'Saved work',draft:'Existing writing',question:'',history:[],sources:[],memory:'',model:'fast'};
   window.__TAURI_INTERNALS__={invoke:async(command,args={})=>{switch(command){case 'workspace_list_projects':return[{id:'fixture',name:'Music QA',updated:Date.now()}];case 'workspace_load_project':return current;case 'workspace_save_project':current=args.project;return current;case 'workspace_diagnostics':return{runtime:true,fast:true,balanced:true,ocr:true,documents:'Local',log:'Fixture',version:'0.1.20'};case 'link_address':return'';case 'link_status':return false;case 'music_available':return false;case 'music_pause':return;case 'music_hide':return;case 'log_line':return;default:throw Error('Unexpected IPC '+command);}}};
  });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/workspace.html`);await page.locator('[data-view="music"]').waitFor({state:'attached'});
  await page.evaluate(async()=>{
   const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('coucou-audio',2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   // Test-only fictional titles and synthetic WAVs; production has no demo catalogue.
   const titles=['Quiet Hours','City Signals','Morning Light','Slow Sunday','Open Roads','Night Garden'],artists=['Lina Vale','Theo Marks','Elise Monroe','Jasper Kai','Marco Lee','Nora Fields'];
   const bytes=new ArrayBuffer(44+16000*10);const view=new DataView(bytes);const text=(at,s)=>Array.from(s).forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));text(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,bytes.byteLength-44,true);
   for(let i=44;i<bytes.byteLength;i+=2)view.setInt16(i,Math.sin((i-44)*.15)*1000,true);
   const tx=db.transaction('tracks','readwrite');for(let i=0;i<6;i++){const hue=[270,195,35,60,160,130][i];const cover=new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><defs><linearGradient id="a" x2=".8" y2="1"><stop stop-color="hsl(${hue},45%,55%)"/><stop offset="1" stop-color="#0c1719"/></linearGradient></defs><path fill="url(#a)" d="M0 0h500v500H0z"/><circle cx="350" cy="145" r="45" fill="#fff" opacity=".45"/><path d="M0 320 160 170 300 320 430 220 500 330v170H0" fill="#102328" opacity=".8"/><path d="M0 370h500v130H0" fill="#7cadad" opacity=".12"/></svg>`],{type:'image/svg+xml'});tx.objectStore('tracks').put({id:'qa-'+i,name:titles[i]+'.wav',title:titles[i],artist:artists[i],album:'QA collection',created:100-i,blob:new Blob([bytes],{type:'audio/wav'}),cover,duration:10});}await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  });
 await page.reload();await page.locator('.mode-rail [data-mode="listen"]').click();await page.locator('[data-view="music"]').click();await page.locator('.music-card').first().waitFor();
 await page.locator('.music-card-play[aria-label="Play Morning Light"]').click();await page.locator('.music-player button[aria-label="Pause"]').waitFor();
 // A long title, as in the report, to prove it is not clipped by the sidebar.
 await page.evaluate(()=>{const s=document.querySelector('.music-player:not(.music-full-player) .music-now-info strong');if(s)s.textContent='Web Audio Long Track Title Example';});
 const measure=()=>page.evaluate(()=>{
  const r=e=>{const b=e.getBoundingClientRect();return{left:b.left,top:b.top,right:b.right,bottom:b.bottom};};
  const rail=document.querySelector('.history-sidebar'),player=document.querySelector('.music-player:not(.music-full-player)'),title=player.querySelector('.music-now-info strong'),list=rail.querySelector('.history-list,.project-history,[class*=history]:not(.history-sidebar)');
  const t=r(title),p=r(player),s=r(rail);
  const hit=document.elementFromPoint(t.left+4,(t.top+t.bottom)/2);
  const cs=getComputedStyle(player);return{cs:{left:cs.left,right:cs.right,w:cs.width,ml:cs.marginLeft,mr:cs.marginRight,maxw:cs.maxWidth},rail:s,player:p,title:t,railState:rail.dataset.rail,titleCovered:!player.contains(hit),overlap:Math.min(p.right,s.right)>Math.max(p.left,s.left)&&Math.min(p.bottom,s.bottom)>Math.max(p.top,s.top)};
 });
 for(const [width,height] of [[1920,1080],[1366,768],[1024,768]]){
  await page.setViewportSize({width,height});
  for(const state of ['collapsed','open']){
   // 'open' is the hover/focus state of the floating rail; 'collapsed' is the idle state after 4 s.
   if(state==='open')await page.locator('.history-sidebar').hover();else{await page.mouse.move(width-40,height/2);await page.evaluate(()=>{document.querySelector('.history-sidebar').dataset.rail='collapsed';});}
   await page.waitForTimeout(1000);
   const m=await measure();
   if(shots)await page.screenshot({path:path.join(shots,`${process.env.SHOT_TAG||'run'}-${width}x${height}-${state}.png`)});
   failures.push(...[!m.overlap?'':`Player overlaps sidebar at ${width}x${height} (${state}): ${JSON.stringify(m)}`,!m.titleCovered?'':`Player title covered at ${width}x${height} (${state})`].filter(Boolean));
   if(0)assert(!m.overlap,`Player overlaps sidebar at ${width}x${height} (${state}): ${JSON.stringify(m)}`);
   if(0)assert(!m.titleCovered,`Player title covered at ${width}x${height} (${state}): ${JSON.stringify(m)}`);
  }
 }
 assert.deepEqual(failures,[]);
 assert.deepEqual(errors,[]);
 console.log('PASS: docked music player clears the sidebar (open and collapsed) at 1920x1080, 1366x768 and 1024x768. Browser fixture with synthetic tracks, not the installed app.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
