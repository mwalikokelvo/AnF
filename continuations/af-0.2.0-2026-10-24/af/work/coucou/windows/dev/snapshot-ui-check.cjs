const assert=require('node:assert/strict');
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.handlers={};this.attrs={};this.textContent='';}
 setAttribute(k,v){this.attrs[k]=v;}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=[];this.append(...items);}addEventListener(k,fn){this.handlers[k]=fn;}
}
global.document={createElement:t=>new Element(t),createTextNode:t=>t};
const {snapshotPanel}=require(require('node:path').resolve(process.argv[2]));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const walk=el=>el.children.filter(n=>n instanceof Element).flatMap(n=>[n,...walk(n)]);
let current='A',allowed=true,listing,restoring,listCalls=0;const restored=[];
const root=snapshotPanel({allowed:()=>allowed,list:()=>{listCalls++;const owner=current;return new Promise((resolve,reject)=>listing={resolve:versions=>resolve({owner,title:owner,versions}),reject});},restore:(owner,seq)=>{restored.push({owner,seq});return new Promise((resolve,reject)=>restoring={resolve,reject});}});
const refresh=walk(root).find(n=>n.textContent==='Show saved snapshots'),buttons=()=>walk(root).filter(n=>n.tag==='button'&&n!==refresh),notice=()=>walk(root).find(n=>n.attrs.role==='status').textContent;
(async()=>{
 refresh.handlers.click();listing.resolve([{seq:7,updated:1}]);await flush();assert.equal(buttons().length,1);
 current='B';buttons()[0].handlers.click();assert.deepEqual(restored,[{owner:'A',seq:7}],'Restore remains bound to the displayed conversation after switching');buttons()[0].handlers.click();refresh.handlers.click();assert.equal(restored.length,1);assert.equal(listCalls,1,'Only one restore/list operation at a time');restoring.resolve();await flush();assert(notice().includes('separate restored conversation'));
 refresh.handlers.click();assert.equal(buttons().length,0,'A refresh removes old restore controls before waiting');listing.reject(Error('Cannot read B snapshots'));await flush();assert.equal(buttons().length,0);assert(notice().includes('Cannot read B snapshots'));
 refresh.handlers.click();current='C';listing.resolve([{seq:8,updated:2}]);await flush();assert(notice().includes('snapshots for B'));buttons()[0].handlers.click();assert.deepEqual(restored.at(-1),{owner:'B',seq:8});restoring.reject(Error('Restore refused'));await flush();assert(notice().includes('Restore refused'));
 allowed=false;buttons()[0].handlers.click();refresh.handlers.click();assert.equal(restored.length,2);assert.equal(listCalls,3,'Workspace permission gate remains effective');allowed=true;
 refresh.handlers.click();listing.resolve([]);await flush();assert.equal(buttons().length,0);assert.equal(notice(),'No encrypted snapshots yet.');
 console.log('Snapshot UI checks passed: immutable conversation ownership, delayed listing, failed-refresh stale-control removal, restore failure, busy/allowed guards and empty history.');
})().catch(e=>{console.error(e);process.exitCode=1;});
