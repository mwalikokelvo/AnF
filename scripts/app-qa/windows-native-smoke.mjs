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
const errors=[];let browser,page;
try{
 const deadline=Date.now()+90000;
 while(Date.now()<deadline&&!page){
  try{browser=await chromium.connectOverCDP('http://127.0.0.1:9223',{timeout:3000});
   page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('workspace.html'));
   if(!page)await browser.close();
  }catch{}
  if(!page)await new Promise(r=>setTimeout(r,500));
 }
 assert(page,'Unmodified native app did not expose its workspace through supported WebView2 CDP options');
 page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
 await page.waitForFunction(()=>document.querySelector('[aria-label="Your question"]')?.disabled===false);
 assert.equal(await page.evaluate(()=>!!window.__TAURI_INTERNALS__),true,'Real native IPC required');
 const draft='Native AnF QA: saved writing remains local. Café and 中文.';
 const go=id=>navigateWorkspace(page,id);
 const save=async()=>{await go('settings');await page.getByRole('button',{name:'Save project',exact:true}).click();await page.getByText('Conversation saved.',{exact:true}).waitFor();};
 if(phase==='seed'){
  await page.getByLabel('Project name',{exact:true}).fill('Native source QA');
  await go('writing');await page.getByLabel('Live Markdown writing',{exact:true}).fill(draft);await save();
  await go('documents');
  await page.getByLabel('Choose up to four documents',{exact:true}).setInputFiles({name:'native-qa.txt',mimeType:'text/plain',buffer:Buffer.from('Local native text import fixture. No provider submission authorized.')});
  await page.getByText('Sources loaded. Ask a question or use a task button.',{exact:true}).waitFor();await save();
 }
 await go('writing');assert.equal(await page.getByLabel('Live Markdown writing',{exact:true}).innerText(),draft);
 const views=['home','chat','documents','writing','music','audio','settings'];
 for(const view of views){await go(view);await page.screenshot({path:path.join(out,`${phase}-${view}.png`)});}
 assert.deepEqual(errors,[],'Native WebView page errors');
 await writeFile(path.join(out,`${phase}.json`),JSON.stringify({sourceCommit:process.env.GITHUB_SHA,phase,nativeTauri:true,
  savedWritingVerified:true,localImportExercised:phase==='seed',navigationViews:views,
  originalSignerVerified:false,installedUpgradeVerified:false,providerPlaybackVerified:false,offlineModelVerified:false,readyForPublication:false},null,2)+'\n');
 console.log('PASS real native source QA: local writing/import/navigation'+(phase==='reopen'?' and persisted restart':'')+'. No installer, signer, model or provider claim.');
}finally{if(browser)await browser.close();}
