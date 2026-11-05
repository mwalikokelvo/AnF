import {readingState,type ReadingState} from '../../windows/src/workspace/reader-data';
import type {SyncMeta} from './sync';
export type Source={reading?:ReadingState|null;name:string;text:string;pages?:{number:number;text:string;ocr:boolean}[]};
export type Note={role:string;text:string};
export type Project={id:string;name:string;draft:string;prompt:string;notes:Note[];sources:Source[];updated:number;pendingReply?:string;responseLength?:string;replyPlacement?:string;sync?:SyncMeta};
function text(value:unknown,limit:number):value is string{return typeof value==='string'&&value.length<=limit;}
function copyPages(pages:Source['pages']):Source['pages']{
  if(!Array.isArray(pages))return undefined;
  const kept:{number:number;text:string;ocr:boolean}[]=[];
  let bytes=0;
  for(const page of pages){
    if(!page||typeof page.number!=='number'||!Number.isSafeInteger(page.number)||page.number<0||typeof page.text!=='string'||typeof page.ocr!=='boolean')continue;
    if(kept.length>=600)break;
    bytes+=page.text.length;
    if(bytes>2_000_000)break;
    kept.push({number:page.number,text:page.text,ocr:page.ocr});
  }
  return kept.length?kept:undefined;
}
function copySource(source:Source):Source{
  const pages=copyPages(source.pages);
  return {name:source.name,text:source.text,...(pages?{pages}:{}),...(source.reading?{reading:readingState(source.reading,source.text)}:{})};
}
/** Validate restore input and explicitly copy known fields; old backups stay compatible. File restore uses a new id so it does not overwrite the Windows twin. */
export function restoreProjects(value:any,newId:()=>string,now=Date.now()):Project[]{
  if(!value||value.kind!=='\x63\x6f\x75\x63\x6f\x75-mobile-backup'||!Array.isArray(value.projects)||value.projects.length>200)throw Error('Choose a AnF Android backup.');
  return value.projects.map((p:any)=>{
    if(!p||!text(p.name,160)||!text(p.draft,200000)||!text(p.prompt,100000)||!Array.isArray(p.sources)||p.sources.length>4||!Array.isArray(p.notes)||p.notes.length>1000||p.sources.some((s:any)=>!s||!text(s.name,2000)||!text(s.text,2000000))||p.notes.some((n:any)=>!n||!text(n.role,100)||!text(n.text,200000))||(p.pendingReply!==undefined&&!text(p.pendingReply,200000)))throw Error('Backup contains invalid conversations.');
    return {id:newId(),name:p.name,draft:p.draft,prompt:p.prompt,notes:p.notes.map((n:Note)=>({role:n.role,text:n.text})),sources:p.sources.map((s:Source)=>copySource(s)),updated:now,pendingReply:p.pendingReply||'',responseLength:p.responseLength==='long'?'long':'standard',replyPlacement:p.replyPlacement==='replace'?'replace':'append'};
  });
}
/** Put a vault snapshot back into the same conversation, including its Windows sync identity and OCR pages. */
export function restoreInPlace(project:Project,now=Date.now()):Project{
  const [copy]=restoreProjects({kind:'coucou-mobile-backup',version:1,projects:[project]},()=>project.id,now);
  return project.sync?{...copy,sync:{...project.sync}}:copy;
}
export function mergeReply(draft:string,reply:string,placement:string){
  const combined=placement==='replace'||!draft.trim()?reply:draft+'\n\n## Next part\n\n'+reply;
  const full=new TextEncoder().encode(combined).length>200000;return {draft:full?draft:combined,full};
}
