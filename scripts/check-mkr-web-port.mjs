// Port transport policy tests only. Fake native endpoint; no playback proof.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const {build}=createRequire(path.join(root,'windows/package.json'))('esbuild');
const output=path.join(root,'windows/target/mkr-port-check');await mkdir(output,{recursive:true});
await build({entryPoints:[path.join(root,'windows/src/workspace/mkr-web-port.ts')],bundle:true,format:'esm',platform:'node',outfile:path.join(output,'client.mjs')});
const {createMkrPortClient}=await import(pathToFileURL(path.join(output,'client.mjs')));
function page(origin='https://anf.local'){
 const listeners=new Map(),timers=new Map();let timerId=0;
 return{location:{origin},addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},
  removeEventListener:(name,fn)=>listeners.get(name)?.delete(fn),setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
  emit:(name,event)=>{for(const fn of [...(listeners.get(name)||[])])fn(event);},expire:()=>{for(const fn of [...timers.values()])fn();},
  count:()=>[...listeners.values()].reduce((n,s)=>n+s.size,0),timerCount:()=>timers.size};
}
function native(){
 const sent=[];return{sent,closed:false,onmessage:null,onmessageerror:null,start(){},close(){this.closed=true;},postMessage(data){sent.push(JSON.parse(data));},
  reply(value,error=null,id=sent.at(-1)?.id){this.onmessage?.({data:JSON.stringify({id,value,error})});}};
}
const target=page(),changes=[],client=createMkrPortClient(target,value=>changes.push(value));
await client.pauseForOtherAudio();await assert.rejects(client.transport('capabilities'),/unavailable/);
const blocked=native();target.emit('message',{source:{},origin:'null',data:'anf-mkr-port-v1',ports:[blocked]});
await assert.rejects(client.transport('capabilities'),/unavailable/);assert.deepEqual(changes,[]);
const endpoint=native();target.emit('message',{source:null,data:'anf-mkr-port-v1',ports:[endpoint]});
const earlyPause=client.pauseForOtherAudio();assert.equal(endpoint.sent.at(-1).command,'pause');endpoint.reply({playing:false});await earlyPause;
const caps=client.transport('capabilities');endpoint.reply({protocol:1,embedded:true,platform:'android-native'});await caps;
const pause=client.pauseForOtherAudio();assert.equal(endpoint.sent.at(-1).command,'pause');endpoint.reply({playing:false});await pause;
const badPause=client.pauseForOtherAudio();endpoint.reply({playing:true});await assert.rejects(badPause,/confirm pause/);
const serverFailure=client.transport('status');endpoint.reply(null,'https://secret.invalid/token');await assert.rejects(serverFailure,/^Error: Music request unavailable\.$/);
const pending=Array.from({length:8},()=>client.transport('status'));await assert.rejects(client.transport('status'),/busy/);
target.expire();assert.equal((await Promise.allSettled(pending)).filter(r=>r.status==='rejected').length,8);
assert.equal(target.timerCount(),0);assert.equal(endpoint.closed,true);await assert.rejects(client.pauseForOtherAudio(),/unavailable/);
const replacement=native();target.emit('message',{source:null,data:'anf-mkr-port-v1',ports:[replacement]});
const changed=client.transport('search',{query:'fixture'}),next=native();target.emit('message',{source:null,data:'anf-mkr-port-v1',ports:[next]});
await assert.rejects(changed,/changed/);assert.equal(replacement.closed,true);
const malformed=client.transport('status');next.onmessage({data:'{"id":1,"value":{},"error":null}'});await assert.rejects(malformed,/unavailable/);
const final=native();target.emit('message',{source:null,data:'anf-mkr-port-v1',ports:[final]});
const revoked=client.transport('status');final.onmessage({data:'{"event":"closed"}'});await assert.rejects(revoked,/unavailable/);
client.close();client.close();assert.equal(target.count(),0);assert.equal(target.timerCount(),0);
const foreign=page('https://untrusted.invalid'),foreignClient=createMkrPortClient(foreign);
foreign.emit('message',{source:null,data:'anf-mkr-port-v1',ports:[native()]});await assert.rejects(foreignClient.transport('status'),/unavailable/);foreignClient.close();
const legacy=page('https://coucou.local'),legacyClient=createMkrPortClient(legacy),legacyPort=native();
legacy.emit('message',{source:null,data:'anf-mkr-port-v1',ports:[legacyPort]});
const leaving=legacyClient.transport('status');legacy.emit('pagehide',{});await assert.rejects(leaving,/unavailable/);assert.equal(legacy.count(),0);
console.log('PASS: native-source/page-origin gating, request bounds, pause acknowledgement, safe errors, timeout/replacement/revocation cleanup and both app origins. Fake endpoint only.');
