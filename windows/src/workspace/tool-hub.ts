import {invoke} from '@tauri-apps/api/core';
import {h} from '../views/dom';
import type {Service,View} from './connections';

export function createToolHub(a:{allowed:()=>boolean;connect:(service:Service)=>void;writing:()=>void;skill:()=>void;local:(service:Service)=>void}){
 const statuses=new Map<Service,HTMLElement>();
 const cards=h('div',{class:'tool-hub-grid'}),notice=h('p',{class:'hint',role:'status'});
 const definitions:Array<{id:Service|'writing'|'skill';title:string;description:string}>=[
  {id:'notebook',title:'Research notebook',description:'Read, highlight and prepare a cited research brief using local AI. Open Notebook sync is optional.'},
  {id:'writing',title:'Writing review',description:'Review clarity and unsupported language while preserving your voice.'},
  {id:'skill',title:'Books → skills',description:'Prepare a skill draft, then export reviewed writing with source references.'},
  {id:'gateway',title:'AI chat',description:'Use the bundled offline model without an account. Connect OmniRoute only when you choose online AI.'},
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
  }}),...(!builtin?[h('details',{},h('summary',{text:'Optional online connection'}),connectionState,h('button',{type:'button',text:'Set up or open','aria-label':'Set up or open '+(def.id==='notebook'?'Open Notebook':def.title),onclick:()=>{if(a.allowed())a.connect(def.id as Service);}}))]:[])));
 }
 let epoch=0;
 async function refresh(){
  const request=++epoch;
  try{
   const saved=await invoke<View[]>('connection_list');if(request!==epoch)return;
   for(const [id,state] of statuses){const item=saved.find(c=>c.service===id);state.textContent=item?(item.enabled?'Enabled · setup saved':'Disabled · setup saved'):'Online connection not configured';}
   notice.textContent='Local tools work independently. Online availability is checked only when you open or test a connection.';
  }catch{if(request===epoch){for(const state of statuses.values())state.textContent='Setup status unavailable';notice.textContent='Open a tool to inspect its connection settings.';}}
 }
 const root=h('section',{class:'tool-hub','aria-label':'Research, learning and connected tools'},h('div',{class:'tool-hub-heading'},h('h2',{text:'Research, learning & connected tools'}),h('button',{type:'button',text:'Refresh setup status',onclick:()=>void refresh()})),
  h('p',{class:'hint',text:'Start locally without an API key. Expand an optional online connection when you want to use your own service; provider accounts and charges may apply.'}),cards,notice);
 return{root,refresh};
}
