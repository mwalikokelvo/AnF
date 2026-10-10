import {readingState} from '../../windows/src/workspace/reader-data';
import type {Project,Source} from './project-data';
export type Wire={id:string;name:string;title:string;question:string;draft:string;history:{role:string;content:{text:string}[]}[];sources:(Source&{path:null;pages:{number:number;text:string;ocr:boolean}[]})[];memory:string;model:string};
export type Snapshot={project:Wire;revision:string};
export type SyncMeta={id:string;chat?:string;documents?:string;title:string;memory:string;model:string};
export function newSyncId(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');}
export function toWire(p:Project,documents:boolean):Wire{
  if(!p.sync)throw Error('Save the connection identity first.');
  const wire:Wire={id:p.sync.id,name:p.name,title:p.sync.title,question:p.prompt,draft:p.draft,history:p.notes.map(n=>({role:n.role==='You'?'user':'assistant',content:[{text:n.text}]})),sources:documents?p.sources.map(s=>({...s,path:null,pages:s.pages||[]})):[],memory:p.sync.memory,model:p.sync.model};
  const bytes=(s:string)=>new TextEncoder().encode(s).length;
  if(bytes(wire.question)>10000)throw Error(`“${p.name}” has a question longer than Windows accepts (10,000 bytes). Move background material into a document before syncing.`);
  if(bytes(wire.name)>160||bytes(wire.title)>300||bytes(wire.draft)>200000||wire.history.length>1000||wire.history.some(t=>bytes(t.content[0].text)>200000)||wire.sources.some(s=>bytes(s.text)>2000000))throw Error(`“${p.name}” exceeds Windows text limits. Export it and split it before syncing.`);
  return wire;
}
export function fromWire(s:Snapshot,previous:Project|undefined,documents:boolean,newId:()=>string):Project{
  const p=s.project;
  if(!p||!/^[0-9a-f]{64}$/.test(p.id)||!/^[0-9a-f]{64}$/.test(s.revision)||!Array.isArray(p.history)||!Array.isArray(p.sources))throw Error('Invalid conversation received.');
  return {...previous,id:previous?.id||newId(),name:p.name,draft:p.draft,prompt:p.question,notes:p.history.map(t=>({role:t.role==='user'?'You':'Assistant',text:t.content[0].text})),sources:documents?p.sources.map(s=>({name:s.name,text:s.text,pages:s.pages,...(s.reading?{reading:readingState(s.reading,s.text)}:{})})):previous?.sources||[],updated:Date.now(),sync:{...previous?.sync,id:p.id,title:p.title,memory:p.memory,model:p.model,[documents?'documents':'chat']:s.revision}};
}
