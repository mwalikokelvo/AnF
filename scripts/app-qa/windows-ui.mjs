import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';

const phase=process.argv[2];
assert(['seed','verify','reopen'].includes(phase));
const out=process.env.ANF_QA_OUTPUT||'results';
await mkdir(out,{recursive:true});
let browser,page;
const errors=[];
const connectionErrors=[];
try {
  const deadline=Date.now()+90000;
  while(Date.now()<deadline&&!page) {
    try {
      let port=9223;
      const activePort=path.join(process.env.LOCALAPPDATA,'Coucou/webview-v014/EBWebView/DevToolsActivePort');
      const detected=Number((await readFile(activePort,'utf8').catch(()=>'' )).split('\n')[0]);
      if(detected>0&&detected<65536)port=detected;
      browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:3000});
      page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('workspace.html'));
      if(!page)await browser.close();
    }catch(error){connectionErrors.push(String(error));}
    if(!page)await new Promise(r=>setTimeout(r,500));
  }
  assert(page,'Installed application did not open its workspace');
  page.setDefaultTimeout(90000);
  page.on('pageerror',e=>errors.push(e.message));
  const view=async id=>{await page.locator(`[data-view="${id}"]`).click();await page.locator(`#panel-${id}`).waitFor({state:'visible'});};
  const saved=async()=>{await view('settings');await page.getByRole('button',{name:'Save project',exact:true}).click();await page.getByText('Conversation saved.',{exact:true}).waitFor();};
  await page.waitForFunction(()=>document.querySelector('[aria-label="Your question"]')?.disabled===false);
  assert(!await page.getByText('Workspace initialization failed:',{exact:false}).count());
  // UI-01: the installed workspace must be styled, not just running. Check computed values, not only a screenshot.
  const look=await page.evaluate(()=>{
    const sheets=[...document.styleSheets].map(s=>{try{return{href:s.href,rules:s.cssRules.length};}catch{return{href:s.href,rules:-1};}});
    const css=(sel,prop)=>{const el=document.querySelector(sel);return el?getComputedStyle(el)[prop]:null;};
    return{sheets,layout:css('.workspace-layout','display'),navigation:css('.workspace-navigation button','display'),background:css('#workspace-root','backgroundColor')};
  });
  await writeFile(path.join(out,`windows-${phase}-styles.json`),JSON.stringify(look,null,2));
  assert(look.sheets.some(s=>s.rules>200),'Workspace stylesheet did not load: '+JSON.stringify(look.sheets));
  assert.equal(look.layout,'grid','Workspace layout is unstyled');
  assert.equal(look.navigation,'flex','Workspace navigation is unstyled');
  const before='Keep this saved Windows draft: café and 中文.';
  const after='Edited after updating: Windows writing remains local.';
  const write=async text=>{await view('writing');await page.getByLabel('Live Markdown writing',{exact:true}).fill(text);await saved();};
  if(phase==='seed') {
    await page.getByLabel('Project name',{exact:true}).fill('QA upgrade conversation');
    await write(before);
    await view('documents');
    await page.getByLabel('Choose up to four documents',{exact:true}).setInputFiles({name:'before-update.txt',mimeType:'text/plain',buffer:Buffer.from('Original document text retained across the update.')});
    await page.getByText('Sources loaded. Ask a question or use a task button.',{exact:true}).waitFor();
    await view('settings');
    await page.getByText('Encrypted conversation storage',{exact:true}).click();
    await page.getByRole('button',{name:'Encrypt saved conversations',exact:true}).click();
    await page.getByText('Migration verified.',{exact:false}).waitFor();
    await saved();
  } else {
    assert.equal(await page.getByLabel('Project name',{exact:true}).inputValue(),'QA upgrade conversation');
    await view('writing');
    assert.equal(await page.getByLabel('Live Markdown writing',{exact:true}).innerText(),phase==='reopen'?after:before);
    await view('documents');
    await page.locator('#panel-documents').getByText('before-update.txt',{exact:true}).first().waitFor();
    await view('settings');
    await page.getByText('Encrypted conversation storage',{exact:true}).click();
    await page.getByRole('button',{name:'Check storage',exact:true}).click();
    await page.getByText('conversations use encrypted SQLCipher storage.',{exact:false}).waitFor();
    if(phase==='verify') {
      for(const id of ['home','chat','documents','audio','settings','writing'])await view(id);
      await view('documents');
      await page.getByLabel('Choose up to four documents',{exact:true}).setInputFiles(path.resolve('windows/src-tauri/tests/data/simple.pdf'));
      await page.getByText('Sources loaded. Ask a question or use a task button.',{exact:true}).waitFor();
      await page.locator('#panel-documents').getByText('simple.pdf',{exact:true}).first().waitFor();
      await view('chat');
      await page.getByLabel('AI context',{exact:true}).selectOption('none');
      await page.getByLabel('Your question',{exact:true}).fill('Calculate 2 + 2. Reply with the number only.');
      await page.getByRole('button',{name:'Ask local AI',exact:true}).click();
      await page.locator('.message.assistant').last().waitFor({timeout:240000});
      assert.match(await page.locator('.message.assistant').last().innerText(),/\b4\b/);
      await write(after);
    }
  }
  assert.deepEqual(errors,[],'Unexpected application JavaScript errors');
  await page.screenshot({path:path.join(out,`windows-${phase}.png`),fullPage:true});
  console.log(`PASS: installed Windows app ${phase}; encrypted conversation, draft and document retained`);
}catch(error){
  await writeFile(path.join(out,`windows-${phase}-diagnostics.json`),JSON.stringify({
    error:String(error),connectionErrors:connectionErrors.slice(-3),
    pages:browser?.contexts().flatMap(c=>c.pages().map(p=>p.url()))||[],errors,
  },null,2));
  if(page)await page.screenshot({path:path.join(out,`windows-${phase}-failure.png`),fullPage:true}).catch(()=>{});
  throw error;
}finally{if(browser)await browser.close();}
