import {h} from '../views/dom';
import {quickCaptureLimit} from './dashboard-data';
export function quickCapture(save:(text:string)=>Promise<void>,allowed:()=>boolean){
  const root=h('dialog',{'aria-label':'Quick note',class:'capture-dialog'}),text=h('textarea',{'aria-label':'Quick note text',maxlength:quickCaptureLimit,placeholder:'Capture a thought…'}),status=h('p',{role:'status'});
  let saving=false;
  const cancel=h('button',{text:'Cancel',onclick:()=>{if(!saving)root.close();}});
  const submit=h('button',{text:'Save to today’s log',onclick:()=>{if(saving||!allowed())return;if(!text.value.trim()){status.textContent='Write a note first.';return;}if(text.value.length>quickCaptureLimit){status.textContent='Keep quick captures under 8,000 characters.';return;}const captured=text.value;saving=true;submit.disabled=cancel.disabled=text.disabled=true;void (async()=>save(captured))().then(()=>{text.value='';root.close();}).catch(e=>status.textContent='Not saved: '+String(e)).finally(()=>{saving=false;submit.disabled=cancel.disabled=text.disabled=false;});}});
  root.addEventListener('cancel',e=>{if(saving)e.preventDefault();});
  root.append(h('h2',{text:'Quick note'}),text,status,h('div',{class:'audio-controls'},submit,cancel));document.body.append(root);
  return{open:(value?:string)=>{if(saving||!allowed())return false;if(value!==undefined){if(text.value.trim()&&text.value!==value){status.textContent='Save or clear your existing quick note before adding shared text.';}else{let end=Math.min(value.length,quickCaptureLimit);if(end<value.length&&/[\uD800-\uDBFF]/.test(value[end-1]))end--;text.value=value.slice(0,end);status.textContent=value.length>end?'Only the first 8,000 characters fit. Review before saving.':'';}}if(!root.open)root.showModal();text.focus();return true;}};
}
