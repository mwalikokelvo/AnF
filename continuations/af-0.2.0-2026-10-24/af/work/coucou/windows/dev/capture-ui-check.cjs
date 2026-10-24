const assert=require('node:assert/strict');
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.handlers={};this.value='';this.textContent='';this.disabled=false;this.open=false;}
 setAttribute(k,v){this.attrs[k]=v;}append(...items){this.children.push(...items);}addEventListener(k,fn){this.handlers[k]=fn;}showModal(){this.open=true;}close(){this.open=false;}focus(){}
}
global.document={body:new Element('body'),createElement:t=>new Element(t),createTextNode:t=>t};
const {quickCapture}=require(require('node:path').resolve(process.argv[2]));
const flush=()=>new Promise(resolve=>setImmediate(resolve));let allowed=true,pending,throwSave=false;const saved=[];
const capture=quickCapture(text=>{if(throwSave)throw Error('Synchronous save failure');saved.push(text);return new Promise((resolve,reject)=>pending={resolve,reject});},()=>allowed);
const root=document.body.children[0],text=root.children.find(n=>n.tag==='textarea'),status=root.children.find(n=>n.attrs?.role==='status'),controls=root.children.find(n=>n.tag==='div'),[submit,cancel]=controls.children;
(async()=>{
 assert.equal(text.attrs.maxlength,'8000');assert(capture.open('Original thought'));submit.handlers.click();assert.deepEqual(saved,['Original thought']);assert(text.disabled);assert.equal(capture.open('Another incoming thought'),false);assert.equal(text.value,'Original thought','Pending save cannot be replaced by an open call');submit.handlers.click();assert.equal(saved.length,1);let prevented=false;root.handlers.cancel({preventDefault(){prevented=true;}});assert(prevented);cancel.handlers.click();assert(root.open);pending.resolve();await flush();assert.equal(text.value,'');assert(!root.open);assert(!text.disabled);
 capture.open('Retain after failure');submit.handlers.click();pending.reject(Error('Disk full'));await flush();assert(root.open);assert.equal(text.value,'Retain after failure');assert(status.textContent.includes('Disk full'));assert(!submit.disabled);
 throwSave=true;submit.handlers.click();await flush();assert(status.textContent.includes('Synchronous save failure'));assert.equal(text.value,'Retain after failure');assert(!text.disabled);throwSave=false;
 text.value='x'.repeat(8001);const count=saved.length;submit.handlers.click();assert.equal(saved.length,count);assert(status.textContent.includes('8,000'));text.value='';
 capture.open('x'.repeat(7999)+'🙂tail');assert.equal(text.value.length,7999);assert(!/[\uD800-\uDBFF]$/.test(text.value));assert(status.textContent.includes('Review before saving'));text.value='';capture.open('x'.repeat(8000));assert.equal(text.value.length,8000);submit.handlers.click();assert.equal(saved.at(-1).length,8000);pending.resolve();await flush();
 capture.open('Existing unsaved text');capture.open('Different shared text');assert.equal(text.value,'Existing unsaved text');assert(status.textContent.includes('existing quick note'));allowed=false;assert.equal(capture.open('Blocked'),false);submit.handlers.click();assert.equal(saved.length,count+1);
 console.log('Quick capture UI checks passed: frozen pending save, busy/open refusal, sync/async failure retention, shared 8,000 limit, Unicode-safe prefix, existing-note protection and workspace guard.');
})().catch(e=>{console.error(e);process.exitCode=1;});
