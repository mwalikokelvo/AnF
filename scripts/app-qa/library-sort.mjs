// Real shared library controls/cards; local generated reading data only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=path.join(root,'windows/target/library-sort-check');
await fs.mkdir(out,{recursive:true});
const {build}=createRequire(path.join(root,'windows/package.json'))('esbuild');
await build({stdin:{resolveDir:root,contents:`import {libraryCard,libraryControls,refreshLibrary} from './windows/src/workspace/library';
const source=(name,n,offset)=>({name,text:'word '.repeat(n),reading:{offset,annotations:[],bookmarks:[]}});
window.sources=[source('Zulu.txt',1000,0),source('Alpha.txt',2000,9000),source('Beta.txt',300,1500)];
const root=document.querySelector('#library');root.append(...window.sources.map(s=>libraryCard(s)));
document.body.prepend(libraryControls(root));window.refresh=()=>refreshLibrary(root);`},bundle:true,format:'iife',outfile:path.join(out,'fixture.js')});
await fs.writeFile(path.join(out,'index.html'),'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><main id="library"></main><script src="fixture.js"></script>');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.goto(pathToFileURL(path.join(out,'index.html')).href);
 const select=page.getByRole('combobox',{name:'Sort documents'});
 const names=()=>page.locator('article h3').allTextContents();
 const expected={title:['Alpha.txt','Beta.txt','Zulu.txt'],'title-desc':['Zulu.txt','Beta.txt','Alpha.txt'],
  length:['Alpha.txt','Zulu.txt','Beta.txt'],'length-asc':['Beta.txt','Zulu.txt','Alpha.txt'],
  'chars-remaining':['Zulu.txt','Alpha.txt','Beta.txt'],'chars-remaining-asc':['Beta.txt','Alpha.txt','Zulu.txt'],
  words:['Alpha.txt','Zulu.txt','Beta.txt'],'words-asc':['Beta.txt','Zulu.txt','Alpha.txt'],
  'words-remaining':['Zulu.txt','Alpha.txt','Beta.txt'],'words-remaining-asc':['Beta.txt','Alpha.txt','Zulu.txt'],
  time:['Alpha.txt','Zulu.txt','Beta.txt'],'time-asc':['Beta.txt','Zulu.txt','Alpha.txt'],
  remaining:['Zulu.txt','Alpha.txt','Beta.txt'],'remaining-asc':['Beta.txt','Alpha.txt','Zulu.txt']};
 for(const [sort,order] of Object.entries(expected)){await select.selectOption(sort);assert.deepEqual(await names(),order,sort);}
 await page.evaluate(()=>{window.sources[0].reading.offset=5000;window.refresh();});
 const progressOrder=await names();assert.equal(progressOrder[2],'Alpha.txt');assert.deepEqual(progressOrder.slice(0,2).sort(),['Beta.txt','Zulu.txt'],'changed progress refreshes remaining counts');
 await page.evaluate(()=>{window.sources[0].text='word '.repeat(4000);window.sources[0].reading.offset=0;window.refresh();});
 await select.selectOption('words');assert.deepEqual(await names(),['Zulu.txt','Alpha.txt','Beta.txt'],'text replacement invalidates cached word counts');
 assert.equal(await page.locator('article').first().getAttribute('data-words'),'4000');
 console.log('PASS: shared library total/remaining word, character and reading-time sorts, existing orderings, live progress and changed-text cache invalidation. Local fixture only.');
}finally{await browser.close();}
