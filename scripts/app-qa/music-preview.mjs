// Browser fixture (real CSP, stubbed IPC and stubbed network) for the 30 s preview report: a catalogue clip must never be
// presented or stored as the full song. Stubs: iTunes search (previewUrl -> a 30 s WAV), YouTube instances (down, then up with a
// 4-minute track). Not the installed app; no live network. Run `npm run build` in windows/ first.
import assert from 'node:assert/strict';
import {start,go} from './fixture.mjs';
const wav=seconds=>{const rate=8000,n=rate*seconds,b=Buffer.alloc(44+n);b.write('RIFF',0);b.writeUInt32LE(36+n,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate,28);b.writeUInt16LE(1,32);b.writeUInt16LE(8,34);b.write('data',36);b.writeUInt32LE(n,40);b.fill(128,44);return b;};
const clip=wav(30),full=wav(240);
const f=await start();
try{
 const {context,page}=await f.open();
 await context.addInitScript(()=>{window.__audios=[];const p=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(!window.__audios.includes(this))window.__audios.push(this);return p.apply(this,arguments)};});
 await page.reload();await page.locator('[data-view="home"]').waitFor({state:'attached'});
 let youtubeUp=false;
 await context.route(/^https:\/\//,route=>{
  const u=new URL(route.request().url());
  if(u.hostname==='itunes.apple.com')return route.fulfill({contentType:'application/json',body:JSON.stringify({results:[{trackId:7,trackName:'WIMBO WANGU',artistName:'JTC ARUSHA',collectionName:'WIMBO WANGU - Single',trackTimeMillis:240000,previewUrl:'https://audio-ssl.itunes.apple.com/clip.wav'}]})});
  if(u.hostname==='audio-ssl.itunes.apple.com')return route.fulfill({contentType:'audio/wav',body:clip});
  if(u.hostname==='rr1.googlevideo.com')return route.fulfill({contentType:'audio/wav',body:full});
  if(!youtubeUp)return route.fulfill({status:503,contentType:'text/plain',body:'busy'});
  if(u.pathname.startsWith('/search'))return route.fulfill({contentType:'application/json',body:JSON.stringify({items:[{url:'/watch?v=zn1FHSWPaTk',title:'WIMBO WANGU (full)',uploaderName:'JTC ARUSHA',duration:240}]})});
  return route.fulfill({contentType:'application/json',body:JSON.stringify({title:'WIMBO WANGU (full)',uploader:'JTC ARUSHA',duration:240,audioStreams:[{url:'https://rr1.googlevideo.com/full.wav',mimeType:'audio/wav',bitrate:128000}]})});
 });
 await go(page,'music');await page.getByRole('tab',{name:'Streaming',exact:true}).click();
 await page.getByLabel('Online lookups').check();
 const notice=()=>page.locator('.music-notice').first().innerText();
 const search=async()=>{await page.locator('.music-stream-search input').fill('wimbo wangu');await page.getByRole('button',{name:'Search',exact:true}).click();};
 const duration=()=>page.evaluate(()=>new Promise(r=>{const a=window.__audios.at(-1);const done=()=>r(a.duration);if(a.duration>0)done();else a.addEventListener('loadedmetadata',done,{once:true});}));

 // 1. No full source (YouTube services down): the 30 s clip plays, plainly labelled, and cannot be saved as the song.
 await page.getByRole('tab',{name:'Spotify / Spotube'}).click();await search();
 await page.getByRole('button',{name:'Stream WIMBO WANGU'}).click();
 await page.getByText(/Only a 30 s preview/).first().waitFor();
 assert.ok(Math.abs(await duration()-30)<1,'preview clip duration');
 assert.match(await page.locator('.music-drawer, body').first().innerText(),/30 s PREVIEW/i,'player is not labelled as a preview');
 assert.match(await notice(),/YouTube/);assert.match(await notice(),/direct audio link/i);assert.match(await notice(),/import/i);
 await page.getByRole('button',{name:'Save offline',exact:true}).click();
 await page.getByText(/not saved to your library/).first().waitFor();
 const stored=await page.evaluate(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('coucou-audio',2);q.onsuccess=()=>r(q.result);});return await new Promise(r=>{const q=db.transaction('tracks').objectStore('tracks').getAll();q.onsuccess=()=>r(q.result.map(t=>t.id));});});
 assert.deepEqual(stored,[],'a preview was stored in the library: '+stored);

 // 2. A full source exists (YouTube services up): the 4-minute track plays, no preview notice.
 youtubeUp=true;
 await page.getByRole('tab',{name:'Spotify / Spotube'}).click();await search();
 await page.getByRole('button',{name:'Stream WIMBO WANGU'}).first().click();
 await page.waitForFunction(()=>{const a=window.__audios.at(-1);return a&&a.duration>200;});
 assert.doesNotMatch(await page.locator('body').innerText(),/30 s PREVIEW|Only a 30 s preview/);
 assert.deepEqual(await page.evaluate(()=>window.__csp),[],'CSP violations');
 assert.deepEqual(f.problems.filter(p=>!/503/.test(p)),[],'page problems: '+f.problems.join(' | '));
 console.log('PASS: previews are labelled and never saved; a full source plays 240 s (stubbed network; no live network).');
}finally{await f.close();}
