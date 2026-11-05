// Actual Tauri/WebView2 host and native storage, never a mocked browser preview.
import {chromium} from 'playwright-core';
import {navigateWorkspace} from './navigation.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
assert.equal(process.env.GITHUB_ACTIONS,'true');
assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted');
const phase=process.argv[2];assert(['seed','reopen'].includes(phase));
const out=process.env.ANF_QA_OUTPUT;assert(out);await mkdir(out,{recursive:true});
const errors=[],connections=[];let browser,page;
try{
 const deadline=Date.now()+90000;
 while(Date.now()<deadline&&!page){
  try{browser=await chromium.connectOverCDP('http://127.0.0.1:9223',{timeout:3000});
   page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('workspace.html'));
   if(!page)await browser.close();
  }catch(error){connections.push(String(error));}
  if(!page)await new Promise(r=>setTimeout(r,500));
 }
 await writeFile(path.join(out,`${phase}-connection.json`),JSON.stringify({connections:connections.slice(-3),pages:browser?.contexts().flatMap(c=>c.pages()).map(p=>p.url())||[]},null,2));
 assert(page,'Unmodified native app did not expose its workspace through supported WebView2 CDP options');
 page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
 await page.waitForFunction(()=>document.querySelector('[aria-label="Your question"]')?.disabled===false);
 assert.equal(await page.evaluate(()=>!!window.__TAURI_INTERNALS__),true,'Real native IPC required');
 assert.equal(await page.getByText('Workspace initialization failed:',{exact:false}).count(),0,'Native workspace initialization failed');
 const draft='Native AnF QA: saved writing remains local. Café and 中文.';
 const go=id=>navigateWorkspace(page,id);
 const save=async()=>{await go('settings');await page.getByRole('button',{name:'Save project',exact:true}).click();await page.getByText('Conversation saved.',{exact:true}).waitFor();};
 if(phase==='seed'){
  await go('settings');
  const picker=page.getByLabel('Local model',{exact:true});
  assert.deepEqual(await picker.locator('option').evaluateAll(options=>options.map(o=>o.value)),['fast','balanced']);
  assert.equal(await picker.inputValue(),'fast','Fresh projects must start with a persistable native slot');
  await picker.selectOption('balanced');
  await page.getByLabel('Project name',{exact:true}).fill('Native source QA');
  await go('writing');await page.getByLabel('Live Markdown writing',{exact:true}).fill(draft);await save();
  await go('documents');
  await page.getByLabel('Choose up to four documents',{exact:true}).setInputFiles({name:'native-qa.txt',mimeType:'text/plain',buffer:Buffer.from('Local native text import fixture. No provider submission authorized.')});
  await page.getByText('Sources loaded. Ask a question or use a task button.',{exact:true}).waitFor();await save();
 }
 await go('settings');assert.equal(await page.getByLabel('Local model',{exact:true}).inputValue(),'balanced','Selected native slot must survive save/restart');
 await go('writing');assert.equal(await page.getByLabel('Live Markdown writing',{exact:true}).innerText(),draft);
 const views=['home','chat','documents','writing','music','audio','settings'];
 for(const view of views){await go(view);await page.screenshot({path:path.join(out,`${phase}-${view}.png`)});}
 // Review settled native WebView layouts separately from immediate post-click
 // captures. CDP emulates renderer viewports; physical OS window resizing is NOT claimed.
 if(phase==='reopen'){
  const layout=[];
  for(const [width,height] of [[1280,800],[820,760],[600,500]]){
   await page.setViewportSize({width,height});
   for(const theme of ['light','dark']){
    await go('settings');await page.getByLabel('Appearance',{exact:true}).selectOption(theme);
    if(width===600){
     const name=page.getByLabel('Project name',{exact:true});assert(await name.isVisible(),'Project name must remain editable in a short window');
     await name.click();await name.fill('Compact layout QA');await save();
     await name.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`compact-name-${theme}.png`)});
     assert.equal(await page.locator('.history-item strong').first().textContent(),'Compact layout QA','Compact rename must reach native saved history');
    }
    for(const view of ['home','music']){
     await go(view);await page.mouse.move(Math.min(width-30,500),Math.min(height-30,450));
     if(width>=768){
      await page.waitForFunction(()=>{const rail=document.querySelector('.glass-rail');return rail?.dataset.rail==='collapsed'&&Math.abs(rail.getBoundingClientRect().width-parseFloat(getComputedStyle(rail).getPropertyValue('--rail-closed')))<0.75;},null,{timeout:8000});
     }
     await page.screenshot({path:path.join(out,`settled-${theme}-${view}-${width}.png`)});
     const bounds=await page.evaluate(()=>{const rail=document.querySelector('.glass-rail').getBoundingClientRect();const main=document.querySelector('.workspace-content').getBoundingClientRect();return {rail:{left:rail.left,right:rail.right,top:rail.top,bottom:rail.bottom},main:{left:main.left,right:main.right},viewport:{width:innerWidth,height:innerHeight}};});
     assert(bounds.rail.left>=0&&bounds.rail.right<=width+1,'Navigation extends beyond viewport');
     if(width>=768)assert(bounds.rail.right<=bounds.main.left+1,'Settled icon rail covers workspace content');
     layout.push({theme,view,width,height,bounds});
    }
   }
  }
  await page.setViewportSize({width:820,height:760});await go('writing');
  const restoredName=page.getByLabel('Project name',{exact:true});assert(await restoredName.isVisible(),'Name input must return to the wide header');assert.equal(await restoredName.inputValue(),'Compact layout QA');
  await writeFile(path.join(out,'settled-layout.json'),JSON.stringify({sourceCommit:process.env.GITHUB_SHA,nativeWebView:true,viewportEmulation:true,physicalWindowResizeVerified:false,compactProjectRenameVerified:true,wideHeaderRestoreVerified:true,measurements:layout},null,2)+'\n');
 }
 assert.deepEqual(errors,[],'Native WebView page errors');
 await writeFile(path.join(out,`${phase}.json`),JSON.stringify({sourceCommit:process.env.GITHUB_SHA,phase,nativeTauri:true,
  savedWritingVerified:true,localImportExercised:phase==='seed',navigationViews:views,
  originalSignerVerified:false,installedUpgradeVerified:false,providerPlaybackVerified:false,offlineModelVerified:false,readyForPublication:false},null,2)+'\n');
 console.log('PASS real native source QA: local writing/import/navigation'+(phase==='reopen'?' and persisted restart':'')+'. No installer, signer, model or provider claim.');
 }catch(error){
 if(page){
  await page.screenshot({path:path.join(out,`${phase}-failure.png`)}).catch(()=>{});
  const state=await page.evaluate(()=>({url:location.href,title:document.title,body:document.body.innerText.slice(-12000)})).catch(()=>null);
  await writeFile(path.join(out,`${phase}-failure.json`),JSON.stringify({error:String(error),state,pageErrors:errors},null,2));
 }
 throw error;
}finally{if(browser)await browser.close();}
