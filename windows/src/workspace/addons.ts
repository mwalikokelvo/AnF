// Marketplace themes. Opt-in: nothing changes until the user installs and applies one.
// The page only names an add-on id; Rust fetches, verifies and stores it (addons.rs).
import {invoke} from '@tauri-apps/api/core';
import {h} from '../views/dom';
type Entry={id:string;name:string;version:string;type:'theme'|'plugin';description:string;author:string};
const KEY='anf_active_theme';
const tag=()=>{let s=document.getElementById('anf-active-theme');if(!s){s=document.createElement('style');s.id='anf-active-theme';document.head.append(s);}return s;};
const remember=(id:string|null)=>{try{if(id)localStorage.setItem(KEY,id);else localStorage.removeItem(KEY);}catch{/* storage can be unavailable */}};
export async function applyTheme(id:string){tag().textContent=await invoke<string>('addons_read',{id});remember(id);}
export function clearTheme(){document.getElementById('anf-active-theme')?.remove();remember(null);}
export async function restoreTheme(){let id:string|null=null;try{id=localStorage.getItem(KEY);}catch{/* none */}if(id)await applyTheme(id).catch(clearTheme);}
export function marketplacePanel(){
 const notice=h('p',{role:'status',class:'hint'}),list=h('div'),installed=new Set<string>();let store:Entry[]=[];
 const run=async(work:()=>Promise<void>)=>{notice.textContent='Working…';try{await work();notice.textContent='Done.';}catch(e){notice.textContent=String(e).replace(/^Error: /,'');}await draw();};
 async function draw(){
  try{const have=await invoke<Entry[]>('addons_list');installed.clear();for(const e of have)installed.add(e.id);if(!store.length)store=have;}catch{/* offline list stays as is */}
  list.replaceChildren(...store.map(e=>{
   const has=installed.has(e.id),plugin=e.type==='plugin';
   return h('div',{class:'card'},h('strong',{text:`${e.name} · ${e.version}`}),h('p',{class:'hint',text:`${e.type==='theme'?'Theme':'Plugin'}${e.author?' by '+e.author:''}. ${e.description}`}),
    h('div',{class:'row'},
     plugin?h('button',{type:'button',disabled:true,text:'Plugins are not available yet'}):has?h('button',{type:'button',text:'Apply',onclick:()=>void run(()=>applyTheme(e.id))}):h('button',{type:'button',text:'Install',onclick:()=>void run(async()=>{await invoke('addons_install',{id:e.id});await applyTheme(e.id);})}),
     has&&!plugin?h('button',{type:'button',text:'Remove',onclick:()=>void run(async()=>{await invoke('addons_remove',{id:e.id});try{if(localStorage.getItem(KEY)===e.id)clearTheme();}catch{/* none */}})}):null));
  }));
 }
 const browse=h('button',{type:'button',text:'Browse marketplace',onclick:()=>void run(async()=>{store=await invoke<Entry[]>('addons_registry');})});
 const reset=h('button',{type:'button',text:'Use the default theme',onclick:()=>{clearTheme();notice.textContent='Default theme restored.';}});
 void draw();
 return h('details',{},h('summary',{text:'Themes (marketplace)'}),h('p',{class:'hint',text:'Browsing contacts raw.githubusercontent.com only when you press the button. Each theme is checked against a published checksum and cannot load anything from the internet.'}),h('div',{class:'row'},browse,reset),notice,list);
}
