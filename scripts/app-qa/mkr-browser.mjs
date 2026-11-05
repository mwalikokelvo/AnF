// Renderer fixture ONLY. Native capabilities/status below are explicit mocks;
// passing this test does not establish an available AnF native MKR host.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {build}=createRequire(path.join(root,'windows/package.json'))('esbuild');
const out=path.join(root,'windows/target/mkr-browser-check');await fs.mkdir(out,{recursive:true});
await build({stdin:{contents:`
import {createMkrBrowser} from './src/workspace/mkr-browser';
import './src/workspace/workspace.css';import './src/workspace/anf-design.css';import './src/workspace/atelier.css';
import './src/workspace/music-hub.css';import './src/workspace/nav-rail.css';
const tracks=[{id:'abcdefghijk',title:'Generated song',artist:'Fixture'},{id:'lmnopqrstuv',title:'<img src=x onerror=alert(1)>',artist:'Literal metadata'}];
window.calls=[];window.notices=[];window.failHandoff=false;window.failPause=false;window.failStatus=false;
let state={playing:false,positionMs:0,durationMs:10000,track:null};
const copy=()=>structuredClone(state);
const beforePlay=async()=>{window.calls.push({command:'pause-others'});if(window.failHandoff)throw Error('handoff failed');};
window.mount=async(enabled)=>{
 const transport=enabled?async(command,payload)=>{
  window.calls.push({command,payload});
  if(command==='capabilities')return{protocol:1,embedded:true,platform:'windows-native'};
  if(command==='open'||command==='hide')return;
  if(command==='search'){if(window.deferSearch)return new Promise(resolve=>window.finishSearch=()=>resolve(tracks));return tracks;}
  if(command==='status'){if(window.failStatus)throw Error('https://private.invalid/status-token');const captured=copy();if(window.deferStatus)return new Promise(resolve=>window.finishStatus=()=>resolve(captured));return captured;}
  if(command==='play'){
   const play=()=>{state.track=tracks.find(t=>t.id===payload?.id)||state.track;state.playing=true;return copy();};
   if(window.deferPlay)return new Promise(resolve=>window.finishPlay=()=>resolve(play()));return play();
  }
  if(command==='pause'){if(window.failPause)throw Error('https://private.invalid/token');state.playing=false;return copy();}
  if(command==='seek'){state.positionMs=payload.positionMs;return copy();}
  if(command==='previous'||command==='next')return copy();
  throw Error('Unexpected fixture command');
 }:undefined;
 window.widget=createMkrBrowser({transport,beforePlay,notify:message=>window.notices.push(message)});
 document.querySelector('#workspace-root').append(window.widget.root);document.body.append(window.widget.dock);
 return window.widget.available();
};
window.model=()=>copy();
`,resolveDir:path.join(root,'windows'),loader:'ts'},bundle:true,format:'iife',outfile:path.join(out,'fixture.js')});
await fs.writeFile(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><style>body{display:block}#workspace-root{padding-inline:16px}</style><div id="workspace-root" class="workspace-content"></div><script src="fixture.js"></script>`);
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];page.setDefaultTimeout(10_000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.join(out,'index.html')).href);
 assert.equal(await page.evaluate(()=>window.mount(false)),false);
 assert.equal(await page.evaluate(()=>window.widget.open()),false);
 assert.equal(await page.getByRole('region',{name:'Embedded MKR Music'}).count(),0);
 await page.evaluate(()=>window.widget.dispose());
 assert.equal(await page.evaluate(()=>window.mount(true)),true);
 assert.equal(await page.evaluate(()=>window.widget.open()),true);
 const input=page.getByRole('searchbox',{name:'Search MKR Music'});
 await page.evaluate(()=>window.deferSearch=true);await input.fill('first');
 await page.getByRole('button',{name:'Search',exact:true}).click();await input.fill('changed');
 await page.evaluate(()=>window.finishSearch());
 await page.getByText('Your search changed. Press Search for the new words.',{exact:true}).waitFor();
 assert.equal(await page.locator('.mkr-result').count(),0,'stale results must not replace the edited query');
 await page.evaluate(()=>window.deferSearch=false);await input.fill('fixture');
 await page.getByRole('button',{name:'Search',exact:true}).click();await page.locator('.mkr-result').first().waitFor();
 assert.equal(await page.locator('.mkr-result').count(),2);assert.equal(await page.locator('.mkr-results img').count(),0);
 const song=page.getByRole('button',{name:'Play Generated song',exact:true});await song.click();
 await page.getByRole('button',{name:'Pause MKR Music',exact:true}).waitFor();
 await page.waitForFunction(()=>document.body.classList.contains('has-mkr-player'));
 await page.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelector('.workspace-content')).paddingBottom)>document.querySelector('.mkr-dock').getBoundingClientRect().height);
 const commands=await page.evaluate(()=>window.calls.map(x=>x.command));
 assert(commands.indexOf('pause-others')<commands.indexOf('play'),'handoff must finish before native play');
 const seek=page.getByRole('slider',{name:'MKR playback position'});await seek.fill('2000');await seek.dispatchEvent('change');
 await page.waitForFunction(()=>window.model().positionMs===2000);
 await page.getByRole('button',{name:'Back to library',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.model().playing),true,'hiding the view should preserve background playback');
 assert.equal(await page.getByRole('complementary',{name:'MKR Music player'}).count(),1);
 await page.evaluate(()=>{window.deferStatus=true;return window.widget.open();});
 await page.waitForFunction(()=>typeof window.finishStatus==='function');
 await seek.fill('3000');await seek.dispatchEvent('change');await page.waitForFunction(()=>window.model().positionMs===3000);
 await page.evaluate(()=>{window.finishStatus();window.deferStatus=false;});await page.waitForTimeout(60);
 assert.equal(await seek.inputValue(),'3000','old status response must not undo a newer seek');
 await page.evaluate(()=>{window.failStatus=true;document.dispatchEvent(new Event('visibilitychange'));});
 await page.getByText('MKR player status is unavailable. Check the player before continuing.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Pause MKR Music',exact:true}).isDisabled(),true,'unknown status must disable stale transport controls immediately');
 assert.equal(await seek.isDisabled(),true,'unknown status must disable seeking immediately');
 assert.equal(await page.getByRole('button',{name:'Check player',exact:true}).isEnabled(),true,'recovery remains usable');
 await page.evaluate(()=>window.failStatus=false);
 await page.getByRole('button',{name:'Check player',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.mkr-controls button')?.disabled===false);
 const before=await page.evaluate(()=>window.calls.filter(x=>x.command==='play').length);
 await page.evaluate(()=>window.failHandoff=true);await song.click();
 await page.getByText('MKR playback could not start. No external player was opened.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.calls.filter(x=>x.command==='play').length),before);
 await page.evaluate(()=>{window.failHandoff=false;window.failPause=true;});
 assert.equal(await page.evaluate(async()=>{try{await window.widget.suspend();return false;}catch{return true;}}),true,'pause failure must reject handoff');
 assert.equal(await page.getByRole('complementary',{name:'MKR Music player'}).count(),1,'failed pause must not hide controls');
 assert.equal(await page.evaluate(async()=>{try{await window.widget.dispose();return false;}catch{return true;}}),true);
 assert.equal(await page.locator('.mkr-browser').count(),1,'failed disposal must retain recovery controls');
 assert(!(await page.locator('body').innerText()).includes('private.invalid'));
 await page.evaluate(()=>window.failPause=false);await page.getByRole('button',{name:'Check player',exact:true}).click();
 await page.evaluate(()=>window.widget.suspend());assert.equal(await page.evaluate(()=>window.model().playing),false);
 assert.equal(await page.evaluate(()=>document.body.classList.contains('has-mkr-player')),false);
 await page.evaluate(()=>window.widget.open());
 await page.locator('.mkr-dock').waitFor({state:'visible'});
 for(const theme of ['dark','light']){
  await page.evaluate(theme=>{document.documentElement.setAttribute('data-theme',theme);document.querySelector('#workspace-root').setAttribute('data-theme',theme);},theme);
  const contrast=await page.evaluate(()=>{
   const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number);
   const luminance=color=>rgb(color).map(v=>{const n=v/255;return n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
   const text=luminance(getComputedStyle(document.querySelector('.mkr-controls button')).color),background=luminance(getComputedStyle(document.querySelector('.mkr-dock')).backgroundColor);
   return(Math.max(text,background)+0.05)/(Math.min(text,background)+0.05);
  });
  assert(contrast>=4.5,`${theme} control contrast ${contrast}`);
  for(const width of [1280,390,320]){
   await page.setViewportSize({width,height:850});
   const layout=await page.evaluate(()=>{
    const dock=document.querySelector('.mkr-dock'),now=dock.querySelector('.mkr-now');
    return{page:document.documentElement.scrollWidth,width:innerWidth,display:getComputedStyle(dock).display,dockWidth:dock.getBoundingClientRect().width,titleWidth:now.getBoundingClientRect().width};
   });
   assert(layout.page<=width+1,JSON.stringify(layout));
   assert.equal(layout.display,'flex','MKR must retain its own layout instead of inheriting the compact Music Hub grid');
   if(width<768)assert(layout.titleWidth>=layout.dockWidth*.8,'narrow screens need a full metadata row, not a clipped title beside transport buttons');
   await page.screenshot({path:path.join(out,`mkr-${theme}-${width}.png`)});
  }

 }
 await page.screenshot({path:path.join(out,'mkr-ui.png')});
 await page.evaluate(()=>window.deferPlay=true);await song.click();
 await page.waitForFunction(()=>typeof window.finishPlay==='function');
 await page.evaluate(()=>{window.disposal=window.widget.dispose();});
 assert.equal(await page.locator('.mkr-browser').count(),1,'disposal must wait for an in-flight play');
 await page.evaluate(()=>window.finishPlay());await page.evaluate(()=>window.disposal);
 assert.equal(await page.evaluate(()=>window.model().playing),false,'a late play must be paused before removal');
 assert.equal(await page.locator('.mkr-browser').count(),0);assert.equal(await page.locator('.mkr-dock').count(),0);
 assert.equal(await page.evaluate(()=>document.body.classList.contains('has-mkr-player')),false);
 assert.equal(await page.evaluate(()=>document.body.style.getPropertyValue('--mkr-player-height')),'');
 const count=await page.evaluate(()=>window.calls.length);await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>window.calls.length),count);
 assert.equal(await page.locator('a').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS: mocked native renderer gating, in-app search/control/hide, literal metadata, stale search rejection, acknowledged handoff, failed-pause propagation, three layouts and late-play-safe disposal. Not a native/provider availability test.');
}finally{await browser.close();}
