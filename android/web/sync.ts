import {readingState} from '../../windows/src/workspace/reader-data';
import {restoreProjects,type Project,type Source} from './project-data';
export type WireTurn={role:string;content:{text:string}[];label?:'pc'|'browser'};
export type Wire={id:string;name:string;title:string;question:string;draft:string;history:WireTurn[];sources:(Source&{path:null;pages:{number:number;text:string;ocr:boolean}[]})[];memory:string;model:string};
export type Snapshot={project:Wire;revision:string};
export type SyncMeta={id:string;chat?:string;documents?:string;title:string;memory:string;model:string};
export function newSyncId(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');}
function wireNote(note:{role:string;text:string}):WireTurn{
  if(note.role==='You')return {role:'user',content:[{text:note.text}]};
  if(note.role==='PC offline AI')return {role:'assistant',content:[{text:note.text}],label:'pc'};
  if(note.role==='Browser reply')return {role:'assistant',content:[{text:note.text}],label:'browser'};
  return {role:'assistant',content:[{text:note.text}]};
}
function phoneRole(turn:WireTurn){
  if(turn.role==='user')return 'You';
  if(turn.label==='pc')return 'PC offline AI';
  if(turn.label==='browser')return 'Browser reply';
  return 'Assistant';
}
/** A conversation that Windows cannot store is skipped. A transport failure stops the rest of the sync. */
export function syncFailureKind(error:unknown):'skip'|'stop'{
  const message=error instanceof Error?error.message:String(error);
  return message.includes('longer than Windows accepts')||message.includes('exceeds Windows text limits')?'skip':'stop';
}
/** Keep a UTF-8 prefix. Windows counts bytes, and a cut must not split a character. */
export function utf8Prefix(value:string,max:number){
  const bytes=new TextEncoder().encode(value);
  if(bytes.length<=max)return value;
  let end=max;
  while(end>0&&(bytes[end]&0xc0)===0x80)end--;
  return new TextDecoder().decode(bytes.subarray(0,end));
}
export function toWire(p:Project,documents:boolean):Wire{
  if(!p.sync)throw Error('Save the connection identity first.');
  const wire:Wire={id:p.sync.id,name:p.name,title:p.sync.title,question:p.prompt,draft:p.draft,history:p.notes.map(wireNote),sources:documents?p.sources.map(s=>({...s,path:null,pages:s.pages||[]})):[],memory:p.sync.memory,model:p.sync.model};
  const bytes=(s:string)=>new TextEncoder().encode(s).length;
  if(bytes(wire.question)>10000)throw Error(`“${p.name}” has a question longer than Windows accepts (10,000 bytes). Move background material into a document before syncing.`);
  if(bytes(wire.name)>160||bytes(wire.title)>300||bytes(wire.draft)>200000||wire.history.length>1000||wire.history.some(t=>bytes(t.content[0].text)>200000)||wire.sources.some(s=>bytes(s.text)>2000000))throw Error(`“${p.name}” exceeds Windows text limits. Export it and split it before syncing.`);
  return wire;
}
function notesFromWindowsHistory(history:unknown):{role:string;text:string}[]{
  if(history==null)return [];
  if(!Array.isArray(history))throw Error('Backup contains invalid conversations.');
  return history.map(turn=>{
    const role=turn?.role,label=turn?.label;
    if(role!=='user'&&role!=='assistant')throw Error('Backup contains invalid conversations.');
    if(label!=null&&label!=='pc'&&label!=='browser')throw Error('Backup contains invalid conversations.');
    const text=turn?.content?.[0]?.text;
    if(typeof text!=='string')throw Error('Backup contains invalid conversations.');
    return {role:phoneRole(turn),text};
  });
}
function windowsSync(source:any):SyncMeta|undefined{
  if(!source||typeof source.id!=='string'||!/^[0-9a-f]{64}$/.test(source.id)||typeof source.title!=='string'||typeof source.memory!=='string'||typeof source.model!=='string')return undefined;
  return {id:source.id,title:source.title,memory:source.memory,model:source.model};
}
/** Restore a phone backup or a Windows backup as new phone copies. */
export function restoreEitherHost(value:any,newId:()=>string,now=Date.now()):Project[]{
  if(value?.kind!=='coucou-windows-backup')return restoreProjects(value,newId,now);
  if(value.version!==1||!Array.isArray(value.projects))throw Error('Choose a AnF Windows backup.');
  const projects=value.projects.map((p:any)=>({name:p?.name,draft:p?.draft,prompt:p?.question,notes:notesFromWindowsHistory(p?.history),sources:p?.sources,pendingReply:p?.pendingReply,responseLength:p?.responseLength,replyPlacement:p?.replyPlacement}));
  const restored=restoreProjects({kind:'coucou-mobile-backup',version:1,projects},newId,now);
  return restored.map((project,index)=>{const sync=windowsSync(value.projects[index]);return sync?{...project,sync}:project;});
}
export function fromWire(s:Snapshot,previous:Project|undefined,documents:boolean,newId:()=>string):Project{
  const p=s.project;
  if(!p||!/^[0-9a-f]{64}$/.test(p.id)||!/^[0-9a-f]{64}$/.test(s.revision)||!Array.isArray(p.history)||!Array.isArray(p.sources))throw Error('Invalid conversation received.');
  const notes=p.history.map(turn=>{
    const text=turn.content?.[0]?.text;
    if(typeof text!=='string')throw Error('Invalid conversation received.');
    return {role:phoneRole(turn),text};
  });
  return {...previous,id:previous?.id||newId(),name:p.name,draft:p.draft,prompt:p.question,notes,sources:documents?p.sources.map(source=>({name:source.name,text:source.text,pages:source.pages,...(source.reading?{reading:readingState(source.reading,source.text)}:{})})):previous?.sources||[],updated:Date.now(),sync:{...previous?.sync,id:p.id,title:p.title,memory:p.memory,model:p.model,[documents?'documents':'chat']:s.revision}};
}
