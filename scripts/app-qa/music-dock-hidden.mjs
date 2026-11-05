// Regression: with no track loaded the docked music player must stay hidden. A `display:grid!important` pill rule
// once overrode [hidden], so an empty player (all controls, 0:00) covered the bottom of every view.
// Browser fixture only. Run `npm run build` in windows/ first.
import assert from 'node:assert/strict';
import {start,go} from './fixture.mjs';
const fx=await start();
try{
  for(const [width,height] of [[1280,800],[900,600]]){
    const {context,page}=await fx.open({width,height});
    await page.waitForTimeout(500);
    for(const view of ['home','chat','documents','writing','settings']){
      await go(page,view);
      const shown=await page.evaluate(()=>[...document.querySelectorAll('.music-player')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.className));
      assert.deepEqual(shown,[],`empty music player visible on ${view} at ${width}x${height}`);
    }
    await context.close();
  }
  assert.deepEqual(fx.problems,[]);
  console.log('PASS: no empty music player on any non-music view at 1280x800 and 900x600. Browser fixture, not the installed app.');
}finally{await fx.close();}
