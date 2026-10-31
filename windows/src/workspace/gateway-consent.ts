import {h} from '../views/dom';

/** Per-request consent. Never remember an approval for later documents/turns. */
export function confirmGatewayContext(provider: 'gateway'|'managed', sources: {name:string;text:string}[], historyCount:number, memory:string): Promise<boolean> {
  if(!sources.some(s=>s.text.trim())&&!historyCount&&!memory.trim())return Promise.resolve(true);
  return new Promise(resolve=>{
    const dialog=h('dialog',{'aria-label':'Confirm AI context sharing'});
    const finish=(approved:boolean)=>{dialog.close();dialog.remove();resolve(approved);};
    const cancel=h('button',{text:'Keep context on this device'});
    const send=h('button',{text:'Send this context for this answer'});
    cancel.addEventListener('click',()=>finish(false));
    send.addEventListener('click',()=>finish(true));
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
    dialog.append(h('h2',{text:'Send selected context?'}),h('p',{text:provider==='managed'
      ?'The managed AI router runs locally, but its selected provider may be online. Your context can be forwarded to that provider.'
      :'Your configured AI gateway may forward this context to an online provider. Check its routing before sending.'}),
      h('ul',{},...sources.filter(s=>s.text.trim()).map(s=>h('li',{text:s.name+' · '+s.text.length.toLocaleString()+' characters'})),
        ...(historyCount?[h('li',{text:historyCount+' recent conversation messages'})]:[]),
        ...(memory.trim()?[h('li',{text:'Saved conversation memory'})]:[])),
      h('p',{text:'This approval applies only to this answer. Choose local AI to keep inference on your computer.'}),cancel,send);
    document.body.append(dialog);dialog.showModal();cancel.focus();
  });
}
