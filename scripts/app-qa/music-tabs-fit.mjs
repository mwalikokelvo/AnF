// Regression: at 1366 (3-column Music Hub) and at 820 wide the last Music Hub tab ("Playlists") was cut off by the hub's
// edge, so it could not be seen or clicked. Every tab must lie fully inside the tab row, in both text sizes, dark and light.
// Browser fixture only. Run `npm run build` in windows/ first.
import assert from 'node:assert/strict';
import {start,go} from './fixture.mjs';
const fx=await start();
try{
  for(const [width,height] of [[1920,1080],[1440,900],[1366,768],[1281,800],[1280,800],[1100,700],[900,600],[820,760],[768,700],[600,500]])
    for(const size of ['normal','large']){
      const {context,page}=await fx.open({width,height});
      await context.addInitScript(s=>{try{localStorage.setItem('coucou-appearance',JSON.stringify({theme:'dark',size:s}))}catch{}},size);
      await page.reload();await page.locator('[data-view="home"]').waitFor({state:'attached'});
      await go(page,'music');
      const m=await page.evaluate(()=>{
        const row=document.querySelector('.music-tabs').getBoundingClientRect(),hub=document.querySelector('.music-hub').getBoundingClientRect();
        const tabs=[...document.querySelectorAll('.music-tabs button')].map(b=>({name:b.textContent.trim(),r:b.getBoundingClientRect()}));
        return{tabs:tabs.filter(t=>t.r.right>row.right+1||t.r.right>hub.right+1||t.r.left<row.left-1).map(t=>`${t.name} ends ${Math.round(t.r.right)} > ${Math.round(Math.min(row.right,hub.right))}`),count:tabs.length};
      });
      assert.equal(m.count,6,'six hub tabs');
      assert.deepEqual(m.tabs,[],`Music Hub tabs cut off at ${width}x${height} (${size} text)`);
      await context.close();
    }
  assert.deepEqual(fx.problems,[]);
  console.log('PASS: all six Music Hub tabs fit inside the tab row at ten window sizes from 1920 to 600 wide, normal and large text. Browser fixture, not the installed app.');
}finally{await fx.close();}
