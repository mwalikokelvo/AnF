// Regression: with "reduce motion" on, no visible element may keep a CSS transition or animation (the Music Hub kept 0.15-0.25s
// hover/lift transitions behind !important rules that beat the global reduced-motion reset) and nothing may smooth-scroll.
// Covers every section, plus the Music Hub with a track playing and the full player open. Browser fixture, not the installed app.
import assert from 'node:assert/strict';
import {start,go,seedTracks} from './fixture.mjs';
const fx=await start();
const motion=()=>{
  const found=new Set(),secs=v=>parseFloat(v)*(/ms$/.test(v.trim())?.001:1);
  for(const el of document.querySelectorAll('*')){
    if(el.closest('[hidden]'))continue;
    const s=getComputedStyle(el),who=el.tagName.toLowerCase()+'.'+String(el.className).split(' ')[0];
    if(s.animationName!=='none'&&s.animationDuration.split(',').some(d=>secs(d)>0.01))found.add(`animation ${s.animationName} ${s.animationDuration} on ${who}`);
    if(s.transitionProperty!=='none'&&s.transitionDuration.split(',').some(d=>secs(d)>0.01))found.add(`transition ${s.transitionDuration} ${s.transitionProperty} on ${who}`);
    if(s.scrollBehavior==='smooth')found.add('smooth scrolling on '+who);
  }
  return[...found];
};
try{
  const {context,page}=await fx.open({width:1280,height:800});
  await page.emulateMedia({reducedMotion:'reduce'});
  await seedTracks(page);await page.reload();await page.locator('[data-view="home"]').waitFor({state:'attached'});
  const problems=[];
  for(const view of ['home','chat','documents','writing','music','audio','settings']){
    await go(page,view);await page.waitForTimeout(400);
    if(view==='music'){
      await page.locator('.music-card-play[aria-label^="Play Morning"]').click();await page.locator('.music-player button[aria-label="Pause"]').waitFor();await page.waitForTimeout(300);
      problems.push(...(await page.evaluate(motion)).map(p=>'music playing: '+p));
      await page.getByRole('button',{name:'Open full player'}).click();await page.getByRole('dialog',{name:'Now playing'}).waitFor();await page.waitForTimeout(300);
      problems.push(...(await page.evaluate(motion)).map(p=>'full player: '+p));
      await page.keyboard.press('Escape');await page.waitForTimeout(200);
      continue;
    }
    problems.push(...(await page.evaluate(motion)).map(p=>view+': '+p));
  }
  assert.deepEqual([...new Set(problems)],[],'motion left on under prefers-reduced-motion');
  assert.deepEqual(fx.problems,[]);
  console.log('PASS: no CSS transition, animation or smooth scrolling under reduced motion on any section, the playing Music Hub or the full player. Browser fixture, not the installed app.');
  await context.close();
}finally{await fx.close();}
