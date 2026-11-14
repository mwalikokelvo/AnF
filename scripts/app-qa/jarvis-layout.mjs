// Regression: in a window that is not maximized the JARVIS desk overflowed sideways (agent cards cut off,
// a horizontal scrollbar) and the HUD squeezed its panels, with the sixth panel spilling into a stray row.
// Every panel and card must stay inside the desk, with usable widths, at common window sizes.
// Browser fixture only. Run `npm run build` in windows/ first.
import assert from 'node:assert/strict';
import {start,go} from './fixture.mjs';
const fx=await start();
try{
  for(const [width,height] of [[1920,1040],[1280,720],[1000,700],[760,640],[600,500]]){
    const {context,page}=await fx.open({width,height});
    await go(page,'jarvis');
    await page.waitForTimeout(300);
    const m=await page.evaluate(()=>{
      const desk=document.querySelector('.jarvis-command-desk').getBoundingClientRect();
      const boxes=[...document.querySelectorAll('.jarvis-panel,.jarvis-agent-card,.jarvis-btn,.jarvis-voice-select,.jarvis-desk-title,.jarvis-desk-status,.jarvis-online-voices')].map(e=>{const r=e.getBoundingClientRect();return{c:e.className,l:Math.round(r.left),r:Math.round(r.right),w:Math.round(r.width),t:Math.round(r.top)};});
      const hud=document.querySelector('.jarvis-hud'),rows=getComputedStyle(hud).gridTemplateRows.split(' ').length;
      return{desk:{l:Math.round(desk.left),r:Math.round(desk.right)},boxes,rows,hscroll:document.documentElement.scrollWidth-innerWidth,deskScroll:document.querySelector('.jarvis-command-desk').scrollWidth-document.querySelector('.jarvis-command-desk').clientWidth};
    });
    assert(m.hscroll<=1&&m.deskScroll<=1,`sideways scroll at ${width}x${height}: ${JSON.stringify({h:m.hscroll,d:m.deskScroll})}`);
    for(const b of m.boxes){
      assert(b.l>=m.desk.l-1&&b.r<=m.desk.r+1,`${b.c} sticks out of the desk at ${width}x${height}: ${JSON.stringify(b)} vs ${JSON.stringify(m.desk)}`);
      if(/jarvis-panel|agent-card/.test(b.c))assert(b.w>=140,`${b.c} squeezed to ${b.w}px at ${width}x${height}`);
    }
    await page.screenshot({path:`${process.env.SHOT_DIR||'/tmp'}/jarvis-${width}x${height}.png`});
    await context.close();
  }
  assert.deepEqual(fx.problems,[]);
  console.log('PASS: the JARVIS desk fits at 1920, 1280, 1000, 760 and 600 px wide with no sideways scroll and no squeezed panels. Browser fixture, not the installed app.');
}finally{await fx.close();}
