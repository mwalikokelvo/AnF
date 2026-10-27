// UI-03: a failed save stays on screen until a later save succeeds. One automatic retry, then Retry and
// a way to keep a copy are offered. The edits themselves stay in the editor the whole time.
import {h} from '../views/dom';

type Options={retry:()=>Promise<void>;keepCopy:{label:string;run:()=>void|Promise<void>}};
const AUTO_RETRY_MS=4000;

export function createSaveAlert(o:Options){
  let failures=0,timer:ReturnType<typeof setTimeout>|undefined;
  const message=h('span');
  const retry=h('button',{type:'button','data-keep-enabled':true,text:'Retry save'}) as HTMLButtonElement;
  const copy=h('button',{type:'button','data-keep-enabled':true,text:o.keepCopy.label}) as HTMLButtonElement;
  const root=h('div',{class:'save-alert',role:'alert',hidden:true},message,retry,copy);
  const attempt=()=>{if(timer)clearTimeout(timer);timer=undefined;void o.retry().catch(()=>{/* reported through failed() */});};
  retry.addEventListener('click',attempt);
  copy.addEventListener('click',()=>{void Promise.resolve(o.keepCopy.run()).catch(e=>{message.textContent=`Could not save a copy either: ${reason(e)}`;});});
  function reason(e:unknown){return String(e).replace(/^Error:\s*/,'');}
  return{
    root,
    /** Call when a save fails. The first failure in a row retries once on its own. */
    failed(e:unknown){
      failures++;root.hidden=false;
      if(failures===1){message.textContent=`Could not save (${reason(e)}). Trying again…`;timer=setTimeout(attempt,AUTO_RETRY_MS);}
      else message.textContent=`Your latest changes are not saved (${reason(e)}). They are still here; retry, or keep a copy.`;
    },
    /** Call when a save succeeds. */
    saved(){failures=0;if(timer)clearTimeout(timer);timer=undefined;root.hidden=true;},
    get failing(){return failures>0;},
  };
}
