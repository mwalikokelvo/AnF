// Settings > Updates. One button; nothing is checked, downloaded or installed until it is pressed.
import {invoke} from '@tauri-apps/api/core';
import {h} from '../views/dom';
export type UpdateInfo={current:string;latest:string|null;url:string|null;newer:boolean};
/** What to tell the person; kept apart from the DOM so it can be tested. */
export function updateMessage(i:UpdateInfo):string{
 if(!i.latest)return `You have ${i.current}. No Windows release has been published yet.`;
 return i.newer?`Version ${i.latest} is available. You have ${i.current}.`:`You have ${i.current}, the latest published version.`;
}
export function updatesPanel(){
 const status=h('p',{role:'status',class:'hint',text:'Checks GitHub for a newer Windows release only when you press the button. Nothing is downloaded or installed for you.'});
 const open=h('button',{type:'button','data-keep-enabled':true,text:'Open download page',hidden:true}) as HTMLButtonElement;
 const check=h('button',{type:'button','data-keep-enabled':true,class:'primary',text:'Check for updates'}) as HTMLButtonElement;
 let url:string|null=null;
 open.onclick=()=>{if(url)void invoke('open_url',{url});};
 check.onclick=async()=>{
  check.disabled=true;open.hidden=true;status.textContent='Checking…';
  try{const info=await invoke<UpdateInfo>('update_check');status.textContent=updateMessage(info);url=info.newer?info.url:null;open.hidden=!url;}
  catch(e){status.textContent=String(e);}
  finally{check.disabled=false;}
 };
 return h('details',{},h('summary',{text:'Updates'}),status,h('div',{class:'row'},check,open));
}
