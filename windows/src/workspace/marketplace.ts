import {invoke} from '@tauri-apps/api/core';
import {h} from '../views/dom';
import {catalog,manifest,REGISTRY,themeStyle,type AddonManifest} from './addon-data';
import registry from '../../../marketplace/registry.json?raw';
import sampleTheme from '../../../marketplace/sample-theme/theme.css?raw';
import samplePlugin from '../../../marketplace/sample-plugin/index.js?raw';
import './marketplace.css';
import '../styles/theme-tokens.css';

export function createMarketplace(report:(s:string)=>void){
 const builtin=catalog(JSON.parse(registry)),contents:Record<string,string>={'catppuccin-mocha':sampleTheme,'hello-plugin':samplePlugin};
 let items=builtin,installed=new Map<string,AddonManifest>(),pending=false;
 const counts=new Map<string,number>();
 const frames=new Map<string,HTMLIFrameElement>(),pluginRows=new Map<string,HTMLElement>();
 const enabled=new Set<string>(readEnabled()),pluginArea=h('div',{'aria-label':'Extension actions',class:'addon-actions'}),grid=h('div',{class:'addon-grid'}),message=h('p',{role:'status'});
 const close=h('button',{text:'Close',onclick:()=>dialog.close()});
 const dialog=h('dialog',{'aria-label':'AnF Marketplace',class:'addon-marketplace'},h('header',{},h('h2',{text:'AnF Marketplace'}),close),
 h('p',{text:'Themes change your colors. Extensions run in an isolated frame with no workspace files, native commands or network access.'}),
 h('div',{class:'row'},h('button',{text:'Refresh online catalog',onclick:()=>void work(async()=>{items=catalog(JSON.parse(await invoke<string>('fetch_addon_resource',{url:REGISTRY})));message.textContent='Online catalog loaded.';render();})}),
 h('button',{text:'Restore default theme',onclick:()=>{document.getElementById('anf-active-theme')?.remove();localStorage.removeItem('anf_active_theme');render();report('Default theme restored.');}})),message,grid);
 document.body.append(dialog);
 function readEnabled():string[]{try{const v:unknown=JSON.parse(localStorage.getItem('anf_enabled_plugins')||'[]');return Array.isArray(v)?v.filter((s):s is string=>typeof s==='string'&&/^[a-z0-9-]{1,64}$/.test(s)).slice(0,100):[];}catch{return[];}}
 function persist(){localStorage.setItem('anf_enabled_plugins',JSON.stringify([...enabled]));}
 async function work(fn:()=>Promise<void>){if(pending)return;pending=true;render();try{await fn();}catch(e){message.textContent=String(e).replace(/^Error: /,'');report(message.textContent);}finally{pending=false;render();}}
 async function load(){installed=new Map((await Promise.all(['themes','plugins'].map(addonType=>invoke<string[]>('list_installed_addons',{addonType})))).flat().map(raw=>{const m=manifest(JSON.parse(raw));return[m.id,m];}));}
 async function applyTheme(id:string){const css=await invoke<string>('read_addon_file',{addonType:'themes',id,filename:'theme.css'});const text=themeStyle(css);
 let style=document.getElementById('anf-active-theme') as HTMLStyleElement|null;
 if(!style){style=h('style',{id:'anf-active-theme'});document.head.append(style);}style.textContent=text;localStorage.setItem('anf_active_theme',id);}
 function stop(id:string){counts.delete(id);frames.get(id)?.remove();frames.delete(id);pluginRows.get(id)?.remove();pluginRows.delete(id);enabled.delete(id);persist();}
 async function runPlugin(id:string){
  if(frames.has(id))return;
  // Validate integrity through the backend before loading the separate origin.
  await invoke<string>('read_addon_file',{addonType:'plugins',id,filename:'index.js'});
  const frame=h('iframe',{sandbox:'allow-scripts',title:'Isolated extension '+id,hidden:true,src:(navigator.userAgent.includes('Windows')?'http://anf-addon.localhost':'anf-addon://localhost')+'/plugins/'+encodeURIComponent(id)});
  const row=h('section',{},h('strong',{text:installed.get(id)?.name||id}),h('p',{role:'status',text:'Starting extension…'}));
  counts.set(id,0);frames.set(id,frame);pluginRows.set(id,row);pluginArea.append(row);document.body.append(frame);enabled.add(id);persist();
 }
 const listener=(event:MessageEvent)=>{
  const found=[...frames].find(([,f])=>f.contentWindow===event.source);if(!found||!event.data||event.data.anfPlugin!==1)return;
  const [id,frame]=found,row=pluginRows.get(id)!;const d=event.data;
  const count=(counts.get(id)||0)+1;counts.set(id,count);if(count>500){stop(id);report('An extension exceeded its message limit and was disabled.');render();return;}
  if(d.type==='loaded'){row.querySelector('p')!.textContent='Extension enabled.';frame.contentWindow?.postMessage({anfHost:1,type:'ready'},'*');}
  else if(d.type==='log'||d.type==='error'){if(typeof d.message==='string')row.querySelector('p')!.textContent=d.message.slice(0,500);}
  else if(d.type==='register'&&row.querySelectorAll('button').length<16&&typeof d.key==='string'&&/^[0-9]{1,3}$/.test(d.key)&&typeof d.title==='string'){
   row.append(h('button',{text:String(d.icon||'').slice(0,8)+' '+d.title.slice(0,80),onclick:()=>frame.contentWindow?.postMessage({anfHost:1,type:'action',key:d.key},'*')}));
  }
 };
 window.addEventListener('message',listener);
 async function install(m:AddonManifest){
  let content:string;
  const local=builtin.find(b=>b.id===m.id&&b.sha256===m.sha256);
  if(local)content=contents[m.id];else{if(!m.downloadUrl)throw Error('No download URL.');content=await invoke<string>('fetch_addon_resource',{url:m.downloadUrl});}
  if(m.type==='theme')themeStyle(content);
  await invoke('save_addon',{addonType:m.type==='theme'?'themes':'plugins',id:m.id,manifestJson:JSON.stringify(m),content,entryFile:m.entry});
  await load();
  if(m.type==='theme')await applyTheme(m.id);else {stop(m.id);await runPlugin(m.id);}
  message.textContent=m.name+' installed and enabled.';
 }
 function render(){
  const available=new Map(items.map(m=>[m.id,m]));for(const [id,m]of installed)if(!available.has(id))available.set(id,m);
  grid.replaceChildren(...[...available.values()].map(m=>{
   const saved=installed.get(m.id),active=m.type==='theme'?localStorage.getItem('anf_active_theme')===m.id:frames.has(m.id);
   const card=h('article',{},h('h3',{text:m.name}),h('small',{text:m.type+' · '+m.version+' · '+m.author}),h('p',{text:m.description}));
   if(!saved||saved.sha256!==m.sha256)card.append(h('button',{disabled:pending,text:saved?'Install update':'Install',onclick:()=>void work(()=>install(m))}));
   if(saved)card.append(h('button',{disabled:pending,text:active?(m.type==='theme'?'Applied':'Disable'):'Enable',onclick:()=>void work(async()=>{if(m.type==='theme'){await applyTheme(m.id);}else if(active)stop(m.id);else await runPlugin(m.id);})}));
   return card;
  }));
 }
 const open=h('button',{text:'Themes & extensions',onclick:()=>{dialog.showModal();void work(async()=>{await load();message.textContent='Included samples work offline. Refresh to check the published catalog.';});}});
 const ready=(async()=>{await load();const theme=localStorage.getItem('anf_active_theme');if(theme&&installed.get(theme)?.type==='theme'){try{await applyTheme(theme);}catch(e){localStorage.removeItem('anf_active_theme');report('Could not restore theme: '+String(e));}}for(const id of [...enabled]){if(installed.get(id)?.type==='plugin'){try{await runPlugin(id);}catch(e){stop(id);report('Could not restore extension: '+String(e));}}else enabled.delete(id);}persist();render();})().catch(e=>{report('Add-ons could not restore: '+String(e));});
 window.addEventListener('pagehide',()=>{window.removeEventListener('message',listener);for(const frame of frames.values())frame.remove();},{once:true});
 return {open,pluginArea,ready};
}
