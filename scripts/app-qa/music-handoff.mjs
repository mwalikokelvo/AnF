// Real browser Audio playback of generated local WAVs; controlled handoff ACKs.
// Does not exercise a native engine, real provider, installed app or user library.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium} from 'playwright-core';

const root=fileURLToPath(new URL('../../',import.meta.url));
const {build}=createRequire(path.join(root,'windows/package.json'))('esbuild');
const built=await build({stdin:{resolveDir:path.join(root,'windows'),loader:'ts',contents:`
import {createMusicHub} from './src/workspace/music-hub';
const bytes=new ArrayBuffer(44+16000*20),view=new DataView(bytes);
const text=(at,s)=>Array.from(s).forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
text(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');
view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
text(36,'data');view.setUint32(40,bytes.byteLength-44,true);
const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('coucou-audio',2);
 r.onupgradeneeded=()=>{for(const name of ['tracks','state','playlists'])r.result.createObjectStore(name,{keyPath:'id'});};
 r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const tx=db.transaction('tracks','readwrite');
for(const [id,title,created] of [['one','First generated track',2],['two','Second generated track',1]]){
 tx.objectStore('tracks').put({id,title,artist:'Fixture',name:id+'.wav',created,blob:new Blob([bytes],{type:'audio/wav'}),duration:20});}
await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
localStorage.setItem('anf-music-player',JSON.stringify({current:'one',queue:['one','two'],originalQueue:['one','two']}));
window.qaAcks=[];window.qaNotices=[];
window.qaHub=createMusicHub({notify:text=>window.qaNotices.push(text),beforePlay:()=>new Promise((resolve,reject)=>window.qaAcks.push({resolve,reject}))});
document.body.append(window.qaHub.root);await window.qaHub.ready;window.qaReady=true;
`},bundle:true,format:'esm',outdir:'qa',write:false});
const js=built.outputFiles.find(f=>f.path.endsWith('.js')).contents;
const css=built.outputFiles.find(f=>f.path.endsWith('.css')).contents;
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':req.url==='/app.css'?'text/css':'text/html');res.end(req.url==='/app.js'?js:req.url==='/app.css'?css:'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><script type="module" src="/app.js"></script>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({...(process.env.CHROMIUM_BIN?{executablePath:process.env.CHROMIUM_BIN}:{channel:'msedge'}),headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext(),page=await context.newPage();
 const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('https://**',route=>{external.push(route.request().url());return route.abort();});
 await context.addInitScript(()=>{const Original=window.Audio;window.qaAudio=[];window.Audio=new Proxy(Original,{construct(target,args){const audio=new target(...args);audio.muted=true;window.qaAudio.push(audio);return audio;}});});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.qaReady);
 const start=async method=>{const count=await page.evaluate(()=>window.qaAcks.length);await page.evaluate(method=>{window.qaPending=Promise.resolve(window.qaHub[method]()).then(()=>null,e=>String(e));},method);await page.waitForFunction(count=>window.qaAcks.length===count+1,count);return count;};
 const ack=async(index,ok=true)=>{await page.evaluate(({index,ok})=>{window.qaAcks[index][ok?'resolve':'reject'](ok?undefined:Error('Other player did not pause'));},{index,ok});return page.evaluate(()=>window.qaPending);};
 const paused=async()=>assert.equal(await page.evaluate(()=>window.qaAudio[0].paused),true);
 let n=await start('resume');await paused();await page.evaluate(()=>window.qaHub.pause());await ack(n);await paused();
 n=await start('resume');await ack(n);await page.waitForFunction(()=>!window.qaAudio[0].paused&&window.qaAudio[0].currentTime>0.05);
 await page.evaluate(()=>window.qaHub.pause());await paused();
 n=await start('resume');await page.evaluate(()=>window.qaHub.suspend());await ack(n);await paused();assert.equal(await page.locator('aside.music-player').isHidden(),true);
 n=await start('resume');await page.evaluate(()=>window.qaHub.stop());await ack(n);await paused();assert.equal(await page.evaluate(()=>window.qaHub.getState()),'idle');
 n=await start('resume');assert.match(await ack(n,false),/Other player did not pause/);await paused();
 // A newer selection owns playback even when the older ACK arrives afterwards.
 const old=await start('resume');
 await page.evaluate(()=>{window.qaNext=window.qaHub.step(1);});
 await page.waitForFunction(count=>window.qaAcks.length===count+2,old);
 await page.evaluate(index=>window.qaAcks[index].resolve(),old);await page.evaluate(()=>window.qaPending);await paused();
 await page.evaluate(index=>window.qaAcks[index].resolve(),old+1);await page.evaluate(()=>window.qaNext);
 await page.waitForFunction(()=>!window.qaAudio[0].paused&&document.querySelector('.music-player strong')?.textContent==='Second generated track');
 await page.evaluate(()=>window.qaHub.suspend());await paused();
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('PASS: generated WAV advances only after ACK; pause, suspend, stop, failed ACK and newer selection invalidate late starts. No provider requests.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
