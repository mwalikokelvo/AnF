// Regression: at 1280 wide the docked player squeezed a long track title to ~71px because the extras column (eight
// small buttons) stayed visible beside it. At 1280 and below the extras collapse so the title gets the room (they
// remain in the full player); above 1280 the pill is unchanged and still shows the extras.
// Browser fixture with synthetic WAV tracks, not the installed app. Run `npm run build` in windows/ first.
import assert from 'node:assert/strict';
import {start,go,seedTracks,retitleTrack} from './fixture.mjs';
const fx=await start();
try{
  for(const [width,height] of [[1280,800],[1100,700],[820,760],[1366,768],[1920,1080]]){
    const {context,page}=await fx.open({width,height});
    await seedTracks(page);
    await retitleTrack(page,'qa-2',{title:'Morning Light (Extended Studio Mix)',artist:'Elise Monroe feat. Theo Marks'});
    await page.reload();await page.locator('[data-view="home"]').waitFor({state:'attached'});
    await go(page,'music');
    await page.locator('.music-card-play[aria-label^="Play Morning Light"]').click();
    await page.locator('.music-player button[aria-label="Pause"]').waitFor();
    const m=await page.evaluate(()=>{
      const pill=document.querySelector('.music-player:not(.music-full-player)'),title=pill.querySelector('.music-now-info strong'),extras=pill.querySelector('.music-extras');
      return{title:title.getBoundingClientRect().width,full:title.scrollWidth,extras:getComputedStyle(extras).display,left:pill.getBoundingClientRect().left};
    });
    if(width<=1280)assert(m.title>=(width>=1100?160:120),`long title only ${Math.round(m.title)}px wide (of ${m.full}) at ${width}x${height}`);
    if(width<=1280)assert.equal(m.extras,'none',`extras should collapse at ${width}x${height}`);
    if(width>1280)assert.notEqual(m.extras,'none',`extras must stay visible at ${width}x${height} (look unchanged above 1280)`);
    if(width===1280)assert(m.left>=250,`pill must keep its wide-window left edge at 1280 (left ${m.left}; the 234px edge starts at 1200)`);
    await context.close();
  }
  assert.deepEqual(fx.problems,[]);
  console.log('PASS: long track title keeps at least 160px at 1100-1280 (120px at 820) (extras collapse); extras and pill position unchanged above 1280. Browser fixture, not the installed app.');
}finally{await fx.close();}
