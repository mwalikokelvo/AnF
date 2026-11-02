// Regression: Audio Studio with no track open used to show enabled "Save details" and "Remove" beside an empty title
// field. They must be disabled until a track is open (with the reason as a tooltip and an accessible description),
// and become enabled again when one opens and disabled again after it is removed.
// Browser fixture only (synthetic WAV tracks), not the installed app. Run `npm run build` in windows/ first.
import assert from 'node:assert/strict';
import {start,go,seedTracks} from './fixture.mjs';
const fx=await start();
try{
  const {context,page}=await fx.open({width:1280,height:800});
  await seedTracks(page);await page.reload();await page.locator('[data-view="home"]').waitFor({state:'attached'});
  await go(page,'audio');
  const studio=page.locator('.audio-studio');
  const save=studio.getByRole('button',{name:'Save details',exact:true}),remove=studio.getByRole('button',{name:'Remove',exact:true});
  for(const [name,button] of [['Save details',save],['Remove',remove]]){
    assert.equal(await button.isDisabled(),true,`${name} must be disabled while no track is open`);
    assert.match(await button.getAttribute('title')||'',/Open a track first/,`${name} keeps the reason as a tooltip`);
    assert.match(await button.getAttribute('aria-description')||'',/Open a track first/,`${name} keeps the reason as an accessible description`);
  }
  await page.locator('.audio-playlist button').filter({hasText:'Morning Light'}).first().click();
  await page.waitForFunction(()=>!document.querySelector('.audio-studio').hasAttribute('aria-busy'));
  for(const [name,button] of [['Save details',save],['Remove',remove]]){
    assert.equal(await button.isDisabled(),false,`${name} must be enabled once a track is open`);
    assert.equal(await button.getAttribute('title'),null,`${name} has no stale "open a track" tooltip`);
  }
  page.on('dialog',d=>d.accept());
  await remove.click();
  await page.waitForFunction(()=>[...document.querySelectorAll('.audio-studio button')].find(b=>b.textContent==='Remove')?.disabled===true);
  assert.equal(await save.isDisabled(),true,'Save details is disabled again after the open track is removed');
  assert.deepEqual(fx.problems,[]);
  console.log('PASS: Audio Studio disables Save details and Remove until a track is open, explains why, and re-disables after removal. Browser fixture, not the installed app.');
}finally{await fx.close();}
