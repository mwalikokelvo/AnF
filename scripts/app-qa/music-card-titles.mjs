// Music cards cut long titles and artist lines with an ellipsis; the full text must be available on hover (title attribute).
import assert from 'node:assert/strict';
import {start,go,seedTracks} from './fixture.mjs';
const fx=await start();
try{
  const {page}=await fx.open({width:1280,height:800});
  await page.reload();await page.locator('[data-view="home"]').waitFor({state:'attached'});await seedTracks(page);await page.reload();await page.locator('[data-view="home"]').waitFor({state:'attached'});
  await go(page,'music');await page.locator('.music-card').first().waitFor();
  const cut=await page.evaluate(()=>[...document.querySelectorAll('.music-card-play strong, .music-card-play span:not(.music-card-badge)')].filter(e=>e.scrollWidth>e.clientWidth+1&&!e.title).map(e=>e.textContent));
  const all=await page.evaluate(()=>[...document.querySelectorAll('.music-card-play strong')].filter(e=>e.title!==e.textContent).length);
  assert.equal(all,0,'every card title carries its full text as a tooltip');
  assert.deepEqual(cut,[],'truncated card text has a tooltip');
}finally{await fx.close();}
assert.deepEqual(fx.problems,[]);
console.log('PASS: music card titles and artist lines expose their full text on hover. Browser fixture, not the installed app.');
