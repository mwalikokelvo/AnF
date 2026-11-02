// Regression: at the smallest window the app allows (600x500, bottom-bar layout) the stacked header used to take
// ~236px and pin the rest into a ~114px scroll box. The header must scroll away so content gets most of the window,
// while the status bar stays visible above the bottom bar and nothing overflows sideways.
// Browser fixture only. Run `npm run build` in windows/ first.
import assert from 'node:assert/strict';
import {start,go} from './fixture.mjs';
const fx=await start();
try{
  for(const [width,height] of [[600,500],[700,560]]){
    const {context,page}=await fx.open({width,height});
    for(const view of ['home','chat','documents','writing','music','audio','settings']){
      await go(page,view);
      const m=await page.evaluate(()=>{
        const main=document.querySelector('main.workspace-content'),bar=document.querySelector('.activity-bar'),header=document.querySelector('.workspace-header'),rail=document.querySelector('.history-sidebar');
        main.scrollTop=header.getBoundingClientRect().height; // scroll the header away
        const panel=document.querySelector('.workspace-panel:not([hidden])'),pb=panel.getBoundingClientRect(),bb=bar.getBoundingClientRect();
        return{visible:Math.round(bb.top-Math.max(0,pb.top)),barBottom:Math.round(bb.bottom),railTop:Math.round(rail.getBoundingClientRect().top),hscroll:document.documentElement.scrollWidth-innerWidth,mainH:Math.round(main.getBoundingClientRect().height)};
      });
      assert(m.hscroll<=1,`horizontal scroll on ${view} at ${width}x${height}`);
      assert(m.barBottom<=m.railTop+1,`status bar runs under the bottom bar on ${view} at ${width}x${height}: ${JSON.stringify(m)}`);
      assert(m.visible>=Math.round(height*0.5),`only ${m.visible}px of ${view} content visible at ${width}x${height}: ${JSON.stringify(m)}`);
    }
    await context.close();
  }
  assert.deepEqual(fx.problems,[]);
  console.log('PASS: header scrolls away at 600x500 and 700x560; content gets at least half the window on every view. Browser fixture, not the installed app.');
}finally{await fx.close();}
