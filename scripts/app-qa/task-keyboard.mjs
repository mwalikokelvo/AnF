// Actual Chromium keyboard/dialog behavior with the production helper. Native
// cancellation/provider processes are separate gates; this never starts them.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {build}=createRequire(path.join(root,'windows/package.json'))('esbuild');
const out=path.join(root,'windows/target/task-keyboard-check');await fs.mkdir(out,{recursive:true});
await build({stdin:{contents:`
import {cancelTaskFromKeyboard} from './src/workspace/task-keyboard';
import './src/workspace/workspace.css';import './src/workspace/anf-design.css';import './src/workspace/atelier.css';
const cancel=document.querySelector('#cancel');
window.calls=0;cancel.onclick=()=>{window.calls++;cancel.disabled=true;};
window.addEventListener('keydown',event=>cancelTaskFromKeyboard(event,cancel));
document.querySelector('#editor').addEventListener('keydown',event=>{if(event.key==='Escape')event.preventDefault();});
`,resolveDir:path.join(root,'windows'),loader:'ts'},bundle:true,format:'iife',outfile:path.join(out,'fixture.js')});
await fs.writeFile(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><div id="workspace-root"><div class="activity-bar"><button id="cancel" aria-keyshortcuts="Escape">Cancel<kbd aria-hidden="true">Esc</kbd></button></div><input id="editor" aria-label="Editor with Escape handling"><dialog aria-label="Modal task settings"><button>Close</button></dialog></div><script src="fixture.js"></script>`);
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:700}});page.setDefaultTimeout(10_000);
 await page.goto(pathToFileURL(path.join(out,'index.html')).href);
 const cancel=page.getByRole('button',{name:'Cancel',exact:true});
 assert.equal(await cancel.getAttribute('aria-keyshortcuts'),'Escape');
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.calls),1);
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.calls),1,'disabled action must not be invoked');
 await page.evaluate(()=>{document.querySelector('#cancel').disabled=false;document.querySelector('#cancel').hidden=true;});
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.calls),1,'hidden action must not be invoked');
 await page.evaluate(()=>{document.querySelector('#cancel').hidden=false;document.querySelector('dialog').showModal();});
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog').open);
 assert.equal(await page.evaluate(()=>window.calls),1,'dialog Escape must not cancel the task behind it');
 await page.getByLabel('Editor with Escape handling').focus();await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>window.calls),1,'editor-owned Escape must remain local');
 await page.evaluate(()=>{
   for(const options of [{key:'Escape',ctrlKey:true},{key:'Escape',repeat:true},{key:'Enter',ctrlKey:true}]){
     const event=new KeyboardEvent('keydown',{...options,bubbles:true,cancelable:true});
     window.dispatchEvent(event);if(event.defaultPrevented)throw Error('Unrelated keyboard action intercepted');
   }
 });
 assert.equal(await page.evaluate(()=>window.calls),1);
 const bounds=await cancel.boundingBox();assert(bounds.width<=390&&bounds.height>=44);
 await cancel.focus();await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.calls),2);
 console.log('PASS: Escape cancels an available task once, preserves modal/editor shortcuts, ignores disabled/hidden/repeated/modifier actions, and retains the Cancel accessible name.');
}finally{await browser.close();}
