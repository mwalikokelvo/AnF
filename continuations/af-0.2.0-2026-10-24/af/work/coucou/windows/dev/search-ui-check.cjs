const assert=require('node:assert/strict');
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.handlers={};this.attrs={};this.style={};this.hidden=false;this.value='';this.textContent='';}
 setAttribute(k,v){this.attrs[k]=v;if(k==='hidden')this.hidden=true;}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=[];this.append(...items);}addEventListener(k,fn){this.handlers[k]=fn;}focus(){document.activeElement=this;}
}
const events={};global.document={createElement:t=>new Element(t),createTextNode:t=>t,activeElement:new Element('button'),addEventListener:(k,fn)=>events[k]=fn};
const {createStudio}=require(require('node:path').resolve(process.argv[2]));
const lists=[],loads=[],navigations=[];let allowed=true;
const studio=createStudio({allowed:()=>allowed,list:()=>new Promise((resolve,reject)=>lists.push({resolve,reject})),load:id=>new Promise((resolve,reject)=>loads.push({id,resolve,reject})),current:()=>({id:'current',name:'Current',draft:'',sources:[]}),open:id=>new Promise((resolve,reject)=>navigations.push({id,resolve,reject})),append(){},view(){},health:()=>''});
const walk=el=>el.children.filter(n=>n instanceof Element).flatMap(n=>[n,...walk(n)]),buttons=()=>walk(studio.root).filter(n=>n.tag==='button'),status=()=>walk(studio.root).find(n=>n.attrs.role==='status').textContent;
const note=(id,name)=>({id,name,draft:'A note',sources:[]}),flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const origin=document.activeElement,first=studio.open();lists.shift().resolve([{id:'old'}]);await flush();assert.equal(loads[0].id,'old');studio.close();const second=studio.open();lists.shift().resolve([{id:'new'}]);await flush();loads.find(l=>l.id==='new').resolve(note('new','New result'));assert.equal(await second,true);loads.find(l=>l.id==='old').resolve(note('old','Stale result'));assert.equal(await first,false);assert(!buttons().some(b=>b.textContent==='Stale result'));assert(buttons().some(b=>b.textContent==='New result'));
 buttons().find(b=>b.textContent==='New result').handlers.click();studio.close();const third=studio.open();lists.shift().resolve([]);assert.equal(await third,true);navigations.shift().resolve();await flush();assert(!studio.root.hidden,'Old navigation completion cannot close a reopened search');
 const fourth=studio.open();lists.shift().resolve([{id:'late'}]);await flush();studio.close();loads.find(l=>l.id==='late').reject(Error('Old load error'));assert.equal(await fourth,false);assert(!status().includes('Old load error'),'Closed request failures cannot change status');assert.equal(document.activeElement,origin,'Repeated open preserves original external focus');
 allowed=false;assert.equal(await studio.open(),false);events['coucou-open-note']({detail:'Blocked query'});await flush();assert.equal(lists.length,0);assert.equal(walk(studio.root).find(n=>n.tag==='input').value,'');allowed=true;
 const normal=studio.open();lists.shift().resolve([{id:'ready'}]);await flush();loads.find(l=>l.id==='ready').resolve(note('ready','Ready'));await normal;buttons().find(b=>b.textContent==='Ready').handlers.click();navigations.shift().reject(Error('Navigation failed'));await flush();assert(status().includes('Navigation failed'));assert(!studio.root.hidden);buttons().find(b=>b.textContent==='Ready').handlers.click();navigations.shift().resolve();await flush();assert(studio.root.hidden);
 console.log('Search UI checks passed: cancelled/reopened load isolation, stale navigation and error guards, external focus, refused wiki opening and normal navigation failure/success.');
})().catch(e=>{console.error(e);process.exitCode=1;});
