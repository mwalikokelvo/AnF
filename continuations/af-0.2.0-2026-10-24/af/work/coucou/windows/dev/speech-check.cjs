const {sentences}=require(require('node:path').resolve(process.argv[2]));const assert=require('node:assert/strict');
assert.deepEqual(sentences('One sentence. Second question? Last!'),['One sentence.',' Second question?',' Last!']);
const text='a'.repeat(1799)+'🌻'+'b'.repeat(2400)+'.';const parts=sentences(text);assert.equal(parts.join(''),text);assert(parts.every(p=>p.length<=1800));assert(parts.every(p=>!/[\uD800-\uDBFF]$/.test(p)));assert.deepEqual(sentences(''),[]);
console.log('Speech segmentation checks passed: punctuation, bounded native chunks, empty text and Unicode boundaries.');

class Element{
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.handlers={};this.value='';this.textContent='';}
 setAttribute(k,v){this.attrs[k]=v;if(k==='value')this.value=v;}append(...items){this.children.push(...items);}
 addEventListener(k,fn){this.handlers[k]=fn;}
}
global.document={createElement:tag=>new Element(tag),createTextNode:text=>text};
const spoken=[];let stopped=0,throwVoice=false;
global.window={CoucouAndroid:{speakPart(text,rate,id){if(throwVoice)throw Error('Voice failed');spoken.push({text,rate,id});},stopSpeaking(){stopped++;}}};
const {createSpeechPlayer}=require(require('node:path').resolve(process.argv[2]));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const button=(p,label)=>p.root.children.find(e=>e.tag==='button'&&e.textContent===label);
const info=p=>p.root.children.find(e=>e.tag==='span').textContent;
(async()=>{
 let release,calls=0;
 const delayed=createSpeechPlayer(()=>{calls++;return new Promise(resolve=>release=resolve);});
 delayed.load('A delayed sentence.');await flush();assert.equal(calls,1);assert.equal(spoken.length,0,'Wait for playback handoff before speaking');delayed.stop();release();await flush();assert.equal(spoken.length,0,'Stop cancels pending speech');
 const refused=createSpeechPlayer(async()=>{throw Error('Music could not be paused');});refused.load('Do not overlap.');await flush();assert.equal(spoken.length,0);assert(info(refused).includes('Music could not be paused'));
 const beforeCancel=createSpeechPlayer(async()=>{calls++;});beforeCancel.load('Cancel immediately.');beforeCancel.stop();await flush();assert.equal(calls,1,'Do not pause a new player for an already-cancelled speech request');
 let preparations=0;const first=createSpeechPlayer();first.load('An older reader.');const old=spoken.at(-1);
 const second=createSpeechPlayer(async()=>{preparations++;});second.load('First sentence. Second sentence.');await flush();const current=spoken.at(-1);assert.notEqual(current.id,old.id);assert(current.id.length<=30);
 const count=spoken.length;window.coucouSpeechDone(old.id);assert.equal(spoken.length,count,'Old completion cannot advance the new reader');
 const stops=stopped;first.stop();assert.equal(stopped,stops,'An inactive reader cannot stop the current reader');
 window.coucouSpeechDone(current.id);assert.equal(spoken.length,count+1);assert.equal(preparations,1,'Sentence advancement does not repeat the native handoff');
 const last=spoken.at(-1);window.coucouSpeechError(last.id);assert(info(second).includes('Voice unavailable'));window.coucouSpeechDone(last.id);assert.equal(spoken.length,count+1,'Voice errors invalidate late completions');
 throwVoice=true;const broken=createSpeechPlayer();broken.load('A bridge exception.');assert(info(broken).includes('could not start'));throwVoice=false;
 global.window={speechSynthesis:{speak:u=>spoken.push(u),cancel(){}}};global.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 const browser=createSpeechPlayer();browser.load('Browser speech. Next.');const utterance=spoken.at(-1);browser.stop();const before=spoken.length;utterance.onend();assert.equal(spoken.length,before,'Cancelled browser speech cannot advance');
 console.log('Speech lifecycle checks passed: acknowledged preflight, cancellation races, rejected handoffs, unique callbacks, owner isolation, sentence continuity, voice failures and browser stale replies.');
})().catch(e=>{console.error(e);process.exitCode=1;});
