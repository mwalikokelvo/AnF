// Real Tauri IPC and real compiled Flutter child; no browser/player substitute.
import {chromium} from 'playwright-core';
import {navigateWorkspace} from './navigation.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
assert.equal(process.env.GITHUB_ACTIONS,'true');
assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted');
assert(process.env.ANF_QA_OUTPUT);
let browser,page;
const errors=[];
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
  assert(await page.getByRole('button',{name:'Local library',exact:true}).isVisible(),'Native view must retain the visible source switch');
  return state;
 };
 await go('music');await ready();
 const bounds=await page.locator('.spotube-host').evaluate(host=>{
  const r=host.getBoundingClientRect();const footer=document.querySelector('.activity-bar').getBoundingClientRect();
  return {left:r.left,top:r.top,width:r.width,footerTop:footer.top,viewportHeight:innerHeight};
 });
 assert(bounds.width>100&&bounds.top>=0&&bounds.footerTop>bounds.top+50,'Embedded surface must have usable workspace bounds');
 await go('writing');
 await page.waitForFunction(()=>!document.body.classList.contains('spotube-visible'));
 assert(await page.getByLabel('Live Markdown writing',{exact:true}).isVisible());
 // Native state remains accessible while its view is hidden.
 assert.equal(typeof (await invoke('music_control',{operation:'status'})).hasTrack,'boolean');
 await go('music');await ready();
 await page.getByRole('button',{name:'Local library',exact:true}).click();
 await page.waitForFunction(()=>!document.body.classList.contains('spotube-visible'));
 assert.equal(await page.getByRole('button',{name:'Local library',exact:true}).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'Open Spotube',exact:true}).click();await ready();
 await go('settings');
 await page.waitForFunction(()=>!document.body.classList.contains('spotube-visible'));
 assert(await page.getByLabel('Project name',{exact:true}).isVisible());
 assert.deepEqual(errors,[],'Actual workspace page errors');
 await mkdir(process.env.ANF_QA_OUTPUT,{recursive:true});
 await writeFile(path.join(process.env.ANF_QA_OUTPUT,'spotube-workspace.json'),JSON.stringify({
  sourceCommit:process.env.GITHUB_SHA,nativeTauri:true,realFlutterChild:true,
  nativeAvailabilityAndStatus:true,visibleMusicMount:true,writingAndSettingsNavigation:true,
  localLibrarySwitch:true,reopen:true,bounds,providerStreamingVerified:false,
  musicPlaybackVerified:false,audioHandoffVerified:false,installedUpgradeVerified:false,readyForPublication:false,
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
