import {readingState,type ReadingState} from '../../windows/src/workspace/reader-data';
import type {SyncMeta} from './sync';
export type Source={reading?:ReadingState|null;name:string;text:string;pages?:{number:number;text:string;ocr:boolean}[]};
export type Note={role:string;text:string};
export type Project={id:string;name:string;draft:string;prompt:string;notes:Note[];sources:Source[];updated:number;pendingReply?:string;responseLength?:string;replyPlacement?:string;sync?:SyncMeta};
function text(value:unknown,limit:number):value is string{return typeof value==='string'&&value.length<=limit;}
/** Validate restore input and explicitly copy known fields; old backups stay compatible. */
export function restoreProjects(value:any,newId:()=>string,now=Date.now()):Project[]{
  if(!value||value.kind!=='\x63\x6f\x75\x63\x6f\x75-mobile-backup'||!Array.isArray(value.projects)||value.projects.length>200)throw Error('Choose a AnF Android backup.');
  return value.projects.map((p:any)=>{
    if(!p||!text(p.name,160)||!text(p.draft,200000)||!text(p.prompt,100000)||!Array.isArray(p.sources)||p.sources.length>4||!Array.isArray(p.notes)||p.notes.length>1000||p.sources.some((s:any)=>!s||!text(s.name,2000)||!text(s.text,2000000))||p.notes.some((n:any)=>!n||!text(n.role,100)||!text(n.text,200000))||(p.pendingReply!==undefined&&!text(p.pendingReply,200000)))throw Error('Backup contains invalid conversations.');
    return {id:newId(),name:p.name,draft:p.draft,prompt:p.prompt,notes:p.notes.map((n:Note)=>({role:n.role,text:n.text})),sources:p.sources.map((s:Source)=>({name:s.name,text:s.text,...(s.reading?{reading:readingState(s.reading,s.text)}:{})})),updated:now,pendingReply:p.pendingReply||'',responseLength:p.responseLength==='long'?'long':'standard',replyPlacement:p.replyPlacement==='replace'?'replace':'append'};
  });
}
export function mergeReply(draft:string,reply:string,placement:string){
  const combined=placement==='replace'||!draft.trim()?reply:draft+'\n\n## Next part\n\n'+reply;
  const full=new TextEncoder().encode(combined).length>200000;return {draft:full?draft:combined,full};
}
