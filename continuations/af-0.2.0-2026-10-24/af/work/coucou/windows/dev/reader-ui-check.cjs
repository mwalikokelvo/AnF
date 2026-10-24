const assert=require('node:assert/strict');
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.handlers={};this.style={};this.dataset={};this.value='';this.textContent='';this.hidden=false;this.scrollTop=0;}
 setAttribute(k,v){this.attrs[k]=v;if(k==='value')this.value=v;if(k==='hidden')this.hidden=true;}
 append(...items){this.children.push(...items);}replaceChildren(...items){this.children=[];this.append(...items);}
 addEventListener(k,fn){this.handlers[k]=fn;}get options(){return this.children;}
 querySelector(s){return this.querySelectorAll(s)[0];}querySelectorAll(s){return this.children.filter(x=>x instanceof Element).flatMap(n=>[...(s.startsWith('.')?n.className?.split(' ').includes(s.slice(1)):n.tag===s)?[n]:[],...n.querySelectorAll(s)]);}
 focus(){document.activeElement=this;}click(){if(!this.disabled)this.handlers.click?.();}
}
const storage=new Map(),spoken=[],errors=[];let stops=0;
global.document={createElement:t=>new Element(t),createTextNode:t=>t,addEventListener(){},activeElement:new Element('button')};
global.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
global.window={CoucouAndroid:{speakPart:(text,rate,id)=>spoken.push({text,id}),stopSpeaking:()=>stops++},getSelection:()=>null};
const {createReader}=require(require('node:path').resolve(process.argv[2]));
const buttons=(reader,label)=>reader.root.querySelectorAll('button').find(b=>b.textContent===label);
const select=(reader,label)=>reader.root.querySelectorAll('select').find(b=>b.attrs['aria-label']===label);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const origin=document.activeElement,reader=createReader(()=>{},()=>{},e=>errors.push(e));
 const first={name:'First',text:'An older document. Another sentence.'},second={name:'Second',text:'A different document.'};
 reader.open(first);const body=reader.root.querySelector('.reader-body');body.scrollTop=180;buttons(reader,'Read aloud').click();assert.equal(spoken.length,1);const old=spoken[0],before=stops;
 reader.open(second);assert(stops>before,'Opening another document stops the old voice');assert.equal(body.scrollTop,0);assert([...storage.values()].some(v=>v.includes('"top":180')),'Switching documents saves the old scroll position');
 window.coucouSpeechDone(old.id);assert.equal(spoken.length,1,'Old speech completion cannot advance after changing document');
 reader.close();assert.equal(document.activeElement,origin,'Close returns focus to the original external control');
 reader.open(first);assert.equal(body.scrollTop,180,'Reopening restores the saved scroll position');
 const long={name:'Completed',text:'x'.repeat(7100),reading:{offset:7100,bookmarks:[7100],annotations:[]}};
 reader.open(long);const toc=select(reader,'Reading section');assert.equal(toc.value,'2','End-of-text reading position belongs to the last section');
 toc.value='0';toc.handlers.change();const bookmark=select(reader,'Saved bookmarks');bookmark.value='7100';bookmark.handlers.change();assert.equal(toc.value,'2','End bookmark navigates to the last section');
 const visible=reader.root.querySelector('h2').textContent;reader.open({name:'Invalid',text:'Short',reading:{offset:100,bookmarks:[],annotations:[]}});assert.equal(errors.length,1);assert.equal(reader.root.querySelector('h2').textContent,visible,'Invalid new document leaves the current reader intact');reader.close();
 let release;const pending=createReader(()=>{},()=>{},e=>errors.push(e),undefined,()=>new Promise(resolve=>release=resolve));
 pending.open(first);buttons(pending,'Read aloud').click();await flush();assert(release);const count=spoken.length;pending.open(second);release();await flush();assert.equal(spoken.length,count,'Opening another document cancels pending voice preparation');pending.close();
 console.log('Reader UI checks passed: document-switch voice cancellation, stale completion, scroll preservation, external focus return, end position/bookmark and invalid-source isolation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
