// Small always-on-top helper: volume and media keys, plus opt-in screen help. No microphone.
// Screen help captures only after the Screen button, shows the shot, and sends only after Send.
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
// Screen help: capture -> preview -> Send -> answer. The screenshot lives only in this variable.
let shot:string|null=null,provider='';
const question=h('textarea',{rows:'2',maxlength:'2000',placeholder:'What do you need help with?','aria-label':'Question about the screenshot'}) as HTMLTextAreaElement;
const preview=h('img',{alt:'Screenshot that will be sent'}) as HTMLImageElement;
const answer=h('p',{class:'answer',tabindex:'0'});
const send=button('Send','Send the screenshot and question',()=>void ask());send.className='primary';
const cancel=button('Cancel','Discard the screenshot',()=>close());
const help=h('section',{class:'help',hidden:true},preview,question,h('div',{class:'row'},send,cancel),answer);
const close=()=>{shot=null;provider='';fold.disabled=false;preview.removeAttribute('src');question.value='';answer.textContent='';help.hidden=true;send.disabled=false;void invoke('companion_expand',{open:false});status.textContent='Screenshot discarded.';};
// While a request is out, the other buttons are off, so a late reply can never touch a newer capture.
const busy=(on:boolean)=>{send.disabled=on;cancel.disabled=on;screenButton.disabled=on;};
async function ask(){
 if(!shot)return;busy(true);answer.textContent='';status.textContent='Sending…';
 try{answer.textContent=await invoke<string>('screen_help_ask',{provider,image:shot,question:question.value});status.textContent='Answer ready. The screenshot was not saved.';shot=null;preview.removeAttribute('src');}
 catch(e){status.textContent=String(e);}
 finally{busy(false);}
}
const screenButton=button('Screen','Ask about my screen',async()=>{
 status.textContent='Capturing…';
 try{
  const result=await invoke<{image:string;provider:string}>('screen_help_capture');
  shot=result.image;provider=result.provider;compact=false;card.classList.remove('compact');fold.textContent='▾';fold.title='Collapse';fold.setAttribute('aria-label','Collapse');fold.disabled=true;preview.src=`data:image/jpeg;base64,${shot}`;answer.textContent='';help.hidden=false;
  await invoke('companion_expand',{open:true});question.focus();
  status.textContent=`This screenshot goes to ${result.provider} only if you press Send.`;
 }catch(e){status.textContent=String(e);}
});
fold.before(screenButton);card.append(help);
root.append(card);
