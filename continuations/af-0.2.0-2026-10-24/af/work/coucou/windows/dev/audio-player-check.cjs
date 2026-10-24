// Exercise actual playback controls with an in-memory IDB and audio-device double.
const assert=require('node:assert/strict');
class Element{
 constructor(tag='audio'){this.tag=tag;this.children=[];this.attrs={};this.handlers={};this.style={};this.value='';this.textContent='';this.disabled=false;this.classList={add(){}};}
 setAttribute(k,v){this.attrs[k]=v;if(k==='value')this.value=v;if(k==='disabled')this.disabled=true;}removeAttribute(k){delete this.attrs[k];}
 append(...items){for(const item of items){if(item?.remove)item.remove();if(typeof item==='object')item.parent=this;}this.children.push(...items);if(this.tag==='select'&&!this.value)this.value=this.children.find(x=>x.tag==='option')?.value||'';}
 replaceChildren(...items){this.children=[];this.append(...items);}remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
 get childNodes(){return this.children;}get nextSibling(){return this.parent?.children[this.parent.children.indexOf(this)+1];}get isConnected(){return true;}
 closest(selector){for(let n=this;n;n=n.parent)if(selector.startsWith('.')&&n.className?.split(' ').includes(selector.slice(1)))return n;return null;}
 querySelector(s){return this.querySelectorAll(s)[0];}querySelectorAll(s){return this.children.filter(x=>typeof x==='object').flatMap(n=>[...(s.split(',').includes(n.tag)?[n]:[]),...n.querySelectorAll(s)]);}
 addEventListener(k,fn){this.handlers[k]=fn;}click(){if(!this.disabled)this.handlers.click?.();}getContext(){return null;}
}
const track={id:'one',name:'one.wav',title:'One track',artist:'',created:1,duration:1,blob:new Blob([new Uint8Array(8)])};
const stores={tracks:new Map([['one',track]]),state:new Map([['queue',{id:'queue',order:['one'],current:'one',position:0,repeat:'off'}]]),playlists:new Map()};
function request(value){const r={result:value};queueMicrotask(()=>r.onsuccess?.());return r;}
const db={transaction(name){const tx={objectStore:()=>({get:key=>request(stores[name].get(key)),getAll:()=>request([...stores[name].values()]),put:value=>stores[name].set(value.id,value),delete:key=>stores[name].delete(key)})};queueMicrotask(()=>tx.oncomplete?.());return tx;}};
global.indexedDB={open:()=>request(db)};
const actions={};Object.defineProperty(global,'navigator',{configurable:true,value:{mediaSession:{setActionHandler:(name,fn)=>actions[name]=fn}}});global.MediaMetadata=class{};
let audio,plays=0;global.Audio=class extends Element{constructor(){super();this.paused=true;this.currentTime=0;this.readyState=0;audio=this;}pause(){this.paused=true;}load(){}play(){plays++;this.paused=false;return Promise.resolve();}};
global.document={hidden:false,body:new Element('body'),createElement:tag=>new Element(tag),createTextNode:text=>text,addEventListener(){}};global.window={addEventListener(){}};
global.requestAnimationFrame=()=>0;global.cancelAnimationFrame=()=>{};
const {createAudioStudio}=require(require('node:path').resolve(process.argv[2]));const gates=[],messages=[];
const player=createAudioStudio(s=>messages.push(s),undefined,undefined,()=>new Promise((resolve,reject)=>gates.push({resolve,reject})));
document.body.append(player.root,player.musicRoot);
const flush=()=>new Promise(resolve=>setImmediate(resolve));async function until(check){for(let i=0;i<100;i++){await flush();if(check())return;}throw Error('Audio setup or handoff did not settle');}
(async()=>{
 await until(()=>player.tracks().length===1&&actions.play);
 const play=player.root.querySelectorAll('button').find(e=>e.textContent==='Play');assert(play);
 play.click();await until(()=>gates.length===1);assert.equal(plays,0);player.stop();gates[0].resolve();await until(()=>!play.disabled);assert.equal(plays,0,'A stopped pending handoff cannot resume browser playback');
 play.click();await until(()=>gates.length===2);gates[1].resolve();await until(()=>!play.disabled);assert.equal(plays,1);assert.equal(audio.paused,false);player.stop();
 play.click();await until(()=>gates.length===3);gates[2].reject(Error('Native pause refused'));await until(()=>!play.disabled);assert.equal(plays,1);assert(messages.some(s=>s.includes('Native pause refused')));
 actions.play();actions.play();await until(()=>gates.length===5);gates[4].resolve();await until(()=>plays===2);gates[3].resolve();await flush();assert.equal(plays,2,'Only the newest external play request may start');player.stop();
 console.log('Audio player handoff checks passed: acknowledged preparation, cancelled pending playback, refused pause and latest-request ownership for external play controls.');
})().catch(e=>{console.error(e);process.exitCode=1;});
