// Real Tauri IPC and real compiled Flutter child; no browser/player substitute.
import {chromium} from 'playwright-core';
import {navigateWorkspace} from './navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
assert.equal(process.env.GITHUB_ACTIONS,'true');
assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted');
assert(process.env.ANF_QA_OUTPUT);
let browser,page;
const errors=[];
let playbackEvidence=null;
const nativeWindows=[];
const nativeWindow=expected=>{
 const state=JSON.parse(execFileSync('python',['scripts/app-qa/spotube-window-state.py',expected],{encoding:'utf8',timeout:10000}));
 nativeWindows.push({expected,...state});return state;
};
try {
 const deadline=Date.now()+90000;
 while(Date.now()<deadline&&!page){
  try{
   browser=await chromium.connectOverCDP('http://127.0.0.1:9223',{timeout:3000});
   page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('workspace.html'));
   if(!page)await browser.close();
  }catch{}
  if(!page)await new Promise(resolve=>setTimeout(resolve,500));
 }
 assert(page,'Actual AnF workspace must expose its own supported QA CDP connection');
 page.setDefaultTimeout(60000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.waitForFunction(()=>document.querySelector('[aria-label="Your question"]')?.disabled===false);
 const invoke=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
 assert.equal(await invoke('music_available'),true,'Actual packaged child must be available');
 const go=id=>navigateWorkspace(page,id);
 const ready=async()=>{
  await page.waitForFunction(()=>document.body.classList.contains('spotube-visible')&&
   document.querySelector('.spotube-host')?.getAttribute('aria-busy')===null&&
   document.querySelector('.music-source-switch button[aria-pressed="true"]')?.textContent==='Open Spotube');
  const state=await invoke('music_control',{operation:'status'});
  assert.equal(typeof state?.hasTrack,'boolean');assert.equal(typeof state?.playing,'boolean');
  assert.equal(state.playing,false,'Fresh fixture has no playing track');
  if(process.env.ANF_SPOTUBE_QA_FIXTURE)assert.equal(state.hasTrack,true,'Generated media must really load into upstream player');
  assert(await page.getByRole('button',{name:'Local library',exact:true}).isVisible(),'Native view must retain the visible source switch');
  return state;
 };
 await go('music');await ready();
 const firstWindow=nativeWindow('visible');
 const bounds=await page.locator('.spotube-host').evaluate(host=>{
  const r=host.getBoundingClientRect();const footer=document.querySelector('.activity-bar').getBoundingClientRect();
  return {left:r.left,top:r.top,width:r.width,footerTop:footer.top,viewportHeight:innerHeight,scale:devicePixelRatio};
 });
 assert(bounds.width>100&&bounds.top>=0&&bounds.footerTop>bounds.top+50,'Embedded surface must have usable workspace bounds');
 assert(Math.abs(firstWindow.left-Math.round(bounds.left*bounds.scale))<=2,'Actual child escaped horizontal host bounds');
 assert(Math.abs(firstWindow.top-Math.round(bounds.top*bounds.scale))<=2,'Actual child escaped vertical host bounds');
 assert(Math.abs(firstWindow.width-Math.round(bounds.width*bounds.scale))<=2,'Actual child width differs from UI host');
 assert(firstWindow.top+firstWindow.height<=Math.round(bounds.footerTop*bounds.scale),'Actual child covers the status bar');
 assert(firstWindow.left>=0&&firstWindow.left+firstWindow.width<=firstWindow.clientWidth+1,'Actual child extends beyond parent client');
 await go('writing');
 await page.waitForFunction(()=>!document.body.classList.contains('spotube-visible'));
 assert.equal(nativeWindow('hidden').childPid,firstWindow.childPid,'Navigation must retain same native child');
 assert(await page.getByLabel('Live Markdown writing',{exact:true}).isVisible());
 // Native state remains accessible while its view is hidden.
 assert.equal(typeof (await invoke('music_control',{operation:'status'})).hasTrack,'boolean');
 if(process.env.ANF_SPOTUBE_QA_FIXTURE){
  await page.getByRole('button',{name:'Play Spotube',exact:true}).click();
  const samples=[];let advancing;
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){
   const sample=await invoke('music_control',{operation:'status'});
   samples.push({playing:sample.playing,position:sample.position,duration:sample.duration,error:sample.error??null});
   assert(!sample.error,'Real decoder/output reported error: '+sample.error);
   if(sample.playing&&sample.position>300&&sample.duration>=29900&&sample.duration<=30100){advancing=sample;break;}
   await new Promise(resolve=>setTimeout(resolve,200));
  }
  assert(advancing,'Real upstream media clock/duration did not advance: '+JSON.stringify(samples));
  await new Promise(resolve=>setTimeout(resolve,600));
  const later=await invoke('music_control',{operation:'status'});
  assert(later.position>advancing.position+100,'Real playback position must keep advancing');
  await page.getByRole('button',{name:'Pause Spotube',exact:true}).click();
  const paused=await invoke('music_control',{operation:'status'});
  assert.equal(paused.playing,false);
  await new Promise(resolve=>setTimeout(resolve,600));
  const settled=await invoke('music_control',{operation:'status'});
  assert.equal(settled.playing,false);assert(Math.abs(settled.position-paused.position)<100,'Paused media clock must settle');
  playbackEvidence={fixtureSHA256:process.env.ANF_SPOTUBE_QA_SHA256,samples,
   laterPosition:later.position,pausedPosition:paused.position,settledPosition:settled.position,
   muted:true,outputDeviceOverridden:false,physicalAudioOutputVerified:false};
  console.log('PASS: real upstream generated-media duration, advancing clock and pause through actual AnF dock. Muted; no physical output or provider claim.');
 }
 await go('music');await ready();
 assert.equal(nativeWindow('visible').childPid,firstWindow.childPid,'Reopen must retain same native child');
 await page.getByRole('button',{name:'Local library',exact:true}).click();
 await page.waitForFunction(()=>!document.body.classList.contains('spotube-visible'));
 nativeWindow('hidden');
 assert.equal(await page.getByRole('button',{name:'Local library',exact:true}).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'Open Spotube',exact:true}).click();await ready();
 assert.equal(nativeWindow('visible').childPid,firstWindow.childPid);
 await go('settings');
 await page.waitForFunction(()=>!document.body.classList.contains('spotube-visible'));
 nativeWindow('hidden');
 assert(await page.getByLabel('Project name',{exact:true}).isVisible());
 assert.deepEqual(errors,[],'Actual workspace page errors');
 await mkdir(process.env.ANF_QA_OUTPUT,{recursive:true});
 await writeFile(path.join(process.env.ANF_QA_OUTPUT,'spotube-workspace.json'),JSON.stringify({
  sourceCommit:process.env.GITHUB_SHA,nativeTauri:true,realFlutterChild:true,
  nativeAvailabilityAndStatus:true,visibleMusicMount:true,writingAndSettingsNavigation:true,
  localLibrarySwitch:true,reopen:true,bounds,nativeWindows,actualNativeBoundsAndVisibility:true,providerStreamingVerified:false,
  musicPlaybackVerified:false,generatedMutedMediaClockVerified:!!playbackEvidence,playbackEvidence,
  audioHandoffVerified:false,installedUpgradeVerified:false,readyForPublication:false,
 },null,2));
 console.log('PASS: actual AnF workspace mounts Spotube, navigates without overlay, switches to local library and reopens native child. No music playback/provider claim.');
}catch(error){
 if(page)console.log('Workspace source-switch diagnostic:',JSON.stringify(await page.evaluate(()=>{
  const button=document.querySelector('.music-source-switch button');
  const ancestors=[];for(let node=button;node&&ancestors.length<8;node=node.parentElement){
   ancestors.push({tag:node.tagName,class:node.className,hidden:node.hidden,display:getComputedStyle(node).display});
  }
  return {view:document.body.dataset.view,sourceSwitchAncestors:ancestors};
 }).catch(()=>null)));
 throw error;
}finally{if(browser)await browser.close();}
