import {copyEvidence,type Evidence} from '../../shared/domain/answer-evidence';
import {restoreProjects,restoreSource,type Project,type Source} from './project-data';
export type Wire={id:string;name:string;title:string;question:string;draft:string;history:{role:string;content:{text:string}[];evidence?:Evidence[]}[];sources:(Source&{path:null;pages:{number:number;text:string;ocr:boolean}[]})[];memory:string;model:string};
export type Snapshot={project:Wire;revision:string};
export type SyncMeta={id:string;chat?:string;documents?:string;title:string;memory:string;model:string};
/** Copy only bounded, unique remote identities before issuing any pull requests. */
export function remoteEntries(value:unknown):{id:string}[]{
  const list=value as {entries?:unknown};
  if(!list||!Array.isArray(list.entries)||list.entries.length>200)throw Error('Invalid PC conversation list. Sync supports up to 200 conversations.');
  const seen=new Set<string>();
  return list.entries.map(entry=>{
    if(!entry||typeof entry.id!=='string'||!/^[0-9a-f]{64}$/.test(entry.id)||seen.has(entry.id))throw Error('Invalid or duplicate PC conversation identity.');
    seen.add(entry.id);return {id:entry.id};
  });
}
/** Windows gives the phone's version a new identity on conflict and returns the
 * requested identity as `other`. Accept that pair, never an unrelated replacement. */
export function exchangeIdentity(result:Snapshot&{conflict:boolean;other:Snapshot|null},expectedId:string):string{
  if(!result||typeof result.conflict!=='boolean'||!result.project)throw Error('Invalid sync exchange.');
  if(result.conflict){
    if(!result.other?.project||result.other.project.id!==expectedId||typeof result.project.id!=='string'||!/^[0-9a-f]{64}$/.test(result.project.id)||result.project.id===expectedId)throw Error('Invalid sync conflict identities.');
    return result.project.id;
  }
  if(result.other!==null||result.project.id!==expectedId)throw Error('Invalid or mismatched sync exchange.');
  return expectedId;
}
export function newSyncId(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');}
export function toWire(p:Project,documents:boolean):Wire{
  if(!p.sync)throw Error('Save the connection identity first.');
  const wire:Wire={id:p.sync.id,name:p.name,title:p.sync.title,question:p.prompt,draft:p.draft,history:p.notes.map(n=>{const evidence=documents?copyEvidence(n.evidence):[];return {role:n.role==='You'?'user':'assistant',content:[{text:n.text}],...(evidence.length?{evidence}:{})};}),sources:documents?p.sources.map(s=>({...restoreSource(s),path:null,pages:s.pages||[]})):[],memory:p.sync.memory,model:p.sync.model};
  const bytes=(s:string)=>new TextEncoder().encode(s).length;
  if(bytes(wire.question)>10000)throw Error(`“${p.name}” has a question longer than Windows accepts (10,000 bytes). Move background material into a document before syncing.`);
  if(bytes(wire.name)>160||bytes(wire.title)>300||bytes(wire.draft)>200000||wire.history.length>1000||wire.history.some(t=>bytes(t.content[0].text)>200000)||wire.sources.some(s=>bytes(s.text)>2000000))throw Error(`“${p.name}” exceeds Windows text limits. Export it and split it before syncing.`);
  return wire;
}
export function fromWire(s:Snapshot,previous:Project|undefined,documents:boolean,newId:()=>string,expectedId=previous?.sync?.id):Project{
  const p=s?.project;
  const text=(value:unknown,limit:number)=>typeof value==='string'&&value.length<=limit&&new TextEncoder().encode(value).length<=limit;
  if(!p||typeof p.id!=='string'||!/^[0-9a-f]{64}$/.test(p.id)||typeof s.revision!=='string'||!/^[0-9a-f]{64}$/.test(s.revision)
    ||(expectedId!==undefined&&p.id!==expectedId)||!text(p.name,160)||!text(p.title,300)||!text(p.question,10000)||!text(p.draft,200000)||!text(p.memory,12000)||!['fast','balanced'].includes(p.model)
    ||!Array.isArray(p.history)||p.history.length>1000||!Array.isArray(p.sources)||p.sources.length>4
    ||p.history.some(t=>!t||!['user','assistant'].includes(t.role)||!Array.isArray(t.content)||t.content.length!==1||!t.content[0]||!text(t.content[0].text,200000)))throw Error('Invalid or mismatched conversation received. Nothing from this exchange was saved.');
  const notes=p.history.map((t,index)=>{
    const role=t.role==='user'?'You':'Assistant',text=t.content[0].text,old=previous?.notes[index];
    const evidence=copyEvidence(documents?t.evidence:old?.role===role&&old.text===text?old.evidence:undefined);
    return {role,text,...(evidence.length?{evidence}:{})};
  });
  // Apply the same source/page/evidence and byte limits used for backup restore.
  // Validation finishes before allocating a local identity or building saved state.
  const validated=restoreProjects({kind:'coucou-mobile-backup',projects:[{name:p.name,draft:p.draft,prompt:p.question,notes,sources:documents?p.sources:[]}]},()=> 'validation-only')[0];
  return {...previous,id:previous?.id||newId(),name:validated.name,draft:validated.draft,prompt:validated.prompt,notes:validated.notes,sources:documents?validated.sources:previous?.sources||[],updated:Date.now(),sync:{...previous?.sync,id:p.id,title:p.title,memory:p.memory,model:p.model,[documents?'documents':'chat']:s.revision}};
}
