const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Element {
  constructor(tag) { this.tag=tag; this.children=[]; this.listeners={}; this.attrs={}; }
  append(...children) { this.children.push(...children); }
  setAttribute(key,value) { this.attrs[key]=value; }
  addEventListener(event,listener) { this.listeners[event]=listener; }
  click() { if(!this.disabled)this.listeners.click(); }
}
const context={module:{exports:{}},document:{createElement:tag=>new Element(tag)}};
// Bundle with the esbuild CLI first; accepts its output path as the argument.
vm.runInNewContext(fs.readFileSync(process.argv[2],'utf8'),context);
const {responsePages,paginatedResponse}=context.module.exports;
const text='  '+Array.from({length:3561},(_,i)=>`word${i}é🙂`).join(' \n\t')+'\n';
const pages=responsePages(text);
assert.equal(pages.length,3);
assert.equal(pages.join(''),text);
assert.deepEqual(Array.from(pages,p=>p.match(/\S+/gu).length),[1700,1700,161]);
assert.equal(responsePages('')[0],'');
assert.equal(responsePages('   ')[0],'   ');
assert.equal(responsePages('one two').length,1);
assert.throws(()=>responsePages('bad',0));
assert.throws(()=>responsePages('bad',1.5));
const root=paginatedResponse(text),body=root.children[0];
const [previous,label,next]=root.children[1].children;
assert.equal(body.textContent,pages[0]);assert(previous.disabled);assert(!next.disabled);
body.scrollTop=250;next.click();assert.equal(body.scrollTop,0);assert.equal(body.textContent,pages[1]);assert(label.textContent.startsWith('Page 2 of 3'));
next.click();assert.equal(body.textContent,pages[2]);assert(next.disabled);
next.click();assert.equal(body.textContent,pages[2]);
previous.click();assert.equal(body.textContent,pages[1]);
previous.click();assert.equal(body.textContent,pages[0]);assert(previous.disabled);
let prevented=false;body.listeners.keydown({key:'ArrowRight',preventDefault(){prevented=true;}});assert(prevented);assert.equal(body.textContent,pages[1]);
assert.equal(paginatedResponse('Short answer').children.length,1);
console.log('Response pagination passed: exact boundaries, lossless Unicode/whitespace, navigation and short replies.');
