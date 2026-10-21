import {invoke} from '@tauri-apps/api/core';
import {h} from '../views/dom';
export type ManagedGatewayStatus={installed:boolean;repairable?:boolean;recoveryPending?:boolean;running:boolean;owned?:boolean;version:string;phase:string;done:number;total:number;error:string};
export function managedGateway(use:()=>void,notify:(message:string)=>void){
 const state=h('p',{role:'status',text:'Check the optional component to manage a local gateway.'});
 const file=h('input',{'aria-label':'OmniRoute component manifest',readonly:true,placeholder:'Choose component.json from the extracted optional component'});
 const progress=h('progress',{'aria-label':'OmniRoute component progress',max:1,value:0});
 const root=h('section',{'aria-label':'Managed OmniRoute'},h('h4',{text:'Managed local gateway',tabindex:-1}),
  h('p',{text:'Optional Windows component with its own Node runtime. Import the reviewed component folder, then start or stop it here. No global Node installation or provider account is needed. It routes only to AnF’s existing local Fast model; external gateway settings stay separate.'}),file,progress,state);
 let busy=false,current:ManagedGatewayStatus|undefined,timer:ReturnType<typeof setInterval>|undefined;
 const button=(label:string,run:()=>Promise<void>)=>h('button',{type:'button',text:label,onclick:()=>void action(run)});
 function paint(value:ManagedGatewayStatus){
  const owned=value.owned??value.running;
  current=value;root.setAttribute('aria-busy',String(busy));progress.max=Math.max(1,value.total);
  if(value.total>0)progress.value=Math.min(value.total,Math.max(0,value.done));else progress.removeAttribute('value');
  progress.hidden=!busy;
  state.textContent=`${busy?'Working':value.running?'Running':owned?'Not ready · stop to reset':value.installed?'Installed · stopped':'Component not installed'} · OmniRoute ${value.version}${value.phase?' · '+value.phase:''}${busy&&value.total?' · '+Math.min(100,Math.round(value.done/value.total*100))+'%':''}${value.error?' · '+value.error:''}`;
  const repairable=value.repairable??value.installed;
  file.hidden=owned;choose.hidden=owned||busy;install.hidden=repairable||owned||busy;repair.hidden=!repairable||owned||busy;repair.disabled=busy||!file.value;
  if(value.recoveryPending)state.textContent+=' · Recovery pending; start or repair while stopped';
  start.hidden=!(value.installed||value.recoveryPending)||owned||busy;stop.hidden=!owned||busy;cancel.hidden=!busy;
  useButton.hidden=!value.running||busy;check.hidden=busy;
  choose.disabled=busy;install.disabled=busy||!file.value||value.installed;start.disabled=busy||!(value.installed||value.recoveryPending)||owned;
  stop.disabled=!owned;cancel.disabled=!busy;useButton.disabled=busy||!value.running;
 }

 async function refresh(){try{paint(await invoke<ManagedGatewayStatus>('omniroute_status'));}catch(error){state.textContent=String(error).replace(/^Error: /,'');}}
 async function action(run:()=>Promise<void>){if(busy)return;busy=true;if(current)paint(current);timer=setInterval(()=>void refresh(),500);try{await run();}catch(error){notify(String(error).replace(/^Error: /,''));}finally{busy=false;if(timer)clearInterval(timer);timer=undefined;await refresh();}}
 const choose=button('Choose OmniRoute component',async()=>{const selected=await invoke<string|null>('omniroute_pick_component');if(selected)file.value=selected;});
 const install=button('Install optional component',async()=>{await invoke('omniroute_install',{manifest:file.value});notify('Optional gateway component installed. Choose Start managed gateway when ready.');});
 const repair=button('Repair installed component',async()=>{await invoke('omniroute_repair',{manifest:file.value});notify('Reviewed component repaired. Choose Start managed gateway when ready.');});
 const start=button('Start managed gateway',async()=>{await invoke('omniroute_start');notify('Managed local gateway started. External connections were not changed.');});
 const stop=h('button',{type:'button',text:'Stop managed gateway',onclick:()=>void invoke('omniroute_stop').then(refresh).catch(e=>notify(String(e)))});
 const cancel=h('button',{type:'button',text:'Cancel gateway operation',onclick:()=>void invoke('omniroute_cancel').then(refresh).catch(e=>notify(String(e)))});
 const useButton=button('Use managed local AI in Chat',async()=>{await invoke('omniroute_use');use();});
 const check=button('Refresh managed gateway status',refresh);
 root.append(h('div',{class:'row'},choose,install,repair,start,stop,cancel,useButton,check),h('p',{class:'hint',text:'Download and extract the separate optional component when it is provided with your release, then select its component.json. For a damaged installation, stop the gateway, choose that extracted component and select Repair installed component. AnF verifies every imported file and never downloads an unconfigured component URL. Stop ends only AnF-owned gateway processes; the service also stops when AnF exits. Cancellation waits for safe repair recovery and cleanup before finishing. Cancelling or stopping never switches to a cloud provider.'}));
 paint({installed:false,running:false,version:"3.8.51",phase:"Checking status",done:0,total:0,error:""});void refresh();return root;
}
