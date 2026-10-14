import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {h} from '../views/dom';
export async function attachDesktopSpotube(root:HTMLElement,beforeOpen:()=>void,notify:(text:string)=>void){
 if(!await invoke<boolean>('music_available').catch(()=>false))return;
 let active=false;
 const bounds=()=>{const rect=root.getBoundingClientRect(),scale=devicePixelRatio;return{x:Math.round(rect.left*scale),y:Math.round(rect.top*scale),width:Math.max(1,Math.round(rect.width*scale)),height:Math.max(1,Math.round((innerHeight-rect.top-16)*scale))};};
 const update=async()=>{if(!active)return;try{if(document.body.classList.contains('music-view')&&!document.hidden)await invoke('music_open',{bounds:bounds()});else await invoke('music_hide');}catch(e){active=false;notify(String(e));}};
 const open=h('button',{type:'button',text:'Open Spotube',onclick:()=>{beforeOpen();active=true;void update();}});
 root.querySelector('.music-heading')!.append(open);
 await listen('spotube-closed',()=>{active=false;});
 document.addEventListener('anf-view-changed',()=>void update());window.addEventListener('resize',()=>void update());document.addEventListener('visibilitychange',()=>void update());
}
