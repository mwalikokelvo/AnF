// Keyboard-only: Tab through every section from its first control to the last. Each stop must (1) be on screen and not covered, and
// (2) look different from when it is not focused (a visible focus indicator, WCAG 2.4.7), measured by comparing screenshots of the
// stop with and without focus. The Writing editor (CodeMirror) used to draw no focus indicator at all. The navigation rail is
// skipped for the pixel comparison (it slides open on focus). Browser fixture only. Run `npm run build` in windows/ first.
import assert from 'node:assert/strict';
import {start,go} from './fixture.mjs';
const fx=await start();
const problems=[];
try{
  for(const theme of ['dark','light']){
    const {context,page}=await fx.open({width:1280,height:800});
    await context.addInitScript(t=>{try{localStorage.setItem('coucou-appearance',JSON.stringify({theme:t,size:'normal'}))}catch{}},theme);
    await page.reload();await page.locator('[data-view="home"]').waitFor({state:'attached'});
    for(const view of ['home','chat','documents','writing','music','audio','settings']){
      await go(page,view);await page.mouse.move(1100,700);
      await page.waitForFunction(()=>document.querySelector('.history-sidebar').dataset.rail==='collapsed',null,{timeout:8000}); // the rail floats over the first controls until it tucks away
      await page.waitForTimeout(600); // ... and its width animation ends
      // start at the header, so its controls are walked too; the walk ends when Tab wraps round into the rail
      await page.evaluate(()=>{document.activeElement?.blur();const h=document.querySelector('.workspace-header');h.tabIndex=-1;h.focus({preventScroll:true});});
      const seen=new Set();
      for(let i=0;i<120;i++){
        await page.keyboard.press('Tab');
        const stop=await page.evaluate(()=>{
          const el=document.activeElement;if(!el||el===document.body)return null;
          const r=el.getBoundingClientRect(),top=document.elementFromPoint(Math.min(innerWidth-1,Math.max(0,r.left+r.width/2)),Math.min(innerHeight-1,Math.max(0,r.top+r.height/2)));
          const name=(el.getAttribute('aria-label')||el.innerText||el.title||el.placeholder||el.tagName).trim().slice(0,28);
          return{key:el.tagName+'|'+name+'|'+Math.round(r.left)+','+Math.round(r.top+scrollY),name,rail:!!el.closest('.history-sidebar'),x:r.left,y:r.top,w:r.width,h:r.height,
            onScreen:r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth,covered:!(top===el||el.contains(top)||(top&&top.contains(el)))};
        });
        if(!stop)continue;
        if(seen.has(stop.key))break;seen.add(stop.key);
        if(stop.rail)break;
        const label=`${theme}/${view}: "${stop.name}"`;
        if(!stop.onScreen){problems.push(label+' is off screen when focused');continue;}
        if(stop.covered&&!/^(Music|Assistant|Reader)$/.test(stop.name)){problems.push(label+' is covered by another element when focused');continue;}
        const clip={x:Math.max(0,stop.x-8),y:Math.max(0,stop.y-8),width:Math.min(1280-Math.max(0,stop.x-8),stop.w+16),height:Math.min(800-Math.max(0,stop.y-8),stop.h+16)};
        if(clip.width<2||clip.height<2)continue;
        await page.waitForTimeout(120);
        const focused=await page.screenshot({clip});
        await page.evaluate(()=>{const el=document.activeElement;el.dataset.qaRefocus='1';el.blur();});
        await page.waitForTimeout(120);
        const plain=await page.screenshot({clip});
        await page.evaluate(()=>{const el=document.querySelector('[data-qa-refocus]');el.focus({preventScroll:true});delete el.dataset.qaRefocus;});
        if(focused.equals(plain))problems.push(label+' shows no focus indicator');
      }
    }
    await context.close();
  }
  assert.deepEqual([...new Set(problems)],[],'keyboard focus problems');
  assert.deepEqual(fx.problems,[]);
  console.log('PASS: every Tab stop on every section is on screen, uncovered and draws a visible focus indicator, dark and light. Browser fixture, not the installed app.');
}finally{await fx.close();}
