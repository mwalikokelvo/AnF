import {draftTasks,outsideCodeLines} from './dashboard-data';
export type KnowledgeNote={id:string;name:string;draft:string;sources:{name:string;text:string;reading?:{offset:number}|null}[]};
export function references(text:string){
 const clean=outsideCodeLines(text).map(line=>line.text).join('\n').replace(/`[^`\n]*`/g,'');
 return {links:[...new Set(Array.from(clean.matchAll(/\[\[([^\]\n|]+)(?:\|[^\]\n]+)?\]\]/g),m=>m[1].trim()).filter(Boolean))],tags:[...new Set(Array.from(clean.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*)/gu),m=>m[1].toLocaleLowerCase()).filter(tag=>tag.length<=160&&tag.split('/').length<=12))]};
}
export function matchesNote(note:KnowledgeNote,query:string){
 const terms=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean),refs=references(note.draft),hay=(note.name+' '+note.draft+' '+note.sources.map(s=>s.name+' '+s.text).join(' ')).toLocaleLowerCase();
 return terms.every(t=>{if(t.startsWith('tag:'))return refs.tags.some(tag=>tag===t.slice(4).replace(/^#/, '')||tag.startsWith(t.slice(4).replace(/^#/,'')+'/'));if(t==='has:task')return draftTasks(note.draft).length>0;if(t.startsWith('type:'))return note.sources.some(s=>s.name.toLocaleLowerCase().endsWith('.'+t.slice(5)));if(/^read:>\d+%?$/.test(t))return note.sources.some(s=>((s.reading?.offset||0)/Math.max(1,s.text.length))*100>Number(t.slice(6).replace('%','')));if(hay.includes(t))return true;if(t.length<3)return false;let i=0;for(const c of note.name.toLocaleLowerCase())if(c===t[i])i++;return i===t.length;});
}
export function connections(notes:KnowledgeNote[]){const byName=new Map<string,string[]>();for(const n of notes){const key=n.name.trim().toLocaleLowerCase();byName.set(key,[...(byName.get(key)||[]),n.id]);}return notes.flatMap(n=>references(n.draft).links.flatMap(link=>(byName.get(link.toLocaleLowerCase())||[]).filter(id=>id!==n.id).map(to=>({from:n.id,to}))));}
export const templates:Record<string,string>={
 'Reading log':'# Reading log\n\n## Source\n\n## Key ideas\n\n## Quotations\n\n## Questions\n\n- [ ] Revisit my notes',
 'Meeting record':'# Meeting record\n\n## Date and participants\n\n## Discussion\n\n## Decisions\n\n## Actions\n\n- [ ] Action — owner — due date',
 'Project brief':'# Project brief\n\n## Goal\n\n## Scope\n\n## Milestones\n\n- [ ] First milestone\n\n## Risks\n\n## Success criteria',
 'Daily habits':'## Daily habits\n\n- [ ] #habit/read Read\n- [ ] #habit/write Write\n- [ ] #habit/reflect Reflect'
};
export function appendDraft(draft:string,text:string){const next=draft+(draft.trim()?'\n\n':'')+text;if(new TextEncoder().encode(next).length>200000)throw Error('Writing limit reached. Start a new note before adding this material.');return next;}
export function habitState(text:string){const state:Record<string,boolean>={};for(const task of draftTasks(text)){const match=/^#habit\/(read|write|reflect)\b/.exec(task.text);if(match)state[match[1]]=task.checked;}return state;}

export type TagBranch={tag:string;count:number;children:TagBranch[]};
export function tagTree(notes:KnowledgeNote[]):TagBranch[]{
 const counts=new Map<string,number>();for(const note of notes){const seen=new Set<string>();for(const tag of references(note.draft).tags.slice(0,500)){const parts=tag.split('/');for(let i=1;i<=parts.length;i++)seen.add(parts.slice(0,i).join('/'));}for(const tag of seen)if(counts.has(tag)||counts.size<2000)counts.set(tag,(counts.get(tag)||0)+1);}
 const roots:TagBranch[]=[],nodes=new Map<string,TagBranch>();for(const tag of [...counts.keys()].sort()){const node={tag,count:counts.get(tag)!,children:[]};nodes.set(tag,node);const split=tag.lastIndexOf('/'),parent=split<0?undefined:nodes.get(tag.slice(0,split));(parent?parent.children:roots).push(node);}return roots;
}
export type GraphNode={id:string;label:string;kind:'note'|'document'|'tag';noteId?:string;tag?:string};
export function knowledgeGraph(notes:KnowledgeNote[],limit=150){
 const nodes:GraphNode[]=[],edges:{from:string;to:string}[]=[],ids=new Set<string>();let omitted=0;
 function add(n:GraphNode){if(ids.has(n.id))return true;if(nodes.length>=limit){omitted++;return false;}ids.add(n.id);nodes.push(n);return true;}
 for(const n of notes) add({id:'note:'+n.id,label:n.name,kind:'note',noteId:n.id});
 for(const e of connections(notes))if(ids.has('note:'+e.from)&&ids.has('note:'+e.to))edges.push({from:'note:'+e.from,to:'note:'+e.to});
 for(const n of notes){const from='note:'+n.id;if(!ids.has(from))continue;for(const [index,s] of n.sources.entries()){const id='document:'+n.id+':'+index;if(add({id,label:s.name,kind:'document',noteId:n.id}))edges.push({from,to:id});}for(const tag of references(n.draft).tags){const id='tag:'+tag;if(add({id,label:'#'+tag,kind:'tag',tag}))edges.push({from,to:id});}}
 return{nodes,edges,omitted};
}
