// Integration contract: delayed native replies must not steal browser playback.
const assert=require('node:assert/strict');
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.handlers={};this.classList={add(){}};}
 setAttribute(k,v){this[k]=v;}
 addEventListener(k,fn){this.handlers[k]=fn;}
 append(...items){this.children.push(...items);}
}
const requests=[];let poll,stopped=0;
global.document={hidden:false,createElement:t=>new Element(t),createTextNode:t=>t,body:new Element('body')};
global.window={addEventListener(){},CoucouAndroid:{mediaRequest(id,op){requests.push({id,op});}}};
global.setInterval=fn=>{poll=fn;return 1;};
const {nativeMediaPanel}=require(process.argv[2]);
const state=(playing)=>({title:'Test',position:0,duration:1000,playing,count:1,error:false});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const reply=(request,playing,error='')=>window.coucouMediaResult(request.id,JSON.stringify(state(playing)),error);
(async()=>{
 const panel=nativeMediaPanel(()=>[],()=> 'off',()=>stopped++,()=>{});
 poll();const old=requests.shift();assert.equal(old.op,'status');
 const pause=panel.suspend();const action=requests.shift();assert.equal(action.op,'pause');
 poll();assert.equal(requests.length,0,'No status polling during handoff');
 reply(action,false);await pause;
 reply(old,true);await flush();assert.equal(stopped,0,'Old playing status must not stop the browser');
 poll();reply(requests.shift(),true);await flush();assert.equal(stopped,1,'Fresh external play should stop browser audio');
 const failedPause=panel.suspend();reply(requests.shift(),true,'Cannot pause');
 await assert.rejects(failedPause,/Cannot pause/,'Failed pause must prevent starting a second player');
 console.log('PASS: delayed status, handoff polling, external resume and pause failure');
})().catch(e=>{console.error(e);process.exitCode=1;});
