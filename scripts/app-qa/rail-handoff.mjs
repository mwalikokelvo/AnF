// A small browser regression fixture using the real rail module and styles.
// Native installed-app and storage tests remain a separate gate.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';

const root=fileURLToPath(new URL('../../',import.meta.url));
const {build}=createRequire(path.join(root,'windows/package.json'))('esbuild');
const out=path.join(root,'windows/target/rail-handoff-check');
await fs.mkdir(out,{recursive:true});
const css=await fs.readFile(path.join(root,'windows/src/workspace/workspace.css'),'utf8');
await build({stdin:{contents:`import {attachNavRail} from './src/workspace/nav-rail';
const layout=document.querySelector('.workspace-layout'),rail=document.querySelector('.history-sidebar');
document.querySelector('#save').addEventListener('click',()=>document.body.dataset.saved=String(Number(document.body.dataset.saved||0)+1));
attachNavRail(rail,layout);`,resolveDir:path.join(root,'windows'),loader:'ts'},bundle:true,format:'iife',outfile:path.join(out,'rail.js')});
await fs.writeFile(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><style>${css}</style><link rel="stylesheet" href="rail.css"><div id="workspace-root"><div class="workspace-layout"><aside class="history-sidebar"><div class="brand">AnF</div><nav class="workspace-navigation"><button data-view="settings">Settings</button></nav></aside><main class="workspace-content"><div class="panel-host"><section class="workspace-panel" id="panel-settings" aria-label="Settings"><button id="save">Save project</button></section></div></main></div></div><script src="rail.js"></script>`);

const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:820,height:700}});
 page.setDefaultTimeout(10000);
 await page.goto(pathToFileURL(path.join(out,'index.html')).href);
 await page.locator('.history-sidebar').hover();
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 assert.equal(await page.locator('.history-sidebar').getAttribute('data-rail'),'collapsed');
 assert.equal(await page.locator('#panel-settings').evaluate(e=>document.activeElement===e),true);
 await page.getByRole('button',{name:'Save project',exact:true}).click();
 assert.equal(await page.locator('body').getAttribute('data-saved'),'1');
 await page.locator('.history-sidebar').hover();
 await page.getByRole('button',{name:'Keep the sidebar open',exact:true}).click();
 await page.getByRole('button',{name:'Save project',exact:true}).click();
 assert.equal(await page.locator('body').getAttribute('data-saved'),'2');
 const clearance=await page.evaluate(()=>({rail:document.querySelector('.history-sidebar').getBoundingClientRect().right,main:document.querySelector('.workspace-content').getBoundingClientRect().left}));
 assert(clearance.main>=clearance.rail,JSON.stringify(clearance));
 console.log('PASS: section navigation releases rail focus, Save is clickable, and pinned rail leaves content clear.');
}finally{await browser.close();}
