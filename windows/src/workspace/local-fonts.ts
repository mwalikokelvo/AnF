import {FONT_LICENSES} from './assets/font-licenses';
import lora from './assets/Lora.ttf';
import atkinson from './assets/AtkinsonHyperlegible-Regular.ttf';

export type ReaderFont={id:string;label:string;family:string};
type StoredFont={id:string;label:string;bytes:ArrayBuffer};
const MAX_FONT=10*1024*1024,MAX_COUNT=20;
export function validFont(bytes:ArrayBuffer):boolean {
 const b=new Uint8Array(bytes);if(b.length<12||b.length>MAX_FONT)return false;
 const magic=String.fromCharCode(...b.slice(0,4));
 return magic==='OTTO'||magic==='wOFF'||magic==='wOF2'||(b[0]===0&&b[1]===1&&b[2]===0&&b[3]===0);
}
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 const request=indexedDB.open('anf-reader-fonts',1);request.onupgradeneeded=()=>request.result.createObjectStore('fonts',{keyPath:'id'});
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('Font storage could not be opened.'));
});}
async function stored():Promise<StoredFont[]>{const db=await database();return new Promise((resolve,reject)=>{
 const tx=db.transaction('fonts','readonly'),request=tx.objectStore('fonts').getAll();request.onsuccess=()=>resolve(request.result);tx.oncomplete=()=>db.close();tx.onerror=()=>{db.close();reject(Error('Font storage could not be read.'));};
});}
export async function localFonts():Promise<ReaderFont[]>{
 const result:ReaderFont[]=[];
 const defaults=[{id:'lora',label:'Lora · bundled serif',family:'AnF Lora',url:lora},{id:'atkinson',label:'Atkinson Hyperlegible · bundled sans',family:'AnF Atkinson',url:atkinson}];
 for(const f of defaults){const face=new FontFace(f.family,`url(${JSON.stringify(f.url)})`);await face.load();document.fonts.add(face);result.push(f);}
 for(const f of (await stored().catch(()=>[])).slice(0,MAX_COUNT)){if(!validFont(f.bytes))continue;try{const family=`AnF Imported ${f.id}`;const face=new FontFace(family,f.bytes);await face.load();document.fonts.add(face);result.push({id:f.id,label:f.label,family});}catch{/* Invalid imports remain removable; default fonts still work. */}}
 return result;
}
export async function importLicensedFont(file:File):Promise<void>{
 if(file.size>MAX_FONT)throw Error('Choose a font smaller than 10 MB.');
 const bytes=await file.arrayBuffer();if(!validFont(bytes))throw Error('Choose a valid TTF, OTF, WOFF or WOFF2 font.');
 const digest=await crypto.subtle.digest('SHA-256',bytes),id=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const fonts=await stored();if(fonts.length>=MAX_COUNT&&!fonts.some(f=>f.id===id))throw Error('Remove an imported font before adding another (20 maximum).');
 const face=new FontFace(`AnF Imported ${id}`,bytes);await face.load();
 const db=await database();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('fonts','readwrite');tx.objectStore('fonts').put({id,label:file.name.replace(/\.[^.]+$/,'').slice(0,80),bytes});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(Error('Font could not be saved.'));};});
}
export async function removeImportedFonts():Promise<void>{const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('fonts','readwrite');tx.objectStore('fonts').clear();tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(Error('Fonts could not be removed.'));};});}
export function fontSettings(refresh:()=>Promise<void>,notify:(text:string)=>void):HTMLElement {
 const panel=document.createElement('section');panel.className='card';const title=document.createElement('h3');title.textContent='Reading fonts';
 const description=document.createElement('p');description.textContent='Lora and Atkinson Hyperlegible work offline. Import fonts you are licensed to use; imports stay on this device and are excluded from project backups.';
 const input=document.createElement('input');input.type='file';input.accept='.ttf,.otf,.woff,.woff2';input.hidden=true;
 const add=document.createElement('button');add.type='button';add.textContent='Import licensed font';add.onclick=()=>input.click();
 input.onchange=async()=>{const file=input.files?.[0];if(!file)return;add.disabled=true;try{await importLicensedFont(file);await refresh();notify('Font added to Reader appearance.');}catch(error){notify(String(error));}finally{input.value='';add.disabled=false;}};
 const clear=document.createElement('button');clear.type='button';clear.textContent='Remove imported fonts';clear.onclick=async()=>{try{await removeImportedFonts();await refresh();notify('Imported fonts removed. Bundled fonts remain available.');}catch(error){notify(String(error));}};
 const licenses=document.createElement('details'),summary=document.createElement('summary'),licenseText=document.createElement('pre');summary.textContent='Bundled font licenses';licenseText.textContent=FONT_LICENSES;licenses.append(summary,licenseText);panel.append(title,description,add,clear,input,licenses);return panel;
}
