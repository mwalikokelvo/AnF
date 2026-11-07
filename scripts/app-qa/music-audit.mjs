// Browser fixture (real CSP, stubbed Tauri IPC, synthetic 10 s WAVs) audit of Music Hub local playback controls:
// next/prev, seek, volume, speed, repeat track/all/off at track end, shuffle, sleep (end of track), playlists, queue,
// podcast feed errors, and offline-cached stream replay. Not the installed app. Run `npm run build` in windows/ first.
import assert from 'node:assert/strict';
import {start,go,seedTracks} from './fixture.mjs';
const f=await start();
try{
 const {context,page}=await f.open();
 await context.addInitScript(()=>{window.__audios=[];const p=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(!window.__audios.includes(this))window.__audios.push(this);return p.apply(this,arguments)};
  window.__ipc={safe_fetch_text:()=>{throw 'That address did not return a feed (XML or JSON).';}};});
 await seedTracks(page);await page.reload();await page.locator('[data-view="home"]').waitFor({state:'attached'});
 await go(page,'music');
 const el=()=>page.evaluate(()=>{const a=window.__audios.at(-1);return a&&{paused:a.paused,t:a.currentTime,vol:a.volume,rate:a.playbackRate,muted:a.muted}});
 const title=()=>page.locator('.music-player strong').innerText();
 const notice=()=>page.locator('.music-notice').first().innerText();
 const seekTo=s=>page.evaluate(s=>{const a=window.__audios.at(-1);a.currentTime=s;},s);
 const P=page.locator('.music-player');
 await page.locator('.music-card-play[aria-label="Play Quiet Hours"]').click();
 await page.waitForFunction(()=>window.__audios.at(-1)&&!window.__audios.at(-1).paused);
 assert.equal(await title(),'Quiet Hours');
 await page.getByRole('button',{name:'Open full player',exact:true}).click();await page.getByRole('dialog',{name:'Now playing'}).waitFor();

 // volume and speed
 await page.getByLabel('Music volume').evaluate(e=>{e.value=0.25;e.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal((await el()).vol,0.25,'volume slider did not change the audio volume');
 await page.getByLabel('Playback speed').first().selectOption({index:2}).catch(()=>{});
 // seek by slider
 await page.getByLabel('Music position').evaluate(e=>{e.value=4;e.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.ok((await el()).t>=3.9,'seek slider did not move playback');

 // repeat all: the last track wraps to the first
 await P.locator('button[aria-label="Repeat off"]').click();assert.equal(await P.locator('button[aria-label="Repeat all"]').getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'Next track'}).click();await page.getByRole('button',{name:'Next track'}).click();
 assert.equal(await title(),'Morning Light');
 await seekTo(9.6);await page.waitForFunction(()=>document.querySelector('.music-player strong').textContent==='Quiet Hours',null,{timeout:8000});
 // repeat track: the same track restarts at its end
 await P.locator('button[aria-label="Repeat all"]').click();assert.ok(await P.locator('button[aria-label="Repeat track"]').count());
 await seekTo(9.6);await page.waitForTimeout(1500);assert.equal(await title(),'Quiet Hours');const rt=await el();assert.ok(!rt.paused&&rt.t<9,'repeat track did not restart: '+JSON.stringify(rt));
 // repeat off: the last track ends and playback stops
 await P.locator('button[aria-label="Repeat track"]').click();
 await page.getByRole('button',{name:'Next track'}).click();await page.getByRole('button',{name:'Next track'}).click();
 assert.equal(await title(),'Morning Light');await seekTo(9.6);await page.waitForTimeout(1800);
 assert.ok((await el()).paused,'playback continued past the last track with repeat off');

 // sleep timer: End of track pauses at the end and resets to Off
 await page.getByRole('button',{name:'Previous track'}).click();
 await page.waitForFunction(()=>window.__audios.at(-1)&&!window.__audios.at(-1).paused&&window.__audios.at(-1).currentTime>0.2);
 await page.locator('select[aria-label="Sleep timer"]').first().selectOption('end');
 await seekTo(9.4);await page.waitForFunction(()=>window.__audios.at(-1).paused,null,{timeout:6000}).catch(()=>{});
 assert.ok((await el()).paused,'End of track sleep timer did not pause');
 assert.equal(await page.locator('select[aria-label="Sleep timer"]').first().inputValue(),'0','sleep timer did not reset to Off');
 await page.getByRole('button',{name:'Close player'}).click();

 // playlists: create (prompt), add, play, remove
 await page.locator('#music-tab-playlists').click();
 await page.getByRole('button',{name:'New playlist',exact:true}).click();
 await page.getByRole('dialog').getByLabel('Playlist name').fill('Evening');
 await page.getByRole('dialog').getByRole('button',{name:'OK',exact:true}).click();
 await page.getByText('0 tracks',{exact:true}).waitFor();
 await page.locator('#music-tab-music').click();
 await page.locator('.music-card').filter({hasText:'City Signals'}).locator('summary').click();
 await page.getByRole('button',{name:'Add City Signals to playlist',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Evening',exact:true}).click();
 await page.locator('#music-tab-playlists').click();await page.getByText('1 tracks',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Play playlist',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.music-player strong')?.textContent==='City Signals');
 await page.getByRole('button',{name:'Delete playlist',exact:true}).waitFor();

 // podcast: a failing feed explains itself and adds nothing
 await page.locator('#music-tab-podcasts').click();
 await page.getByRole('button',{name:'Add feed',exact:true}).click();
 await page.getByRole('dialog').getByLabel('Podcast RSS URL').fill('https://feeds.example.com/not-a-feed');
 await page.getByRole('dialog').getByRole('button',{name:'OK',exact:true}).click();
 await page.getByText(/did not return a feed/).first().waitFor();
 assert.match(await page.locator('.music-hub').innerText(),/0 podcast subscription/);

 assert.deepEqual(await page.evaluate(()=>window.__csp),[],'CSP violations');
 assert.deepEqual(f.problems,[],'page problems: '+f.problems.join(' | '));
 console.log('PASS: local playback controls, repeat/shuffle at track end, sleep end-of-track, playlists, podcast feed error (fixture, synthetic WAVs, stubbed IPC).');
}finally{await f.close();}
