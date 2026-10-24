import {readingState,type ReadingState} from '../../windows/src/workspace/reader-data';
import {copyEvidence,type Evidence} from '../../windows/src/workspace/answer-evidence';
import type {SyncMeta} from './sync';
export type Source={reading?:ReadingState|null;name:string;text:string;pages?:{number:number;text:string;ocr:boolean}[]};
export type Note={role:string;text:string;evidence?:Evidence[]};
export type Project={id:string;name:string;draft:string;prompt:string;notes:Note[];sources:Source[];updated:number;pendingReply?:string;responseLength?:string;replyPlacement?:string;sync?:SyncMeta};
function text(value:unknown,limit:number):value is string{return typeof value==='string'&&value.length<=limit;}
function utf8Text(value:unknown,limit:number):value is string{return text(value,limit)&&new TextEncoder().encode(value).length<=limit;}
export function restoreSource(value:unknown):Source{
  const s=value as Source;
  if(!s||!utf8Text(s.name,2000)||!utf8Text(s.text,2000000))throw Error('Backup contains an invalid document.');
  let pages:Source['pages'];
  if(s.pages!==undefined){
    if(!Array.isArray(s.pages)||s.pages.length>600)throw Error('Backup contains invalid document pages.');
    let bytes=0;const numbers=new Set<number>();
    pages=s.pages.map(p=>{
      if(!p||!Number.isSafeInteger(p.number)||p.number<1||numbers.has(p.number)||typeof p.text!=='string'||typeof p.ocr!=='boolean')throw Error('Backup contains invalid document pages.');
      bytes+=new TextEncoder().encode(p.text).length;
      if(bytes>2000000)throw Error('Backup document pages exceed the text limit.');
      numbers.add(p.number);return {number:p.number,text:p.text,ocr:p.ocr};
    });
  }
  return {name:s.name,text:s.text,...(pages!==undefined?{pages}:{}),...(s.reading?{reading:readingState(s.reading,s.text)}:{})};
}
/** Validate restore input and explicitly copy known fields; old backups stay compatible. */
export function restoreProjects(value:any,newId:()=>string,now=Date.now()):Project[]{
  if(!value||value.kind!=='coucou-mobile-backup'||!Array.isArray(value.projects)||value.projects.length>200)throw Error('Choose a Coucou Android backup.');
  return value.projects.map((p:any)=>{
    if(!p||!text(p.name,160)||!utf8Text(p.draft,200000)||!utf8Text(p.prompt,100000)||!Array.isArray(p.sources)||p.sources.length>4||!Array.isArray(p.notes)||p.notes.length>1000||p.notes.some((n:any)=>!n||!text(n.role,100)||!utf8Text(n.text,200000))||(p.pendingReply!==undefined&&!utf8Text(p.pendingReply,200000)))throw Error('Backup contains invalid conversations.');
    return {id:newId(),name:p.name,draft:p.draft,prompt:p.prompt,notes:p.notes.map((n:Note)=>{const evidence=copyEvidence(n.evidence);return {role:n.role,text:n.text,...(evidence.length?{evidence}:{})};}),sources:p.sources.map(restoreSource),updated:now,pendingReply:p.pendingReply||'',responseLength:p.responseLength==='long'?'long':'standard',replyPlacement:p.replyPlacement==='replace'?'replace':'append'};
  });
}
export function mergeReply(draft:string,reply:string,placement:string){
  const combined=placement==='replace'||!draft.trim()?reply:draft+'\n\n## Next part\n\n'+reply;
  const full=new TextEncoder().encode(combined).length>200000;return {draft:full?draft:combined,full};
}
