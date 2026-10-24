import {EditorState} from '@codemirror/state';

/** Keep command/completion transactions behind the same writing protections as
 * direct input. Trusted host synchronization must still work while locked. */
export function writingGuard(external:()=>boolean,notify:(text:string)=>void){
  return EditorState.transactionFilter.of(tr=>{
    if(!tr.docChanged||external())return tr;
    if(tr.startState.readOnly)return [];
    if(new TextEncoder().encode(tr.newDoc.toString()).length>200000){notify('Writing limit reached. Export or start another draft.');return [];}
    return tr;
  });
}
