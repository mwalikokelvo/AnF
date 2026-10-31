import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
const require=createRequire(new URL('../windows/package.json',import.meta.url)),{build}=require('esbuild');
const dir=await mkdtemp(path.join(tmpdir(),'anf-voices-'));let played=0;
try{
 await build({entryPoints:[new URL('../windows/src/workspace/local-voices.ts',import.meta.url).pathname.replace(/^\/([A-Z]:)/i,'$1')],bundle:true,format:'esm',platform:'node',outfile:path.join(dir,'voices.mjs')});
 const {localVoices}=await import(pathToFileURL(path.join(dir,'voices.mjs')));
 assert((await localVoices()).every(v=>!v.available()));
 assert((await localVoices(async()=>{throw Error('Missing pack');})).every(v=>!v.available()&&v.unavailableReason==='Error: Missing pack'));
 globalThis.Audio=class{constructor(){this.playbackRate=1;}pause(){}removeAttribute(){}load(){}play(){played++;this.playbackRate=1;this.onloadedmetadata();assert.equal(this.playbackRate,1.5);assert.equal(this.defaultPlaybackRate,1.5);queueMicrotask(()=>this.onended());return Promise.resolve();}};
 const chunks=[];const invoke=async(command,args)=>{if(command==='local_voice_speak'){chunks.push(args.text);return [82,73,70,70];}};
 const voices=await localVoices(invoke);assert.equal(voices.length,5);assert(voices.every(v=>v.available()));assert.deepEqual(voices.map(v=>v.id),['amazing','always-forever','burt-preview','serafina-preview','kelvin-preview']);
 let ended=0;await new Promise((resolve,reject)=>voices[0].speak('🌻'.repeat(700),1.5,{onBoundary:()=>reject(Error('Invented boundary')),onEnd:()=>{ended++;resolve();},onError:reject}));
 assert.equal(chunks.join(''),'🌻'.repeat(700));assert(chunks.every(s=>s.length<=500&&!/[\uD800-\uDBFF]$/.test(s)));assert.equal(played,chunks.length);assert.equal(ended,1);
 let resolveJob,cancelled=false;const slow=await localVoices(async(command)=>{if(command==='local_voice_speak')return new Promise(resolve=>{resolveJob=resolve;});if(command==='local_voice_cancel')cancelled=true;});
 const session=slow[0].speak('Cancelled new text.',1.5,{onEnd:()=>assert.fail('Stale completion'),onBoundary:()=>assert.fail('Stale boundary'),onError:()=>assert.fail('Stale error')});session.stop();resolveJob([1]);await new Promise(resolve=>setTimeout(resolve,20));assert(cancelled);assert.equal(played,chunks.length);
 console.log('PASS: explicit readiness, UTF-16-safe long sentence chunks, actual playback end ordering/rate, synthesis cancellation and stale callback suppression.');
}finally{await rm(dir,{recursive:true,force:true});}
