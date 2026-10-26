// Small always-on-top helper: volume and media keys only. No screen capture, no microphone.
import {invoke} from '@tauri-apps/api/core';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {h} from '../views/dom';
import './companion.css';
const root=document.getElementById('companion-root')!;
const status=h('p',{role:'status',class:'status',text:'Hi! I can change the volume.'});
let compact=false;
const key=(direction:string,done:string)=>()=>void invoke('companion_key',{direction}).then(()=>{status.textContent=done;},e=>{status.textContent=String(e);});
const button=(label:string,title:string,onclick:()=>void)=>h('button',{type:'button','aria-label':title,title,text:label,onclick});
const fold=button('▾','Collapse',()=>{compact=!compact;card.classList.toggle('compact',compact);fold.textContent=compact?'▴':'▾';const label=compact?'Expand':'Collapse';fold.title=label;fold.setAttribute('aria-label',label);void invoke('companion_compact',{compact});});
const play=button('Play/Pause','Play or pause media',key('play','Play or pause sent.'));play.className='primary';
const card=h('main',{class:'card'},
 h('div',{class:'bar','data-tauri-drag-region':true},h('span',{class:'eyes','aria-hidden':'true'},h('i'),h('i')),h('span',{class:'name',text:'AnF'}),
  fold,
  button('✕','Close',()=>void getCurrentWindow().hide().then(()=>invoke('companion_close')))),
 status,
 h('div',{class:'row'},button('Vol −','Volume down',key('down','Volume down.')),button('Vol +','Volume up',key('up','Volume up.')),button('Mute','Mute or unmute',key('mute','Mute toggled.')),play));
root.append(card);
