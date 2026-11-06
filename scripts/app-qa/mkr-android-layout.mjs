// Actual Android shell styles/shared browser, mocked native transport only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {build}=createRequire(path.join(root,'windows/package.json'))('esbuild');
const out=path.join(root,'windows/target/mkr-android-layout-check');await fs.mkdir(out,{recursive:true});
await build({stdin:{resolveDir:root,contents:`
import {createMkrBrowser} from './windows/src/workspace/mkr-browser';
import './android/web/style.css';import './windows/src/workspace/anf-design.css';
import './windows/src/workspace/anf-color.css';import './android/web/anf-color.css';
const track={id:'abcdefghijk',title:'Generated layout fixture song',artist:'Fixture'};
let state={playing:false,positionMs:0,durationMs:10000,track:null};
window.widget=createMkrBrowser({notify:()=>{},beforePlay:async()=>{},transport:async(command,payload)=>{
 if(command==='capabilities')return{protocol:1,embedded:true,platform:'android-native'};
 if(command==='search')return[track];if(command==='play'){state={...state,playing:true,track};}
 if(command==='pause')state.playing=false;if(command==='seek')state.positionMs=payload.positionMs;
 return structuredClone(state);
}});
document.querySelector('#music').prepend(window.widget.root);document.body.append(window.widget.dock);
function navigation(){const top=Math.min(document.querySelector('.mode-rail').getBoundingClientRect().top,document.querySelector('.bottom-nav').getBoundingClientRect().top);
 document.body.style.setProperty('--mobile-player-bottom',Math.max(0,innerHeight-top)+8+'px');}
new ResizeObserver(navigation).observe(document.querySelector('.bottom-nav'));window.addEventListener('resize',navigation);navigation();
window.start=async()=>{await window.widget.available();await window.widget.open();};
`},bundle:true,format:'iife',outfile:path.join(out,'fixture.js')});
const rows=Array.from({length:30},(_,i)=>`<p>Fixture library entry ${i+1}</p>`).join('');
await fs.writeFile(path.join(out,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><body><div id="app"><header><strong>Android layout fixture</strong></header><main><section class="panel" id="music">${rows}<button id="last" onclick="window.lastClicked=true">Last saved item</button></section></main><div class="mode-rail"><button>Read</button><button>Ask</button><button>Listen</button></div><nav class="bottom-nav"><button>Music Hub</button><button>Audio Studio</button><button>Settings</button></nav><p class="status">Generated fixture · no native player</p></div><script src="fixture.js"></script></body></html>`);
const browser=await chromium.launch({channel:'msedge',headless:true});
const metrics=[];
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto(pathToFileURL(path.join(out,'index.html')).href);await page.evaluate(()=>window.start());
 await page.getByRole('searchbox').fill('fixture');await page.getByRole('button',{name:'Search',exact:true}).click();
 await page.getByRole('button',{name:'Play Generated layout fixture song',exact:true}).click();
 for(const theme of ['dark','light'])for(const [width,height] of [[320,568],[390,850],[800,1000],[740,420]]){
  await page.setViewportSize({width,height});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  await page.evaluate(async()=>{void getComputedStyle(document.querySelector('.mkr-dock')).color;
   await Promise.all(document.getAnimations().filter(a=>a.playState==='running'&&Number.isFinite(a.effect?.getTiming().iterations??1)).map(a=>a.finished.catch(()=>{})));});
  await page.evaluate(()=>{const main=document.querySelector('#app>main');main.scrollTop=main.scrollHeight;document.querySelector('#last').focus({preventScroll:true});});
  const layout=await page.evaluate(()=>{
   const main=document.querySelector('#app>main'),dock=document.querySelector('.mkr-dock'),last=document.querySelector('#last'),mode=document.querySelector('.mode-rail');
   const rect=element=>{const r=element.getBoundingClientRect();return{top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};};
   const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d');
   const rgb=(...colors)=>{context.clearRect(0,0,1,1);for(const color of colors){context.fillStyle=color;context.fillRect(0,0,1,1);}return[...context.getImageData(0,0,1,1).data].slice(0,3);};
   const luminance=values=>values.map(v=>{const n=v/255;return n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
   const background=getComputedStyle(dock).backgroundColor;
   const contrast=element=>{const style=getComputedStyle(element),back=luminance(rgb(background,style.backgroundColor)),fore=luminance(rgb(background,style.backgroundColor,style.color));return(Math.max(back,fore)+.05)/(Math.min(back,fore)+.05);};
   return{main:rect(main),dock:rect(dock),last:rect(last),mode:rect(mode),width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
    after:getComputedStyle(main,'::after').height,dockHeight:parseFloat(document.body.style.getPropertyValue('--mkr-player-height')),
    controlContrast:contrast(dock.querySelector('button')),metadataContrast:contrast(dock.querySelector('.mkr-now span'))};
  });
  metrics.push({theme,...layout});await page.screenshot({path:path.join(out,`${theme}-${width}x${height}.png`)});
  await fs.writeFile(path.join(out,'metrics.json'),JSON.stringify(metrics,null,2));
  assert(layout.last.bottom<=layout.dock.top-8,`last Android item covered by dock: ${JSON.stringify(layout)}`);
  assert(layout.last.top>=layout.main.top,'last item must remain inside the scroll viewport');
  assert(layout.dock.bottom<=layout.mode.top-7,'dock must clear both Android navigation rows');
  assert(layout.main.height>24&&layout.mode.bottom<=height,'scroll space must not push navigation offscreen');
  if(width>=600&&height<=500)assert(layout.dock.height<=110,'short landscape must use the compact player row');
  assert(layout.scrollWidth<=width&&layout.dock.left>=0&&layout.dock.right<=width,'no horizontal clipping');
  assert(layout.controlContrast>=4.5&&layout.metadataContrast>=4.5,`${theme} control/metadata contrast below 4.5`);
  await page.getByRole('button',{name:'Last saved item',exact:true}).click();assert.equal(await page.evaluate(()=>window.lastClicked),true);
 }
 const before=await page.evaluate(()=>document.querySelector('#app>main').scrollHeight);
 await page.evaluate(()=>window.widget.suspend());
 assert.equal(await page.locator('.mkr-dock').isVisible(),false);
 const after=await page.evaluate(()=>({scroll:document.querySelector('#app>main').scrollHeight,content:getComputedStyle(document.querySelector('#app>main'),'::after').content}));
 assert(after.scroll<before,'hiding the player must remove its reserved scroll space');
 assert(['none','normal'].includes(after.content));assert.deepEqual(errors,[]);
 console.log('PASS: actual Android shell CSS + shared MKR browser clears last content and both navigation rows at phone/tablet/landscape sizes in both themes; hidden player releases space. Mocked native transport only.');
}finally{await browser.close();}
