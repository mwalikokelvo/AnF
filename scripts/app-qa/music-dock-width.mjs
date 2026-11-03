// Regression: with a track playing, the docked player must show the track title and keep every control inside the
// pill at the default window (820x760) and every width from 600 to 1280. The pill once reserved a grid column for
// hidden extras, squeezing the title to 2px and pushing the transport past the pill; below 768px it sat on the bottom bar.
// Browser fixture only. Run `npm run build` in windows/ first.
import assert from 'node:assert/strict';
import {start,go,seedTracks} from './fixture.mjs';
const fx=await start();
try{
  for(const [width,height] of [[1280,800],[1100,700],[1024,768],[900,600],[820,760],[768,700],[700,560],[600,500]]){
    const {context,page}=await fx.open({width,height});
    await seedTracks(page);await page.reload();await page.waitForTimeout(600);
    await go(page,'music');
    await page.locator('.music-card-play[aria-label="Play Morning Light"]').click();
    await page.locator('.music-player button[aria-label="Pause"]').waitFor();
    const m=await page.evaluate(()=>{
      const pill=document.querySelector('.music-player:not(.music-full-player)'),pb=pill.getBoundingClientRect(),title=pill.querySelector('.music-now-info strong');
      const outside=[...pill.querySelectorAll('*')].filter(e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width&&(e.getBoundingClientRect().right>pb.right+1||e.getBoundingClientRect().left<pb.left-1)).map(e=>e.tagName+':'+(e.getAttribute('aria-label')||e.textContent).slice(0,20));
      const rail=document.querySelector('.history-sidebar').getBoundingClientRect();
      return{title:title.getBoundingClientRect().width,full:title.scrollWidth,outside,bottom:pb.bottom,railTop:rail.top,narrow:innerWidth<768};
    });
    assert(m.title>=Math.min(m.full,60),`track title only ${Math.round(m.title)}px wide at ${width}x${height}`);
    assert.deepEqual(m.outside,[],`player controls outside the pill at ${width}x${height}`);
    if(m.narrow)assert(m.bottom<=m.railTop+1,`player overlaps the bottom bar at ${width}x${height}`);
    await context.close();
  }
  assert.deepEqual(fx.problems,[]);
  console.log('PASS: track title visible and controls inside the pill at eight window sizes from 1280 to 600 wide; no overlap with the bottom bar. Browser fixture with a synthetic WAV, not the installed app.');
}finally{await fx.close();}
