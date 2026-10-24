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
 const stillPlaying=panel.suspend();reply(requests.shift(),true);await assert.rejects(stillPlaying,/did not confirm pause/,'A successful transport response is insufficient if playback is still active');
 const malformed=panel.suspend();const bad=requests.shift();window.coucouMediaResult(bad.id,JSON.stringify({playing:false}),'');await assert.rejects(malformed,/Invalid native playback state/);
 const gates=[],messages=[];
 const track={id:'one',name:'one.wav',title:'One',artist:'',blob:new Blob(['test'])};
 const gated=nativeMediaPanel(()=>[track],()=> 'off',()=>stopped++,s=>messages.push(s),()=>new Promise((resolve,reject)=>gates.push({resolve,reject})));
 const find=(el,label)=>el.children.filter(n=>n&&typeof n==='object').flatMap(n=>[n,find(n,label)]).find(n=>n?.textContent===label);
 const click=el=>el.handlers.click();
 const dock=document.body.children.at(-1),play=find(dock,'Play'),stop=find(dock,'Stop'),start=find(gated.root,'Play queue in background'),cancel=find(gated.root,'Cancel transfer');
 async function until(check){for(let i=0;i<100;i++){await flush();if(check())return;}throw Error('Native playback request did not settle');}
 // Stop after an external player's pause has begun, before native play dispatch.
 click(play);await until(()=>gates.length===1);const suspended=gated.suspend();reply(requests.shift(),false);await suspended;const stoppedBefore=stopped;gates[0].resolve();await flush();assert.equal(requests.length,0);assert.equal(stopped,stoppedBefore,'Cancelled preflight must not stop the new owner');
 // A suspended import may finish caching, but must never dispatch its queue.
 click(start);await until(()=>requests.length===1);const importing=requests.shift();assert.equal(importing.op,'import_begin');const duringImport=gated.suspend();reply(requests.shift(),false);await duringImport;window.coucouMediaResult(importing.id,JSON.stringify({existing:true}),'');await until(()=>!start.disabled);assert.equal(requests.length,0);assert.equal(gates.length,1);
 // Cancel must still work during the final handoff, after imports have finished.
 click(start);await until(()=>requests.length===1);window.coucouMediaResult(requests.shift().id,JSON.stringify({existing:true}),'');await until(()=>gates.length===2);click(cancel);gates[1].resolve();await until(()=>!start.disabled);assert.equal(requests.length,0);assert(messages.includes('Audio transfer cancelled.'));
 // Native Stop invalidates a pending Play without requiring another owner.
 click(play);await until(()=>gates.length===3);click(stop);assert.equal(requests[0].op,'stop');reply(requests.shift(),false);gates[2].resolve();await flush();assert.equal(requests.length,0);
 // Two media-control play requests: only the newest may dispatch after preflight.
 click(play);click(play);await until(()=>gates.length===5);gates[4].resolve();await until(()=>requests.length===1);assert.equal(requests[0].op,'play');reply(requests.shift(),true);gates[3].resolve();await flush();assert.equal(requests.length,0);
 // A superseded queue reply must not advertise success after a handoff.
 const paused=gated.suspend();reply(requests.shift(),false);await paused;click(start);await until(()=>requests.length===1);window.coucouMediaResult(requests.shift().id,JSON.stringify({existing:true}),'');await until(()=>gates.length===6);gates[5].resolve();await until(()=>requests.length===1);const queued=requests.shift();assert.equal(queued.op,'queue');const handoff=gated.suspend();reply(requests.shift(),false);await handoff;reply(queued,true);await until(()=>!start.disabled);assert(!messages.some(s=>s.startsWith('Native queue ready.')));
 // Concurrent handoffs keep polling suppressed until both requests settle.
 const first=gated.suspend();const firstReply=requests.shift();const rejected=assert.rejects(first,/did not confirm pause/);const second=gated.suspend();const secondReply=requests.shift();reply(secondReply,false);await second;poll();assert.equal(requests.length,0);reply(firstReply,false);await rejected;
 console.log('PASS: delayed status, validated pause, cancelled import/preflight, Stop and latest play ownership, stale queue success and concurrent handoffs');
})().catch(e=>{console.error(e);process.exitCode=1;});
