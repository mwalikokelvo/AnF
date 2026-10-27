// Marketplace themes, shared by Windows and Android. Opt-in: nothing changes until the user installs and applies one.
// The page only names an add-on id; the native side (Rust on Windows, Java on Android) fetches, verifies and stores it.
import {h} from '../views/dom';
import './addons.css';
export type Call=<T=unknown>(command:string,args?:Record<string,unknown>)=>Promise<T>;
export function createMarketplace(call:Call){
 type Entry={id:string;name:string;version:string;type:'theme'|'plugin';description:string;author:string};
 const KEY='anf_active_theme';
 // data-theme-pack tells the built-in section colours (anf-color.css) to stand down while a marketplace theme is active.
 const tag=()=>{let s=document.getElementById('anf-active-theme');if(!s){s=document.createElement('style');s.id='anf-active-theme';document.head.append(s);}document.documentElement.setAttribute('data-theme-pack','');return s;};
 const remember=(id:string|null)=>{try{if(id)localStorage.setItem(KEY,id);else localStorage.removeItem(KEY);}catch{/* storage can be unavailable */}};
 const active=()=>{try{return localStorage.getItem(KEY);}catch{return null;}};
 async function applyTheme(id:string){tag().textContent=await call<string>('addons_read',{id});remember(id);}
 function clearTheme(){document.getElementById('anf-active-theme')?.remove();document.documentElement.removeAttribute('data-theme-pack');remember(null);}
 async function restoreTheme(){const id=active();if(id)await applyTheme(id).catch(clearTheme);}
 // Four colours read from the theme's own CSS, so a card shows what it will look like.
 const swatches=(css:string)=>h('div',{class:'swatches','aria-hidden':'true'},...['--bg','--surface','--accent','--ink'].map(v=>{const m=css.match(new RegExp(v+':\\s*(#[0-9a-fA-F]{3,8})'));return m?h('i',{style:`background:${m[1]}`}):null;}));
 function marketplacePanel(){
  const notice=h('p',{role:'status',class:'hint status'}),list=h('div',{class:'list'}),installed=new Set<string>(),css=new Map<string,string>();let store:Entry[]=[];
  const run=async(done:string,work:()=>Promise<void>)=>{notice.textContent='Working…';try{await work();notice.textContent=done;}catch(e){notice.textContent=String(e).replace(/^Error: /,'');}await draw();};
  async function draw(){
   try{const have=await call<Entry[]>('addons_list');installed.clear();for(const e of have){installed.add(e.id);if(!css.has(e.id))css.set(e.id,await call<string>('addons_read',{id:e.id}).catch(()=>''));}for(const e of have)if(!store.some(s=>s.id===e.id))store.unshift(e);}catch{/* offline list stays as is */}
   const now=active(),btn=(label:string,onclick:()=>void,primary=false)=>h('button',{type:'button',class:primary?'primary':undefined,text:label,onclick});
   if(!store.length){list.replaceChildren(h('p',{class:'hint',text:'No themes installed yet. Press Browse marketplace to see what is available.'}));return;}
   list.replaceChildren(...store.map(e=>{
    const has=installed.has(e.id),plugin=e.type==='plugin',on=has&&now===e.id;
    const actions=plugin?[h('span',{class:'soon',text:'Plugins are not available yet'})]:!has?[btn('Install and apply',()=>void run(`Installed and applied ${e.name}.`,async()=>{await call('addons_install',{id:e.id});await applyTheme(e.id);}),true)]
     :[on?null:btn('Apply',()=>void run(`Applied ${e.name}.`,()=>applyTheme(e.id)),true),btn('Remove',()=>void run(`Removed ${e.name}.`,async()=>{await call('addons_remove',{id:e.id});css.delete(e.id);if(active()===e.id)clearTheme();}))];
    return h('article',{class:'addon'+(on?' on':'')},
     h('div',{class:'head'},h('strong',{text:e.name}),h('span',{class:'ver',text:`v${e.version}${e.author?' · '+e.author:''}`}),on?h('span',{class:'badge',text:'Active'}):plugin?h('span',{class:'badge quiet',text:'Plugin'}):null),
     h('p',{class:'hint',text:e.description}),has&&css.get(e.id)?swatches(css.get(e.id)!):null,h('div',{class:'actions'},...actions));
   }));
  }
  const browse=h('button',{type:'button',text:'Browse marketplace',onclick:()=>void run('Marketplace loaded.',async()=>{store=await call<Entry[]>('addons_registry');})});
  const reset=h('button',{type:'button',text:'Use the default theme',onclick:()=>{clearTheme();notice.textContent='Default theme restored.';void draw();}});
  void draw();
  return h('details',{class:'addons'},h('summary',{text:'Themes (marketplace)'}),h('p',{class:'hint',text:'Browsing contacts raw.githubusercontent.com only when you press the button. Each theme is checked against a published checksum and cannot load anything from the internet.'}),h('div',{class:'row'},browse,reset),notice,list);
 }
 return {applyTheme,clearTheme,restoreTheme,marketplacePanel};
}
