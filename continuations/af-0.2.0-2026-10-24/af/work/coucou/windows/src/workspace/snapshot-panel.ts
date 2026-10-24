import {h} from '../views/dom';
export type SavedVersion={seq:number;updated:number};
export function snapshotPanel(a:{allowed:()=>boolean;list:()=>Promise<{owner:string;title:string;versions:SavedVersion[]}>;restore:(owner:string,seq:number)=>Promise<void>}){
 const list=h('div'),notice=h('p',{role:'status'});let busy=false;
 async function run(action:()=>Promise<void>){if(busy||!a.allowed())return;busy=true;try{await action();}catch(e){notice.textContent=String(e).replace(/^Error: /,'');}finally{busy=false;}}
 const refresh=h('button',{type:'button',text:'Show saved snapshots',onclick:()=>void run(async()=>{list.replaceChildren();notice.textContent='Loading saved snapshots…';const {owner,title,versions}=await a.list();list.replaceChildren(...versions.map(v=>h('button',{type:'button',text:'Restore copy · '+new Date(v.updated).toLocaleString(),onclick:()=>void run(async()=>{await a.restore(owner,v.seq);notice.textContent='A separate restored conversation is saved in History. Your current conversation is unchanged.';})})));notice.textContent=versions.length?`${versions.length} snapshots for ${title}.`:'No encrypted snapshots yet.';})});
 return h('details',{},h('summary',{text:'Conversation snapshots'}),h('p',{text:'Encrypted storage retains up to 20 checkpoints per conversation, grouping saves within each minute. Restore creates a separate copy, preserving current work. Export a backup for longer-term recovery.'}),refresh,list,notice);
}
