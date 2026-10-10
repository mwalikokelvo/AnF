import {h} from '../views/dom';
export function quickCapture(save:(text:string)=>Promise<void>,allowed:()=>boolean){
  const root=h('dialog',{'aria-label':'Quick note',class:'capture-dialog'}),text=h('textarea',{'aria-label':'Quick note text',maxlength:10000,placeholder:'Capture a thought…'}),status=h('p',{role:'status'});
  let saving=false;
  const cancel=h('button',{text:'Cancel',onclick:()=>{if(!saving)root.close();}});
  const submit=h('button',{text:'Save to today’s log',onclick:()=>{if(saving||!allowed())return;if(!text.value.trim()){status.textContent='Write a note first.';return;}saving=true;submit.disabled=cancel.disabled=text.disabled=true;void save(text.value).then(()=>{text.value='';root.close();}).catch(e=>status.textContent='Not saved: '+String(e)).finally(()=>{saving=false;submit.disabled=cancel.disabled=text.disabled=false;});}});
  root.addEventListener('cancel',e=>{if(saving)e.preventDefault();});
  root.append(h('h2',{text:'Quick note'}),text,status,h('div',{class:'audio-controls'},submit,cancel));document.body.append(root);
  return{open:(value?:string)=>{if(!allowed())return false;if(value!==undefined){if(text.value.trim()&&text.value!==value){status.textContent='Save or clear your existing quick note before adding shared text.';}else{text.value=value.slice(0,10000);status.textContent=value.length>10000?'Only the first 10,000 characters fit. Review before saving.':'';}}if(!root.open)root.showModal();text.focus();return true;}};
}
