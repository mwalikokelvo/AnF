import {chromium} from 'playwright-core';
import {navigateWorkspace} from './navigation.mjs';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=path.join(root,'releases/music-hub-previews');await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const mobile=url.pathname.startsWith('/android/');const base=mobile?path.join(root,'android/build/assets/web'):path.resolve(process.env.DIST_DIR||path.join(root,'windows/dist'));const file=path.resolve(base,decodeURIComponent(mobile?url.pathname.slice(9):url.pathname.slice(1)));if(!file.startsWith(base+path.sep))throw Error('Path');res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.wasm':'application/wasm'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(4181,'127.0.0.1',resolve));
// Same browser choice as fixture.mjs: CHROMIUM_BIN=<path>, else the msedge channel.
const browser=await chromium.launch({...(process.env.CHROMIUM_BIN?{executablePath:process.env.CHROMIUM_BIN}:{channel:'msedge'}),args:['--no-sandbox','--autoplay-policy=no-user-gesture-required'],headless:true});
const errors=[];
try{
 for(const platform of ['windows','android']){
  // The Android pass needs the packaged web assets (scripts/build-android.mjs); without them only the Windows pass runs.
  if(platform==='android'&&!existsSync(path.join(root,'android/build/assets/web/index.html'))){console.log('SKIP android: android/build/assets/web is not built');continue;}
  console.log('Testing '+platform);
  const context=await browser.newContext({viewport:{width:platform==='windows'?1440:390,height:platform==='windows'?1000:844},colorScheme:'dark'});
  await context.addInitScript(()=>{window.qaAudios=[];const NativeAudio=window.Audio;window.Audio=new Proxy(NativeAudio,{construct(target,args){const audio=new target(...args);window.qaAudios.push(audio);return audio;}});});
  if(platform==='windows')await context.addInitScript(()=>{
   let current={id:'fixture',name:'Music QA',title:'Saved work',draft:'Existing writing',question:'',history:[],sources:[],memory:'',model:'fast'};
   window.__TAURI_INTERNALS__={invoke:async(command,args={})=>{switch(command){case 'workspace_list_projects':return[{id:'fixture',name:'Music QA',updated:Date.now()}];case 'workspace_load_project':return current;case 'workspace_save_project':current=args.project;return current;case 'workspace_diagnostics':return{runtime:true,fast:true,balanced:true,ocr:true,documents:'Local',log:'Fixture',version:'0.1.20'};case 'link_address':return'';case 'link_status':return false;case 'music_available':return false;case 'music_pause':return;case 'music_hide':return;case 'workspace_save':window.lastPlaylistExport=args.text;return 'fixture/playlist.json';case 'log_line':return;default:throw Error('Unexpected IPC '+command);}}};
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(platform+': '+e.message));
  const url='http://127.0.0.1:4181/'+(platform==='android'?'android/index.html':'workspace.html');await page.goto(url);await page.locator('.music-hub').waitFor({state:'attached'});
  const go=id=>navigateWorkspace(page,id,platform);
  await page.evaluate(async()=>{
   const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('coucou-audio',2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   // Test-only fictional titles and synthetic WAVs; production has no demo catalogue.
   const titles=['Quiet Hours','City Signals','Morning Light','Slow Sunday','Open Roads','Night Garden'],artists=['Lina Vale','Theo Marks','Elise Monroe','Jasper Kai','Marco Lee','Nora Fields'];
   const bytes=new ArrayBuffer(44+16000*10);const view=new DataView(bytes);const text=(at,s)=>Array.from(s).forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));text(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,bytes.byteLength-44,true);
   for(let i=44;i<bytes.byteLength;i+=2)view.setInt16(i,Math.sin((i-44)*.15)*1000,true);
   const tx=db.transaction('tracks','readwrite');for(let i=0;i<6;i++){const hue=[270,195,35,60,160,130][i];const cover=new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><defs><linearGradient id="a" x2=".8" y2="1"><stop stop-color="hsl(${hue},45%,55%)"/><stop offset="1" stop-color="#0c1719"/></linearGradient></defs><path fill="url(#a)" d="M0 0h500v500H0z"/><circle cx="350" cy="145" r="45" fill="#fff" opacity=".45"/><path d="M0 320 160 170 300 320 430 220 500 330v170H0" fill="#102328" opacity=".8"/><path d="M0 370h500v130H0" fill="#7cadad" opacity=".12"/></svg>`],{type:'image/svg+xml'});tx.objectStore('tracks').put({id:'qa-'+i,name:titles[i]+'.wav',title:titles[i],artist:artists[i],album:'QA collection',created:100-i,blob:new Blob([bytes],{type:'audio/wav'}),cover,duration:10});}await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  });
  await page.reload();await go('music');
  const tabs=page.locator('.music-tabs'),cards=page.locator('.music-grid .music-card');
  const tab=name=>tabs.getByRole('tab',{name,exact:true}).click();
  const card=title=>cards.filter({has:page.getByRole('button',{name:'Play '+title,exact:true})});
  const details=async title=>{await card(title).locator('summary').click();await page.getByRole('button',{name:'Details for '+title,exact:true}).click();};
  const listeningOptions=async()=>{const details=page.locator('.music-listening-options');if(!await details.evaluate(el=>el.open))await details.locator('summary').click();};
  const idle=()=>page.waitForFunction(()=>!document.querySelector('.music-hub').hasAttribute('aria-busy'));
  const pause=()=>page.locator('.music-player:not(.mkr-dock) button[aria-label="Pause"]');
  const play=title=>page.getByRole('button',{name:'Play '+title,exact:true}).click();
  await cards.first().waitFor();assert.equal(await cards.count(),6);
  await page.getByLabel('Search music',{exact:true}).fill('elise');assert.equal(await cards.count(),1);
  await page.getByLabel('Search music',{exact:true}).fill('missing');assert.equal(await cards.count(),0);
  await page.getByText('No tracks here. Import local files, add a podcast, or stream.',{exact:true}).waitFor();
  await page.getByLabel('Search music',{exact:true}).fill('');
  await play('Morning Light');await pause().waitFor();await idle();
  await page.getByRole('button',{name:'Open full player',exact:true}).click();
  await page.getByRole('dialog',{name:'Now playing'}).waitFor();
  await page.getByRole('button',{name:'Shuffle queue',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Shuffle queue',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Repeat off',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Repeat all',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Close player',exact:true}).click();await go('writing');assert.equal(await pause().isVisible(),true);
  await go('music');await tab('Playlists');
  page.once('dialog',dialog=>{assert.equal(dialog.type(),'prompt');return dialog.accept('Evening');});
  await page.getByRole('button',{name:'New playlist',exact:true}).click();await page.getByText('Evening',{exact:true}).waitFor();
  assert.equal(await page.getByText('0 tracks',{exact:true}).count(),1);
  await tab('Music');await card('Morning Light').locator('summary').click();
  await page.getByRole('button',{name:'Add Morning Light to playlist',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Evening',exact:true}).click();
  await tab('Playlists');await page.getByRole('button',{name:'View playlist',exact:true}).click();
  await page.getByRole('dialog',{name:'Playlist Evening'}).getByRole('button',{name:'Remove Morning Light from playlist',exact:true}).waitFor();
  await page.getByRole('button',{name:'Close playlist',exact:true}).click();await tab('Music');await pause().click();
  await page.reload();await go('music');await page.locator('.music-player:not(.mkr-dock) button[aria-label="Play"]').waitFor();
  assert.equal(await page.locator('.music-player:not(.mkr-dock) strong').innerText(),'Morning Light');
  await page.getByRole('button',{name:'Open full player',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Shuffle queue',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.getByRole('button',{name:'Repeat all',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Shuffle queue',exact:true}).click();
  await page.getByRole('button',{name:'Close player',exact:true}).click();
  await details('Quiet Hours');await page.getByLabel('Item content type',{exact:true}).selectOption('audiobook');
  await page.getByRole('button',{name:'Save content type',exact:true}).click();await idle();
  await tab('Audiobooks');assert.equal(await cards.count(),1);
  await play('Quiet Hours');await pause().waitFor();await page.getByRole('button',{name:'Open full player',exact:true}).click();
  await page.getByLabel('Playback speed',{exact:true}).selectOption('1.5');
  await page.waitForFunction(()=>window.qaAudios.some(a=>!a.paused&&a.playbackRate===1.5));
  await page.waitForFunction(()=>{const state=JSON.parse(localStorage.getItem('anf-listening')||'{}');return (state.seconds?.[new Date().getFullYear()+'|qa-0']||0)>.7;});
  await pause().click();const heard=await page.evaluate(()=>JSON.parse(localStorage.getItem('anf-listening')));
  assert(heard.positions['qa-0']>.7);assert.equal(heard.rate,1.5);
  await page.getByRole('button',{name:'Close player',exact:true}).click();
  await listeningOptions();await page.getByRole('button',{name:'Listening recap',exact:true}).click();
  await page.getByRole('dialog',{name:'Listening recap'}).getByText(/Quiet Hours —/).waitFor();await page.getByRole('button',{name:'Close recap',exact:true}).click();
  await tab('Music');await play('Morning Light');await pause().waitFor();await tab('Audiobooks');await play('Quiet Hours');
  await page.waitForFunction(()=>Number(document.querySelector('input[aria-label="Music position"]').value)>.7);
  await pause().click();await details('Quiet Hours');
  await page.getByLabel('Import timed lyrics',{exact:true}).setInputFiles({name:'fixture.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:00]Local fixture line\n[00:06]Second fixture line')});
  await page.getByRole('dialog',{name:'Audio details'}).waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Open full player',exact:true}).click();
  await page.getByRole('button',{name:'Local fixture line',exact:true}).waitFor();
  await page.getByRole('button',{name:'Second fixture line',exact:true}).click();
  assert(Number(await page.getByLabel('Music position',{exact:true}).inputValue())>=6);
  await page.getByRole('button',{name:'Close player',exact:true}).click();
  await tab('Music');await play('Morning Light');await pause().waitFor();await pause().click();
  await page.getByRole('button',{name:'Open full player',exact:true}).click();await page.getByRole('button',{name:'Show queue',exact:true}).click();
  const queue=page.getByLabel('Playback queue',{exact:true});await queue.getByRole('button',{name:'Move up Slow Sunday',exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('anf-music-player')).queue[1]),'qa-3');
  await queue.getByRole('button',{name:'Remove from queue City Signals',exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('anf-music-player')).queue.includes('qa-1')),false);
  // Controlled browser time exercises the real registered timeout without a
  // fifteen-minute wall-clock wait or production test-only hooks.
  await page.clock.install();await page.getByLabel('Sleep timer',{exact:true}).selectOption('15');
  await page.locator('.music-player:not(.mkr-dock) button[aria-label="Play"]').click();await pause().waitFor();
  await page.clock.fastForward(15*60*1000);await page.locator('.music-notice').getByText('Sleep timer ended playback.',{exact:true}).waitFor();
  await page.locator('.music-player:not(.mkr-dock) button[aria-label="Play"]').waitFor();await page.clock.resume();
  await page.getByRole('button',{name:'Close player',exact:true}).click();
  await listeningOptions();await page.getByLabel('Listening mix',{exact:true}).selectOption('fresh');
  assert.equal(await cards.count(),4);await page.getByLabel('Listening mix',{exact:true}).selectOption('all');
  await tab('Playlists');let recipe;
  if(platform==='windows'){await page.getByRole('button',{name:'Export playlist file',exact:true}).click();await page.waitForFunction(()=>!!window.lastPlaylistExport);recipe=JSON.parse(await page.evaluate(()=>window.lastPlaylistExport));}
  else{const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export playlist file',exact:true}).click()]);recipe=JSON.parse(await readFile(await download.path(),'utf8'));}
  assert.equal(recipe.format,'anf-playlist-1');assert.equal(recipe.tracks[0].title,'Morning Light');assert(!JSON.stringify(recipe).includes('blob:'));
  page.once('dialog',dialog=>dialog.accept());await page.locator('input[aria-label="Import playlist file"]').setInputFiles({name:'shared.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...recipe,name:'Imported evening'}))});
  await page.getByText('Imported evening',{exact:true}).waitFor();await page.reload();await go('music');
  assert.equal(await page.getByLabel('Playback speed',{exact:true}).inputValue(),'1.5');
  await tab('Audiobooks');assert.equal(await cards.count(),1);await tab('Music');assert.equal(await cards.count(),5);
  // Match main's layout gate: the clipped ambient blur deliberately overdraws; every actual control still must fit.
  for(const width of platform==='windows'?[1440,1000,760]:[390,320,768]){await page.setViewportSize({width,height:platform==='windows'?1000:844});const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.body.scrollWidth,hub:document.querySelector('.music-hub').clientWidth,content:(()=>{const hub=document.querySelector('.music-hub');return Math.round(Math.max(...Array.from(hub.querySelectorAll('*')).filter(e=>!e.closest('.music-hub-ambient')&&e.getClientRects().length).map(e=>e.getBoundingClientRect().right))-hub.getBoundingClientRect().left);})()}));assert(bounds.scroll<=bounds.width+1,JSON.stringify(bounds));if(bounds.content>bounds.hub+1)console.log('Overflow diagnostics',await page.locator('.music-hub').evaluate(hub=>Array.from(hub.querySelectorAll('*')).filter(e=>e.getClientRects().length&&e.getBoundingClientRect().right>hub.getBoundingClientRect().right+1).map(e=>({tag:e.tagName,classes:e.className,visibility:getComputedStyle(e).visibility,rect:e.getBoundingClientRect().toJSON(),parent:e.parentElement?.className,parentOverflow:getComputedStyle(e.parentElement).overflow})).slice(0,12)));assert(bounds.content<=bounds.hub+1,JSON.stringify(bounds));if(platform==='android'){const placement=await page.evaluate(()=>({player:document.querySelector('aside.music-player:not(.mkr-dock)').getBoundingClientRect().bottom,nav:Math.min(document.querySelector('.mode-rail').getBoundingClientRect().top,document.querySelector('.bottom-nav').getBoundingClientRect().top)}));assert(placement.player<=placement.nav-7,JSON.stringify(placement));}if(width===(platform==='windows'?1440:390)){for(const image of await page.locator('.music-cover img').all()){await image.scrollIntoViewIfNeeded();await image.evaluate(async img=>{await img.decode();if(!img.naturalWidth)throw Error('Cover did not decode');});}await page.locator('.music-heading').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,platform+'-music-hub.png')});}}
  await page.setViewportSize({width:platform==='windows'?1440:390,height:1000});await play('Morning Light');await pause().waitFor();await go('audio');
  await page.locator('.audio-playlist button').filter({hasText:'Morning Light'}).first().click();await page.waitForFunction(()=>!document.querySelector('.audio-studio').hasAttribute('aria-busy'));
  await page.locator('.audio-studio').getByRole('button',{name:'Play',exact:true}).click();await page.locator('.audio-studio').getByRole('button',{name:'Pause',exact:true}).waitFor();
  assert.equal(await page.locator('aside.music-player:not(.mkr-dock)').isVisible(),false,'Studio must suspend music and its dock');
  await go('music');await play('City Signals');await pause().waitFor();
  assert.equal(await page.locator('.audio-studio').getByRole('button',{name:'Play',exact:true,includeHidden:true}).count(),1,'Music must pause studio');
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: Windows/Android Music Hub search, playlists and exchange, content kinds, real WAV playback and resume, speed, timed lyrics, recap, queue edits, sleep timer, persistence, mutual player suspension, and six viewport layouts. Preview artwork/titles are test fixtures.');
}catch(error){for(const context of browser.contexts())for(const page of context.pages()){console.log(await page.locator('.music-hub').innerText().catch(()=>''));await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
