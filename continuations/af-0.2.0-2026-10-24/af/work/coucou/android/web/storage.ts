import type {Project} from './project-data';
export type Summary={id:string;name:string;updated:number;syncId?:string};
export function summary(p:Project):Summary{return{id:p.id,name:p.name,updated:p.updated,syncId:p.sync?.id};}
export function signature(p:Project):string{const {updated,...content}=p;return JSON.stringify(content);}
export function readProject(db:IDBDatabase,id:string):Promise<Project|undefined>{return new Promise((resolve,reject)=>{const request=db.transaction('projects').objectStore('projects').get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
/** Cursor scans retain only the lightweight result, never the whole document library. */
function scan<T>(db:IDBDatabase,visit:(p:Project)=>T|undefined):Promise<T[]>{return new Promise((resolve,reject)=>{
  const result:T[]=[];const tx=db.transaction('projects');const request=tx.objectStore('projects').openCursor();
  request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve(result);return;}try{const item=visit(cursor.value);if(item!==undefined)result.push(item);cursor.continue();}catch(e){reject(e);tx.abort();}};
  request.onerror=()=>reject(request.error);tx.onabort=()=>reject(tx.error||Error('Reading saved conversations stopped.'));
});}
export async function summaries(db:IDBDatabase,query=''):Promise<Summary[]>{
  const term=query.trim().toLocaleLowerCase();
  const result=await scan(db,p=>!term||[p.name,p.draft,p.prompt,...p.notes.map(n=>n.text)].some(t=>t.toLocaleLowerCase().includes(term))?summary(p):undefined);
  return result.sort((a,b)=>b.updated-a.updated);
}
export async function backupProjects(db:IDBDatabase):Promise<Project[]>{
  let size=1000;
  return scan(db,p=>{size+=new TextEncoder().encode(JSON.stringify(p)).length+1;if(size>16_000_000)throw Error('All conversations exceed the 16 MB backup limit. Export individual conversations instead.');return p;});
}
