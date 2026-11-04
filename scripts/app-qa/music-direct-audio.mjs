// Browser fixture (real CSP, stubbed Tauri IPC and stubbed Rust safe_fetch_audio) for pasted direct audio links and podcast
// episodes in Music Hub. A host outside CSP media-src must still play (Rust downloads it, the page plays a blob) and must
// not raise CSP violations. Not the installed app; no live network. Run `npm run build` in windows/ first.
import assert from 'node:assert/strict';
import {start,go} from './fixture.mjs';
const f=await start();
try{
 const {context,page}=await f.open();
 await context.addInitScript(()=>{
  window.__fetched=[];window.__audios=[];
  const p=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(!window.__audios.includes(this))window.__audios.push(this);return p.apply(this,arguments)};
  const wav=()=>{const b=new Uint8Array(44+16000*10),v=new DataView(b.buffer),t=(a,s)=>[...s].forEach((c,i)=>v.setUint8(a+i,c.charCodeAt(0)));t(0,'RIFF');v.setUint32(4,b.length-8,true);t(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);t(36,'data');v.setUint32(40,b.length-44,true);return Array.from(b);};
  window.__ipc={safe_fetch_text:({url})=>({finalUrl:url,contentType:'application/rss+xml',body:'<?xml version="1.0"?><rss version="2.0"><channel><title>QA Cast</title><item><title>Ep One</title><guid>g1</guid><enclosure url="https://cdn.example.com/ep1.mp3" type="audio/mpeg" length="1"/></item></channel></rss>'}),safe_fetch_audio:({url})=>{window.__fetched.push(url);if(/\/page$/.test(url))throw 'That address did not return audio.';return wav();}};
 });
 await page.reload();await page.locator('[data-view="home"]').waitFor({state:'attached'});
 await go(page,'music');await page.getByRole('tab',{name:'Streaming',exact:true}).click();
 const direct=page.getByLabel('Direct stream link');const notice=()=>page.locator('.music-notice').first().innerText();
 const audio=()=>page.evaluate(()=>window.__audios.map(a=>({paused:a.paused,err:a.error&&a.error.code,blob:a.src.startsWith('blob:'),t:a.currentTime})).pop());

 // 1. A direct link on a host the CSP does not list plays through Rust, as a blob, with no CSP violation.
 await direct.fill('https://cdn.example.com/a/song.mp3');await page.getByRole('button',{name:'Play URL',exact:true}).click();
 await page.getByText('Playing: song').first().waitFor();await page.waitForTimeout(1200);
 const a=await audio();assert.ok(a&&a.blob&&!a.paused&&!a.err&&a.t>0.5,'direct link not playing from a blob: '+JSON.stringify(a));
 assert.deepEqual(await page.evaluate(()=>window.__fetched),['https://cdn.example.com/a/song.mp3']);
 assert.deepEqual(await page.evaluate(()=>window.__csp),[],'CSP violations');

 // 2. Rust refuses a page: the message says so and the success text is not shown.
 await direct.fill('https://cdn.example.com/page');await page.getByRole('button',{name:'Play URL',exact:true}).click();
 await page.getByText(/not audio, so it was not played or saved/).first().waitFor();assert.doesNotMatch(await notice(),/Playing:/);

 // 3. Save Offline needs Online lookups, then stores the Rust download.
 await direct.fill('https://cdn.example.com/a/song.mp3');await page.getByRole('button',{name:'Save Offline',exact:true}).click();
 await page.getByText(/Online lookups/).first().waitFor();
 await page.getByLabel('Online lookups').check();await page.getByRole('button',{name:'Save Offline',exact:true}).click();
 await page.getByText('Saved to library: song').first().waitFor();
 await page.getByRole('tab',{name:'Cached Offline',exact:true}).click();await page.getByText('Offline cached streams (1)').waitFor();
 assert.deepEqual(await page.evaluate(()=>window.__csp),[],'CSP violations after save');
 // 4. A podcast episode (host outside media-src) plays from a Rust download and the "Loading audio..." notice does not linger.
 await page.evaluate(()=>{window.__fetched.length=0;});
 await page.getByRole('tab',{name:'Podcasts',exact:true}).click();
 await page.getByRole('button',{name:'Add feed',exact:true}).click();
 await page.getByRole('dialog').getByLabel('Podcast RSS URL').fill('https://feeds.example.com/qa.xml');
 await page.getByRole('dialog').getByRole('button',{name:'OK',exact:true}).click();
 await page.getByText('QA Cast').first().waitFor();
 await page.getByRole('button',{name:'Open podcast'}).click();
 await page.getByRole('button',{name:'Play episode',exact:true}).click();
 await page.waitForFunction(()=>window.__audios.length&&window.__audios.at(-1).src.startsWith('blob:')&&!window.__audios.at(-1).paused&&window.__audios.at(-1).currentTime>0.3);
 assert.ok((await page.evaluate(()=>window.__fetched)).includes('https://cdn.example.com/ep1.mp3'),'episode not fetched through Rust');
 assert.doesNotMatch(await notice(),/Loading audio/,'stale loading notice after playback started');
 assert.deepEqual(await page.evaluate(()=>window.__csp),[],'CSP violations');
 assert.deepEqual(f.problems,[],'page problems: '+f.problems.join(' | '));
 console.log('PASS: direct audio links on hosts outside media-src play from a Rust download, refuse non-audio with the real reason, and save offline (stubbed IPC; no live network).');
}finally{await f.close();}
