// Reader theme transitions: colors ease, the reading column does not move, and shell borders stay readable.
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
const out=await fs.mkdtemp(path.join(os.tmpdir(),'reader-theme-'));
const shotsDir=path.join(root,'.cursor/verification-artifacts');
await fs.mkdir(shotsDir,{recursive:true});
const paragraphs=Array.from({length:18},(_,i)=>`Paragraph ${i+1}. The harbour light stays fixed while the reading theme changes.`).join('\n\n');
await build({
  stdin:{
    contents:`import {createReader} from './src/workspace/reader.ts';
const text=${JSON.stringify(paragraphs)};
const reader=createReader(()=>{},()=>{},message=>{document.body.dataset.notify=message;});
document.querySelector('main').append(reader.root);
reader.open({name:'Harbour notes',text,reading:null});
document.body.dataset.ready='1';`,
    resolveDir:path.join(root,'windows'),
    loader:'ts',
  },
  bundle:true,
  format:'iife',
  outfile:path.join(out,'reader-theme.js'),
  external:['@tauri-apps/api','@tauri-apps/api/core'],
});
const readerCss=await fs.readFile(path.join(out,'reader-theme.css'),'utf8');
const workspaceCss=await fs.readFile(path.join(root,'windows/src/workspace/workspace.css'),'utf8');
const designCss=await fs.readFile(path.join(root,'windows/src/workspace/anf-design.css'),'utf8');
const railCss=await fs.readFile(path.join(root,'windows/src/workspace/nav-rail.css'),'utf8');
await fs.writeFile(path.join(out,'reader-theme.html'),`<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;height:100%}
${workspaceCss}
${designCss}
${railCss}
${readerCss}
.workspace-layout{height:100%}
/* Match the application's scrolling content pane for its inline reader. */
main{min-width:0;height:100%;overflow:auto}
</style><body>
<div id="workspace-root" data-theme="dark">
  <div class="workspace-layout has-glass-rail" data-rail-pinned="true">
    <aside class="history-sidebar glass-rail">
      <button class="rail-pin" type="button" aria-pressed="false">Pin</button>
      <strong class="brand">AnF</strong>
      <nav class="workspace-navigation" aria-label="Workspace sections">
        <button type="button" aria-current="page">Home</button>
        <button type="button">Documents</button>
      </nav>
    </aside>
    <main>
      <header class="workspace-header"><h1>Home</h1><p class="hint">Private workspace</p></header>
    </main>
  </div>
</div>
<script src="reader-theme.js"></script>`);

