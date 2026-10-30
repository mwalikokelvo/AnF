// UI-02: an AI reply never silently replaces writing. "Add to draft" appends; "Insert at cursor" inserts;
// "Replace draft…" asks first when there is writing to lose; either can be undone while the draft is unchanged since.
import {h} from '../views/dom';
import {appendDraft} from './knowledge-data';

type Options={draft:()=>string;setDraft:(text:string)=>void;show:()=>void;notify:(text:string)=>void};

export function createReplyToDraft(o:Options){
  let undo:{before:string;after:string}|null=null;
  const note=h('span');
  const undoButton=h('button',{type:'button','data-keep-enabled':true,text:'Put my draft back'}) as HTMLButtonElement;
  const bar=h('div',{class:'draft-undo',role:'status',hidden:true},note,undoButton);
  undoButton.addEventListener('click',()=>{
    if(!undo)return;
    if(o.draft()!==undo.after)note.textContent='The draft has changed since, so it was left as it is.';
    else{o.setDraft(undo.before);note.textContent='Draft restored.';}
    undo=null;undoButton.hidden=true;
  });
  function apply(next:string,label:string){
    const before=o.draft();
    o.setDraft(next);undo={before,after:next};
    note.textContent=label;undoButton.hidden=false;bar.hidden=false;o.show();
  }
  const current=h('p'),incoming=h('pre',{class:'reply-dialog-preview'});
  const dialog=h('dialog',{class:'reply-dialog','aria-labelledby':'reply-dialog-title'},
    h('form',{method:'dialog'},
      h('h2',{id:'reply-dialog-title',text:'Replace your draft?'}),current,
      h('p',{class:'hint',text:'The reply that would take its place begins:'}),incoming,
      h('div',{class:'row'},h('button',{value:'cancel',text:'Keep my draft'}),h('button',{value:'replace',class:'danger',text:'Replace draft'}))));
  document.body.append(dialog);
  function confirmReplace(reply:string):Promise<boolean>{
    const words=o.draft().trim().split(/\s+/).length;
    current.textContent=`Your draft has ${words.toLocaleString()} word${words===1?'':'s'}. Replacing it can be undone until you edit again.`;
    incoming.textContent=reply.slice(0,600)+(reply.length>600?'…':'');
    dialog.returnValue='cancel';dialog.showModal();
    return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='replace'),{once:true}));
  }
  /** The actions shown under an assistant reply: Add, Insert at cursor, or Replace with confirmation. */
  function actions(reply:string){
    const add=h('button',{type:'button',text:'Add to draft'}) as HTMLButtonElement;
    add.addEventListener('click',()=>{try{apply(appendDraft(o.draft(),reply),'Reply added to the end of your draft.');}catch(e){o.notify(String(e).replace(/^Error:\s*/,''));}});
    const insert=h('button',{type:'button',text:'Insert at cursor'}) as HTMLButtonElement;
    insert.addEventListener('click',()=>{
      const cur=o.draft();
      const next=cur?cur+(cur.endsWith('\n')?'':'\n\n')+reply:reply;
      apply(next,'Reply inserted into your draft.');
    });
    const replace=h('button',{type:'button',text:'Replace draft…'}) as HTMLButtonElement;
    replace.addEventListener('click',async()=>{if(o.draft().trim()&&!await confirmReplace(reply))return;apply(reply,'Draft replaced with the reply.');});
    return [add,insert,replace];
  }
  /** Forget the undo when another conversation is opened, so it can never write into the wrong draft. */
  function reset(){undo=null;bar.hidden=true;}
  return {bar,actions,reset};
}
