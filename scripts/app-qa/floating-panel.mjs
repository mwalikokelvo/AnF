// Run with the Windows Vite server at ANF_UI_URL (default http://127.0.0.1:4174).
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const base=process.env.ANF_UI_URL||'http://127.0.0.1:4174';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const output=new URL('../../releases/floating-panel/',import.meta.url);await mkdir(output,{recursive:true});
const errors=[];
try{
  for(const scale of [1,1.25,1.5,2]){
    const context=await browser.newContext({viewport:{width:720,height:360},deviceScaleFactor:scale});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/floating-qa',route=>route.fulfill({contentType:'text/html',body:`<div id="root"></div><script type="module">
      import '/src/style.css';import {Island} from '/src/island/island.ts';import {State} from '/src/core/state.ts';
      State.settings.autoCloseInterval=3600;window.qaIsland=new Island(document.getElementById('root'));window.qaIsland.alert('empty');
    </script>`}));
    await page.goto(base+'/floating-qa');
    const settings=page.getByRole('button',{name:'Floating settings',exact:true});
    await settings.waitFor();await page.waitForTimeout(800);
    for(const view of ['empty','prompt','upload','settings','empty']){
      await page.evaluate(view=>window.qaIsland.setView(view),view);await page.waitForTimeout(650);
      const geometry=await page.evaluate(()=>{
        const island=document.getElementById('island').getBoundingClientRect();
        return {left:island.left,right:island.right,top:island.top,bottom:island.bottom,buttons:[...document.querySelectorAll('#header button')].map(button=>{
          const r=button.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
          return {title:button.title,covered:!button.contains(top),left:r.left,right:r.right,top:r.top,bottom:r.bottom};
        })};
      });
      for(const button of geometry.buttons){assert(!button.covered,`${scale}x ${view}: ${button.title} covered`);assert(button.left>=geometry.left&&button.right<=geometry.right&&button.bottom<=geometry.bottom);}
      assert.equal(await page.locator('.view:not(.on):not([inert])').count(),0);
    }
    await settings.click();await page.getByRole('button',{name:'Settings…',exact:true}).waitFor();
    await page.waitForTimeout(650);
    assert(await page.getByRole('button',{name:'Settings…',exact:true}).isVisible());
    await page.screenshot({path:new URL(`settings-${scale}x.png`,output).pathname.replace(/^\/([A-Za-z]:)/,'$1'),omitBackground:true});
    // The animated background stays clipped throughout repeated compact/expanded transitions.
    for(let i=0;i<3;i++){
      await page.getByRole('button',{name:'Collapse floating panel',exact:true}).click();await page.waitForTimeout(450);
      await page.mouse.click(360,16);await page.waitForTimeout(700);await settings.click();await page.waitForTimeout(500);
    }
    await context.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: floating Settings and header controls remain uncovered at 100%, 125%, 150% and 200% DPI, including repeated expansion.');
}finally{await browser.close();}