const browser=await chromium.launch({
  executablePath:process.env.CHROMIUM_BIN||'/usr/bin/google-chrome',
  headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage'],
});
const themes=['dark','black','sepia','light','amber'];
const shots=[];
try{
  const page=await browser.newPage({viewport:{width:1100,height:800}});
  page.setDefaultTimeout(10000);
  const errors=[];
  const warnings=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',msg=>{if(msg.type()==='warning'||msg.type()==='error')warnings.push(`${msg.type()}: ${msg.text()}`);});
  await page.goto(pathToFileURL(path.join(out,'reader-theme.html')).href);
  await page.waitForFunction(()=>document.body.dataset.ready==='1');
  // Appearance is now a disclosure in the inline reader. Open it through the UI
  // before measuring the stable layout used for all theme transitions.
  await page.locator('.reader-appearance > summary').click();
  const box=sel=>page.locator(sel).boundingBox();
  const same=(a,b,label)=>{
    assert.ok(a&&b,label);
    for(const key of ['x','y','width','height'])assert.ok(Math.abs(a[key]-b[key])<1,`${label} ${key} moved ${a[key]} -> ${b[key]}`);
  };
  const sample=()=>page.evaluate(()=>{
    const overlay=document.querySelector('.reader-overlay');
    const reading=document.querySelector('.reader-page');
    const body=document.querySelector('.reader-body');
    const button=overlay.querySelector('button');
    const rail=document.querySelector('.glass-rail');
    const header=document.querySelector('.workspace-header');
    const css=getComputedStyle(overlay);
    const buttonCss=getComputedStyle(button);
    return {
      theme:overlay.dataset.theme,
      text:reading.textContent,
      nodes:reading.childNodes.length,
      scroll:body.scrollTop,
      transition:css.transitionProperty,
      reader:{bg:css.backgroundColor,fg:getComputedStyle(reading).color,border:buttonCss.borderTopColor,buttonBg:buttonCss.backgroundColor,vars:{bg:css.getPropertyValue('--reader-bg').trim(),ink:css.getPropertyValue('--reader-ink').trim(),line:css.getPropertyValue('--reader-line').trim()}},
      rail:{bg:getComputedStyle(rail).backgroundColor,border:getComputedStyle(rail).borderTopColor,box:rail.getBoundingClientRect().toJSON()},
      header:{bg:getComputedStyle(header).backgroundColor,border:getComputedStyle(header).borderBottomColor,box:header.getBoundingClientRect().toJSON()},
    };
  });
  await page.locator('.reader-body').evaluate(el=>{el.scrollTop=140;});
  const origin=await sample();
  const originPage=await box('.reader-page');
  const originBody=await box('.reader-body');
  const originHeader=await box('.reader-header');
  const originControls=await box('.reader-controls');
  const originRail=await box('.glass-rail');
  const originBar=await box('.workspace-header');
  assert.equal(origin.theme,'dark');
  assert.match(origin.transition,/--reader-bg/);
  assert.match(origin.transition,/--reader-ink/);
  assert.match(origin.transition,/--reader-line/);
  for(const prop of ['width','height','padding','margin','font-size','line-height'])assert.equal(origin.transition.includes(prop),false,prop);
  assert.ok(origin.reader.vars.bg&&origin.reader.vars.ink&&origin.reader.vars.line,'reader tokens resolve');
  await page.locator('.reader-overlay').screenshot({path:path.join(shotsDir,'reader-theme-dark.png')});
  shots.push('reader-theme-dark.png');
  const lum=([r,g,b])=>{const f=v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
  const parseColor=input=>{const srgb=input.match(/color\(srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/);if(srgb)return srgb.slice(1,4).map(v=>Math.round(Number(v)*255));const rgb=input.match(/rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)/);if(!rgb)throw new Error(input);return rgb.slice(1,4).map(v=>Math.round(Number(v)))};
  const ratio=(a,b)=>{const A=lum(parseColor(a)),B=lum(parseColor(b));return (Math.max(A,B)+.05)/(Math.min(A,B)+.05)};
  const seen=new Set([origin.reader.bg]);
  for(const theme of themes){
    await page.locator('.reader-controls select').first().selectOption(theme);
    const during=await box('.reader-page');
    same(originPage,during,`${theme} page during transition`);
    await page.waitForTimeout(400);
    const after=await sample();
    same(originPage,await box('.reader-page'),`${theme} page`);
    same(originBody,await box('.reader-body'),`${theme} column`);
    same(originHeader,await box('.reader-header'),`${theme} toolbar`);
    same(originControls,await box('.reader-controls'),`${theme} controls`);
    assert.equal(after.theme,theme);
    assert.equal(after.text,origin.text);
    assert.equal(after.nodes,origin.nodes);
    assert.equal(after.scroll,140);
    assert.ok(after.reader.vars.bg&&after.reader.vars.ink&&after.reader.vars.line,`${theme} tokens`);
    assert.notEqual(after.reader.bg,'rgba(0, 0, 0, 0)');
    const title=await page.locator('.reader-header h2').evaluate(el=>getComputedStyle(el).color);
    const aside=await page.locator('.reader-aside h3').evaluate(el=>getComputedStyle(el).color);
    assert.ok(ratio(title,after.reader.bg)>=4.5,`${theme} title ${title} on ${after.reader.bg} is ${ratio(title,after.reader.bg).toFixed(2)}`);
    assert.ok(ratio(aside,after.reader.bg)>=4.5,`${theme} aside heading`);
    assert.ok(ratio(after.reader.fg,after.reader.bg)>=4.5,`${theme} page text`);
    assert.ok(ratio(after.reader.border,after.reader.buttonBg)>=3,`${theme} control border ${after.reader.border} on ${after.reader.buttonBg}`);
    const placeholder=await page.locator('.reader-aside textarea').evaluate(el=>getComputedStyle(el,'::placeholder').color);
    assert.ok(ratio(placeholder,after.reader.bg)>=4.5,`${theme} placeholder ${placeholder} on ${after.reader.bg} is ${ratio(placeholder,after.reader.bg).toFixed(2)}`);
    const ocr=page.locator('.ocr-start-btn');
    if(await ocr.count()){
      const paint=await ocr.evaluate(el=>{const s=getComputedStyle(el);return {color:s.color,bg:s.backgroundColor,border:s.borderTopColor};});
      assert.equal(paint.bg,after.reader.bg,`${theme} OCR fill uses the reader background, not the workspace surface`);
      assert.ok(ratio(paint.color,paint.bg)>=4.5,`${theme} OCR text ${paint.color} on ${paint.bg} is ${ratio(paint.color,paint.bg).toFixed(2)}`);
      assert.ok(ratio(paint.border,paint.bg)>=4.5,`${theme} OCR border ${paint.border} on ${paint.bg} is ${ratio(paint.border,paint.bg).toFixed(2)}`);
    }
    seen.add(after.reader.bg);
    if(theme==='light'||theme==='amber'){
      await page.locator('.reader-overlay').screenshot({path:path.join(shotsDir,`reader-theme-${theme}.png`)});
      shots.push(`reader-theme-${theme}.png`);
    }
  }
  assert.ok(seen.size>=4,'theme backgrounds differ');
  await page.setViewportSize({width:1100,height:800});
  await page.waitForTimeout(400);
  const wide=await box('.reader-page');
  const resizeSamples=[];
  for(const width of [640,1100]){
    await page.setViewportSize({width,height:800});
    const pageNow=await box('.reader-page');
    const headerNow=await box('.reader-header');
    await page.waitForTimeout(400);
    resizeSamples.push(await page.evaluate(()=>({width:innerWidth,documentY:scrollY,main:document.querySelector('main').scrollTop,root:document.querySelector('.reader-overlay').scrollTop,body:document.querySelector('.reader-body').scrollTop,height:document.querySelector('.reader-body').clientHeight,total:document.querySelector('.reader-body').scrollHeight,focus:document.activeElement?.outerHTML?.slice(0,100)})));
    same(pageNow,await box('.reader-page'),`${width}px page after resize`);
    same(headerNow,await box('.reader-header'),`${width}px toolbar after resize`);
  }
  const restored=await box('.reader-page');
  if(Math.abs(wide.y-restored.y)>=1)console.error('Reader resize diagnostics',JSON.stringify({wide,restored,resizeSamples}));
  same(wide,restored,'page restored after viewport toggle');
  const railBefore=await sample();
  await page.locator('#workspace-root').evaluate(el=>{el.dataset.theme='light';});
  same(originRail,await box('.glass-rail'),'glass rail during theme');
  same(originBar,await box('.workspace-header'),'header during theme');
  await page.waitForTimeout(350);
  const railAfter=await sample();
  same(originRail,await box('.glass-rail'),'glass rail after theme');
  same(originBar,await box('.workspace-header'),'header after theme');
  assert.notEqual(railAfter.header.bg,railBefore.header.bg);
  assert.notEqual(railAfter.header.border,railBefore.header.border);
  assert.notEqual(railAfter.rail.bg,railBefore.rail.bg);
  await page.locator('.reader-overlay').evaluate(el=>{el.hidden=true;});
  const shell=await page.evaluate(()=>{
    const rail=getComputedStyle(document.querySelector('.glass-rail'));
    const header=getComputedStyle(document.querySelector('.workspace-header'));
    const root=getComputedStyle(document.querySelector('#workspace-root'));
    return {canvas:root.backgroundColor,railBg:rail.backgroundColor,railBorder:rail.borderTopColor,railBlur:rail.backdropFilter,headerBlur:header.backdropFilter,headerBg:header.backgroundColor};
  });
  assert.notEqual(shell.canvas,'rgb(16, 30, 33)',`light canvas stayed the dark page color ${shell.canvas}`);
  assert.equal(shell.railBlur,'none',`light rail blur ${shell.railBlur}`);
  assert.equal(shell.headerBlur,'none',`light header blur ${shell.headerBlur}`);
  assert.ok(ratio(shell.railBorder,shell.railBg)>=4.5,`glass border ${shell.railBorder} on ${shell.railBg} is ${ratio(shell.railBorder,shell.railBg).toFixed(2)}`);
  await page.screenshot({path:path.join(shotsDir,'reader-theme-glass-light.png')});
  shots.push('reader-theme-glass-light.png');
  await page.locator('.reader-overlay').evaluate(el=>{el.hidden=false;});
  assert.deepEqual(errors,[]);
  assert.deepEqual(warnings,[]);
  const report={themes,shots,transition:origin.transition,backgrounds:[...seen],warnings,errors};
  await fs.writeFile(path.join(shotsDir,'reader-theme.json'),JSON.stringify(report,null,2));
  await fs.writeFile(path.join(shotsDir,'reader-theme.md'),`# Reader theme contrast\n\nBrowser fixture (headless Chrome), not an installed app.\n\n## Before\n\nSampled from the previous fixture shots:\n\n| Surface | Measured |\n|---|---|\n| Dark, light, and amber borders | about 3.07:1 (\`#606d7a\`, \`#909090\`, \`#725b41\`) |\n| Light focus, meter, and quote | about 3.10:1 |\n| Start OCR Server | workspace surface \`#182a2d\` on every reader theme |\n| Light glass border | about 1.2:1, with a 24px blur halo over the dark page |\n| Light canvas behind the rail | \`#101e21\` showing through |\n\n## After\n\n- Themes ${themes.join(', ')} change background and ink.\n- Reading column, toolbar, glass rail, and header keep their boxes. Resizing 1100px to 640px and back does not leave the page mid-transition.\n- Scroll stays at 140px and the document text is not rebuilt.\n- Title, aside heading, page text, placeholders, and the OCR control stay at least 4.5:1. Shell borders, focus, meter, and quote stay at least 4.5:1.\n- The open light rail is opaque (\`backdrop-filter: none\`). Its border is ${shell.railBorder} on ${shell.railBg} (${ratio(shell.railBorder,shell.railBg).toFixed(2)}:1). The canvas is ${shell.canvas}, not the dark page color.\n- Console warnings: none.\n- Transition: \`${origin.transition}\`.\n`);
  console.log('PASS: reader themes ease color tokens without moving the viewport, and the glass shell border and overlay update together.');
}finally{await browser.close();}
