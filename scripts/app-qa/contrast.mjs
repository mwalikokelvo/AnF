// WCAG AA text contrast (4.5:1, 3:1 for large text) of every visible text run, measured from real pixels, in the
// dark and light themes. AREAS lists the sections this run holds to the standard; each fix adds its area here.
// Env: SIZES='[[1280,800]]' (window sizes), TEXTS=normal,large, VIEWS=home,music (subset), RAIL=1 also measures the rail
// while it is open. Browser fixture only (fictional tracks, synthetic WAV), not the installed app.
import assert from 'node:assert/strict';
import {start,go,seedTracks} from './fixture.mjs';
import {measureScrolled,measure} from './contrast-probe.mjs';
// 'music-playing' is the Music Hub with a track playing (docked player, now-playing panel).
// 'audio-open' is Audio Studio with a track open (waveform, docked mini player, queue highlight).
const AREAS={
  'music-hub-light':{views:['music','music-playing']},
  'audio-light':{views:['audio','audio-open']},
};
const views=process.env.VIEWS?process.env.VIEWS.split(','):[...new Set(Object.values(AREAS).flatMap(a=>a.views))];
const railViews=new Set(Object.values(AREAS).filter(a=>a.rail).flatMap(a=>a.views));
const sizes=JSON.parse(process.env.SIZES||'[[1280,800]]'),texts=(process.env.TEXTS||'normal').split(',');
const fx=await start();const failures=[];
try{
  for(const [width,height] of sizes)for(const theme of ['dark','light'])for(const size of texts){
    const {context,page}=await fx.open({width,height});
    await context.addInitScript(([t,s])=>{try{localStorage.setItem('coucou-appearance',JSON.stringify({theme:t,size:s}))}catch{}},[theme,size]);
    await page.reload();await page.locator('[data-view="home"]').waitFor({state:'attached'});
    await seedTracks(page);await page.reload();await page.locator('[data-view="home"]').waitFor({state:'attached'});
    for(const view of views){
      await go(page,view==='music-playing'?'music':view==='audio-open'?'audio':view);
      if(view==='audio-open'){await page.locator('.audio-playlist button').filter({hasText:'Morning Light'}).first().click();await page.waitForFunction(()=>!document.querySelector('.audio-studio').hasAttribute('aria-busy'));}
      if(view==='music-playing'){await page.locator('.music-card-play[aria-label^="Play Morning"]').click();await page.locator('.music-player button[aria-label="Pause"]').waitFor();}
      await page.mouse.move(width*.6,height*.5);await page.waitForTimeout(700);
      for(const r of await measureScrolled(page))failures.push(`${width}x${height}/${theme}/${size} ${view}: "${r.t}" ${r.ratio.toFixed(2)}:1 < ${r.need} (${r.sel})`);
      if(process.env.RAIL||railViews.has(view)){await page.locator('.history-sidebar').hover({force:true});await page.waitForTimeout(700);
        for(const r of await measure(page,{onlyRail:true}))failures.push(`${width}x${height}/${theme}/${size} ${view} rail open: "${r.t}" ${r.ratio.toFixed(2)}:1 < ${r.need} (${r.sel})`);}
    }
    await context.close();
  }
  assert.deepEqual([...new Set(failures)],[],'text below WCAG AA contrast');
  assert.deepEqual(fx.problems,[]);
  console.log(`PASS: text contrast >= WCAG AA on ${views.join(', ')} at ${sizes.map(s=>s.join('x')).join(', ')}, dark and light, ${texts.join(' and ')} text. Browser fixture, not the installed app.`);
}finally{await fx.close();}
