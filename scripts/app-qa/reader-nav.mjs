// Reader section bar: focus on the text hides it, Ctrl+B shows it, and the reading column does not move.
// Browser fixture only. Not an installed-app test.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';

const root=fileURLToPath(new URL('../../',import.meta.url));
const {build}=createRequire(path.join(root,'windows/package.json'))('esbuild');
const out=await fs.mkdtemp(path.join(os.tmpdir(),'reader-nav-'));
const shotsDir=path.join(root,'.cursor/verification-artifacts');
await fs.mkdir(shotsDir,{recursive:true});
const paragraphs=Array.from({length:24},(_,i)=>`Paragraph ${i+1}. The harbour light stays fixed while the section bar hides.`).join('\n\n');
await build({
  stdin:{
    contents:`import {createReader} from './src/workspace/reader.ts';
const text=${JSON.stringify(paragraphs)};
const reader=createReader(()=>{},()=>{},message=>{document.body.dataset.notify=message;});
document.body.append(reader.root);
reader.open({name:'Harbour notes',text,reading:null});
document.body.dataset.ready='1';`,
    resolveDir:path.join(root,'windows'),
    loader:'ts',
  },
  bundle:true,
  format:'iife',
  outfile:path.join(out,'reader-nav.js'),
  external:['@tauri-apps/api','@tauri-apps/api/core'],
});
const css=await fs.readFile(path.join(out,'reader-nav.css'),'utf8');
await fs.writeFile(path.join(out,'reader-nav.html'),`<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:#101923;height:100%}
${css}
</style><body><script src="reader-nav.js"></script>`);

const browser=await chromium.launch({
  executablePath:process.env.CHROMIUM_BIN||'/usr/bin/google-chrome',
  headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage'],
});
const shots=[];
try{
  const page=await browser.newPage({viewport:{width:1100,height:800}});
  page.setDefaultTimeout(10000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(out,'reader-nav.html')).href);
  await page.waitForFunction(()=>document.body.dataset.ready==='1');
  const bar=page.locator('.reader-navigation');
  const body=page.locator('.reader-body');
  const text=page.locator('.reader-page');
  const box=async()=>({
    nav:await page.locator('.reader-overlay').getAttribute('data-nav'),
    inert:await bar.evaluate(el=>el.hasAttribute('inert')),
    body:await body.boundingBox(),
    text:await text.boundingBox(),
    slot:await page.locator('.reader-nav-slot').boundingBox(),
    opacity:await bar.evaluate(el=>getComputedStyle(el).opacity),
    transform:await bar.evaluate(el=>getComputedStyle(el).transform),
  });
  const same=(a,b,label)=>{
    for(const key of ['x','y','width','height'])assert.ok(Math.abs(a[key]-b[key])<1,`${label} ${key} moved ${a[key]} -> ${b[key]}`);
  };
  await page.locator('.reader-overlay').screenshot({path:path.join(shotsDir,'reader-nav-open.png')});
  shots.push('reader-nav-open.png');
  const open=await box();
  assert.equal(open.nav,'open');
  assert.equal(open.inert,false);
  const buttonBg=await page.getByRole('button',{name:'Previous section'}).evaluate(el=>getComputedStyle(el).backgroundColor);
  await text.evaluate(el=>el.focus({preventScroll:true}));
  await page.waitForTimeout(350);
  await page.locator('.reader-overlay').screenshot({path:path.join(shotsDir,'reader-nav-collapsed.png')});
  shots.push('reader-nav-collapsed.png');
  const collapsed=await box();
  assert.equal(collapsed.nav,'collapsed');
  assert.equal(collapsed.inert,true);
  assert.equal(collapsed.opacity,'0');
  same(open.body,collapsed.body,'reading column');
  same(open.text,collapsed.text,'reading page');
  same(open.slot,collapsed.slot,'navigation slot');
  await page.keyboard.press('Control+b');
  await page.waitForTimeout(350);
  await page.locator('.reader-overlay').screenshot({path:path.join(shotsDir,'reader-nav-toggled.png')});
  shots.push('reader-nav-toggled.png');
  const toggled=await box();
  assert.equal(toggled.nav,'open');
  assert.equal(toggled.inert,false);
  assert.equal(toggled.opacity,'1');
  same(open.body,toggled.body,'reading column after Ctrl+B');
  same(open.text,toggled.text,'reading page after Ctrl+B');
  const buttonBgAfter=await page.getByRole('button',{name:'Previous section'}).evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.equal(buttonBgAfter,buttonBg);
  await body.evaluate(el=>{el.scrollTop=120;});
  await page.getByRole('button',{name:'Close reader'}).focus();
  const scrolled=await box();
  const scrollBefore=await body.evaluate(el=>el.scrollTop);
  const column=await body.boundingBox();
  await page.mouse.click(column.x+80,column.y+column.height/2);
  await page.waitForTimeout(50);
  const clicked=await box();
  const scrollAfter=await body.evaluate(el=>el.scrollTop);
  assert.equal(clicked.nav,'collapsed');
  assert.equal(scrollAfter,scrollBefore);
  same(scrolled.body,clicked.body,'reading column after click');
  same(scrolled.text,clicked.text,'reading page after click');
  await page.keyboard.press('Control+b');
  await page.waitForTimeout(50);
  assert.equal(await page.locator('.reader-overlay').getAttribute('data-nav'),'open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(50);
  assert.equal(await page.locator('.reader-overlay').isHidden(),true);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.reload();
  await page.waitForFunction(()=>document.body.dataset.ready==='1');
  const before=await page.locator('.reader-body').boundingBox();
  await page.locator('.reader-page').evaluate(el=>el.focus({preventScroll:true}));
  const after=await page.locator('.reader-body').boundingBox();
  assert.equal(await page.locator('.reader-overlay').getAttribute('data-nav'),'collapsed');
  same(before,after,'reading column with reduced motion');
  assert.deepEqual(errors,[]);
  const report={shortcut:'Ctrl+B or Cmd+B toggles the section bar. Escape still closes the reader.',open,collapsed,toggled,buttonBg,shots};
  await fs.writeFile(path.join(shotsDir,'reader-nav.json'),JSON.stringify(report,null,2));
  console.log('PASS: reading focus hides the section bar, Ctrl+B restores it, Escape closes the reader, and the reading column stays put.');
}finally{await browser.close();}
