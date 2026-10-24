const assert=require('node:assert/strict');
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.handlers={};this.value='';this.textContent='';this.disabled=false;this.checked=false;}
 setAttribute(k,v){this.attrs[k]=v;}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=[];this.append(...items);}addEventListener(k,fn){this.handlers[k]=fn;}
}
global.document={createElement:t=>new Element(t),createTextNode:t=>t};const storage=new Map();global.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const {createDashboard}=require(require('node:path').resolve(process.argv[2]));const lists=[],loads=[],captures=[],errors=[];let throwCapture=false,allowed=true;
const dashboard=createDashboard({allowed:()=>allowed,current:()=>({id:'current',name:'Current',draft:'',sources:[]}),list:()=>new Promise(resolve=>lists.push(resolve)),load:id=>new Promise((resolve,reject)=>loads.push({id,resolve,reject})),capture:text=>{if(throwCapture)throw Error('Immediate save failure');return new Promise((resolve,reject)=>captures.push({text,resolve,reject}));},open:async()=>{},read(){},write(){},notify:e=>errors.push(e)});
const walk=el=>el.children.filter(n=>n instanceof Element).flatMap(n=>[n,...walk(n)]),flush=()=>new Promise(resolve=>setImmediate(resolve));
const note=(id,task)=>({id,name:id,draft:'- [ ] '+task,sources:[]}),tasks=()=>walk(dashboard.root).filter(n=>n.className==='dashboard-task');
(async()=>{
 const first=dashboard.refresh();lists.shift()([{id:'old'}]);await flush();const second=dashboard.refresh();lists.shift()([{id:'new'}]);await flush();loads.find(l=>l.id==='new').resolve(note('new','Fresh task'));await second;loads.find(l=>l.id==='old').resolve(note('old','Stale task'));await first;assert.deepEqual(tasks().map(n=>n.textContent),['Fresh task — new']);
 const scratch=walk(dashboard.root).find(n=>n.tag==='textarea'),save=walk(dashboard.root).find(n=>n.textContent==='Save to today’s log'),status=walk(dashboard.root).find(n=>n.attrs.role==='status');
 scratch.value='First capture';save.handlers.click();assert(save.disabled);save.handlers.click();assert.equal(captures.length,1);scratch.value='New writing during save';scratch.handlers.input();captures[0].resolve();await flush();assert.equal(scratch.value,'New writing during save');assert.equal(storage.get('coucou-quick-capture'),'New writing during save');lists.shift()([]);await flush();assert(!save.disabled);
 throwCapture=true;save.handlers.click();await flush();assert(!save.disabled);assert.equal(scratch.value,'New writing during save');assert(status.textContent.includes('Immediate save failure'));
 const habit=walk(dashboard.root).filter(n=>n.tag==='input'&&!n.disabled).at(-1);habit.checked=true;habit.handlers.change();await flush();assert(!habit.checked);assert(!habit.disabled);assert(errors.some(e=>e.includes('Immediate save failure')));throwCapture=false;
 save.handlers.click();captures.at(-1).reject(Error('Storage refused'));await flush();assert(!save.disabled);assert.equal(scratch.value,'New writing during save');assert(status.textContent.includes('Storage refused'));
 allowed=false;const count=captures.length;save.handlers.click();assert.equal(captures.length,count);habit.checked=true;habit.handlers.change();assert(!habit.checked);
 console.log('Dashboard UI checks passed: stale-refresh task isolation, capture double-click guard, edited scratch retention, sync/async save failures, habit rollback and workspace guards.');
})().catch(e=>{console.error(e);process.exitCode=1;});
