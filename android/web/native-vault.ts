import type {Project} from './project-data';
import type {Summary} from './storage';
import {readProject,summaries,backupProjects} from './storage';
import type {VaultStatus} from '../../windows/src/workspace/vault-panel';
declare global {interface Window {vaultResult:(id:string,value:string,error:string)=>void;}}
const pending=new Map<string,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();let sequence=0;
window.vaultResult=(id,value,error)=>{const p=pending.get(id);if(!p)return;pending.delete(id);clearTimeout(p.timer);try{if(error)throw Error(error);p.resolve(JSON.parse(value));}catch(e){p.reject(e instanceof Error?e:Error(String(e)));}};
export function vaultCall<T>(operation:string,args:unknown={}):Promise<T>{return new Promise((resolve,reject)=>{const native=window.CoucouAndroid;if(!native?.vaultRequest){reject(Error('Encrypted storage requires the updated installed Android app.'));return;}const id=String(++sequence);const timer=setTimeout(()=>{pending.delete(id);reject(Error('Storage response timed out. Reopen AnF before retrying migration.'));},120000);pending.set(id,{resolve,reject,timer});try{native.vaultRequest(id,operation,JSON.stringify(args));}catch(e){pending.delete(id);clearTimeout(timer);reject(e);}});}
function canonical(value:unknown):string{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';const o=value as Record<string,unknown>;return '{'+Object.keys(o).filter(k=>o[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(o[k])).join(',')+'}';}
export function createRepository(dbReady:Promise<IDBDatabase>){
 // A failed native status must never silently switch to the old plaintext store.
 let encrypted=false;
 let queue:Promise<unknown>=Promise.resolve();
 function serial<T>(action:()=>Promise<T>):Promise<T>{const result=queue.then(action);queue=result.catch(()=>{});return result;}
 const ready=(async()=>{if(window.CoucouAndroid?.vaultRequest)encrypted=(await vaultCall<VaultStatus>('status')).encrypted;})();
 ready.catch(()=>{});
 async function status():Promise<VaultStatus>{if(!window.CoucouAndroid?.vaultRequest)return {encrypted:false,legacy_retained:true};const s=await vaultCall<VaultStatus>('status');encrypted=s.encrypted;return s;}
 return {status:()=>serial(status),
 list(query=''){return serial(async()=>{await ready;return encrypted?vaultCall<Summary[]>('list',{query}):summaries(await dbReady,query);});},
 get(id:string){return serial(async()=>{await ready;return encrypted?(await vaultCall<Project|null>('get',{id}))??undefined:readProject(await dbReady,id);});},
 put(items:Project[]){return serial(async()=>{await ready;if(encrypted){await vaultCall('put',{projects:items});return;}const db=await dbReady;await new Promise<void>((resolve,reject)=>{const tx=db.transaction('projects','readwrite');items.forEach(p=>tx.objectStore('projects').put(p));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});});},
 backup(){return serial(async()=>{await ready;if(!encrypted)return backupProjects(await dbReady);const list=await vaultCall<Summary[]>('list');if(list.length>200)throw Error('Export up to 200 conversations per backup.');const items:Project[]=[];let size=1000;for(const p of list){const value=await vaultCall<Project>('get',{id:p.id});if(!value)throw Error('A saved conversation could not be read.');size+=new TextEncoder().encode(JSON.stringify(value)).length;if(size>16000000)throw Error('Backup exceeds 16 MB. Export individual conversations.');items.push(value);}return items;});},
 enable(){return serial(async()=>{await ready;const current=await status();if(current.encrypted)return current;const db=await dbReady,list=await summaries(db);await vaultCall('begin');for(const item of list){const original=await readProject(db,item.id);if(!original)throw Error('A conversation disappeared during migration.');await vaultCall('migration_put',{projects:[original]});const copy=await vaultCall<Project>('migration_get',{id:item.id});if(canonical(original)!==canonical(copy))throw Error('Migration comparison failed. Original data is unchanged.');}encrypted=true;await vaultCall('commit',{count:list.length});const result=await status();if(!result.encrypted||result.projects!==list.length)throw Error('Migration verification failed. Reopen AnF.');return result;});}
 };
}
