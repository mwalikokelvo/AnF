// Settings > Offline models. Nothing is downloaded until a button is pressed. The download runs in Rust,
// which owns the URLs and SHA-256 hashes; a model shows "Ready" only after Rust verified its hash.
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {h} from '../views/dom';
import {createLocalAiManager,describeInstall,OFFICIAL_PROFILES,type DownloadEvent,type ModelStatus} from './local-ai-manager';

export function offlineModelsPanel(){
 const manager=createLocalAiManager({
  invokeFn:(cmd,args)=>invoke(cmd,args),
  listenFn:async(event,handler)=>listen<DownloadEvent>(event,e=>handler(e.payload)),
 });
 const profiles=OFFICIAL_PROFILES.filter(p=>p.downloadStatus==='available');
 let statuses:ModelStatus[]=[];
 const live=new Map<string,DownloadEvent>();
 const rows=profiles.map(p=>{
  const state=h('p',{role:'status',class:'hint'});
  const start=h('button',{type:'button','data-keep-enabled':true,class:'primary',text:'Download'}) as HTMLButtonElement;
  const stop=h('button',{type:'button','data-keep-enabled':true,text:'Cancel',hidden:true}) as HTMLButtonElement;
  const render=()=>{
   const ev=live.get(p.id);
   const st=statuses.find(s=>s.id===p.id);
   state.textContent=describeInstall(p,st,ev);
   const busy=ev?(ev.phase==='downloading'||ev.phase==='verifying'):!!st?.downloading;
   start.disabled=busy||st?.state==='installed';
   start.textContent=st?.state==='partial'||ev?.phase==='cancelled'||ev?.phase==='failed'?'Resume download':'Download';
   stop.hidden=!busy;
  };
  start.onclick=async()=>{
   live.delete(p.id);
   statuses=statuses.map(s=>s.id===p.id?{...s,downloading:true}:s);render();
   try{await manager.downloadWeights(p.id,()=>{},e=>{live.set(p.id,e);render();});}
   catch{/* the failed/cancelled event already carries the reason */}
   finally{await refresh();}
  };
  stop.onclick=()=>{void manager.cancelDownload(p.id);};
  return {p,render,node:h('div',{},h('h4',{text:`${p.name} · ${p.quant}`}),h('p',{class:'hint',text:p.description}),state,h('div',{class:'row'},start,stop))};
 });
 async function refresh(){
  try{statuses=await manager.getInstallStatus();}catch{statuses=[];}
  for(const r of rows)r.render();
 }
 const panel=h('details',{},h('summary',{text:'Offline models'}),
  h('p',{class:'hint',text:'Downloads come only from huggingface.co, are checked against a pinned SHA-256 and are installed only if the check passes. A model shows Ready only after that check. Other listed models are not available yet.'}),
  ...rows.map(r=>r.node));
 panel.addEventListener('toggle',()=>{if((panel as HTMLDetailsElement).open)void refresh();});
 for(const r of rows)r.render();
 return panel;
}
