import {invoke} from '@tauri-apps/api/core';
import {h} from '../views/dom';
import type {Service,View} from './connections';
import type {ManagedGatewayStatus} from './managed-gateway';

export function createToolHub(a:{allowed:()=>boolean;connect:(service:Service)=>void;writing:()=>void;skill:()=>void;local:(service:Service)=>void;managed:()=>void}){
 const statuses=new Map<Service,HTMLElement>();
 const managedState=h('p',{class:'hint',role:'status',text:'Checking managed local gateway…'});
 const manage=h('button',{type:'button',text:'Set up local gateway',onclick:()=>{if(a.allowed())a.connect('gateway');}});
 const managedFeedback=h('p',{class:'hint',role:'status'});
 let selecting=false;
 const useManaged=h('button',{type:'button',text:'Use managed local AI',onclick:()=>{if(selecting||!a.allowed())return;selecting=true;useManaged.disabled=true;managedFeedback.textContent='';void invoke('omniroute_use').then(()=>a.managed()).catch(error=>{managedFeedback.textContent=String(error).replace(/^Error: /,'');}).finally(()=>{selecting=false;void refresh();});}});
 useManaged.hidden=true;
 const managedPanel=h('section',{'aria-label':'Managed local AI'},managedState,h('div',{class:'row'},manage,useManaged),managedFeedback);
 const cards=h('div',{class:'tool-hub-grid'}),notice=h('p',{class:'hint',role:'status'});
 const definitions:Array<{id:Service|'writing'|'skill';title:string;description:string}>=[
  {id:'notebook',title:'Research notebook',description:'Read, highlight and prepare a cited research brief using local AI. Open Notebook sync is optional.'},
  {id:'writing',title:'Writing review',description:'Review clarity and unsupported language while preserving your voice.'},
  {id:'skill',title:'Books → skills',description:'Prepare a skill draft, then export reviewed writing with source references.'},
  {id:'gateway',title:'AI chat',description:'Use the bundled offline model without an account. Use optional managed OmniRoute locally, or configure your own external gateway.'},
  {id:'media',title:'Creative media',description:'Make a scene storyboard offline and export SVG. Online image and video generation is optional.'},
  {id:'cal',title:'Scheduling',description:'Plan locally and export calendar events. Cal.diy booking pages are optional.'},
  {id:'nextcloud',title:'Backups',description:'Save and restore encrypted local backups. Nextcloud transfer is optional.'},
  {id:'n8n',title:'Workflows',description:'Use local study, writing and review checklists. Connect n8n for online webhooks when needed.'},
 ];
 for(const def of definitions){
  const builtin=def.id==='writing'||def.id==='skill';
  const state=h('p',{class:'tool-state',text:'Local · no API key'});
  const connectionState=h('span',{class:'hint'});if(!builtin)statuses.set(def.id as Service,connectionState);
  cards.append(h('article',{'data-tool':def.id},h('h3',{text:def.title}),state,h('p',{text:def.description}),h('button',{type:'button',text:'Open tool','aria-label':'Open '+def.title,onclick:()=>{
   if(!a.allowed())return;
   if(def.id==='writing')a.writing();else if(def.id==='skill')a.skill();else a.local(def.id);
  }}),...(def.id==='gateway'?[managedPanel]:[]),...(!builtin?[h('details',{},h('summary',{text:def.id==='gateway'?'External gateway connection':'Optional online connection'}),connectionState,h('button',{type:'button',text:'Set up or open','aria-label':'Set up or open '+(def.id==='notebook'?'Open Notebook':def.title),onclick:()=>{if(a.allowed())a.connect(def.id as Service);}}))]:[])));
 }
 let epoch=0;
 async function refresh(){
  const request=++epoch;
  const [connections,gateway]=await Promise.allSettled([invoke<View[]>('connection_list'),invoke<ManagedGatewayStatus>('omniroute_status')]);
  if(request!==epoch)return;
  for(const [id,state] of statuses){const item=connections.status==='fulfilled'?connections.value.find(c=>c.service===id):undefined;state.textContent=connections.status==='rejected'?'Connection setup status unavailable':item?(item.enabled?'Enabled · setup saved':'Disabled · setup saved'):'External connection not configured';}
  useManaged.hidden=true;
  if(gateway.status==='fulfilled'){
   const value=gateway.value;
   managedState.textContent=(value.running?'Running locally':value.installed?'Installed · stopped':'Optional component not installed')+' · OmniRoute '+value.version+(value.error?' · '+value.error:'');
   manage.textContent=value.installed?'Manage local gateway':'Set up local gateway';
   useManaged.hidden=!value.running;useManaged.disabled=selecting;
  }else{managedState.textContent='Managed local gateway status unavailable. Open settings to inspect it.';manage.textContent='Check local gateway';}
  notice.textContent='Status checks do not start a gateway or select a provider. External service availability is checked when you open or test its connection.';
 }
 const root=h('section',{class:'tool-hub','aria-label':'Research, learning and connected tools'},h('div',{class:'tool-hub-heading'},h('h2',{text:'Research, learning & connected tools'}),h('button',{type:'button',text:'Refresh setup status',onclick:()=>void refresh()})),
  h('p',{class:'hint',text:'Start locally without an API key. Expand an optional online connection when you want to use your own service; provider accounts and charges may apply.'}),cards,notice);
 return{root,refresh};
}
