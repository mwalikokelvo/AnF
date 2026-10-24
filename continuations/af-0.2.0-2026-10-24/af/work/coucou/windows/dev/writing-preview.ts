import {createWritingEditor} from '../src/workspace/writing';
import {h} from '../src/views/dom';

// Synthetic, memory-only browser fixture. No workspace IPC, files or user data.
const draft=h('textarea',{'aria-label':'Fixture writing'}),status=h('p',{role:'status'}),saved=h('pre',{'aria-label':'Observed writing'});
draft.value='Original fixture writing';let changes=0;
const observe=()=>{saved.textContent=JSON.stringify({text:draft.value,changes});};
const editor=createWritingEditor(draft,()=>{changes++;observe();},text=>status.textContent=text);
const action=(text:string,fn:()=>void)=>h('button',{text,type:'button',onclick:fn});
document.body.append(h('h1',{text:'A&F local writing verification'}),h('p',{text:'Synthetic browser fixture. Content stays in memory.'}),
  action('Lock writing',()=>{editor.setReadOnly(true);status.textContent='Writing locked';}),
  action('Unlock writing',()=>{editor.setReadOnly(false);status.textContent='Writing unlocked';}),
  action('Load host document',()=>{draft.value='Host-loaded fixture';editor.refresh('host-document');observe();status.textContent='Host document synchronized';}),
  editor.root,status,saved);
editor.refresh('fixture');observe();
