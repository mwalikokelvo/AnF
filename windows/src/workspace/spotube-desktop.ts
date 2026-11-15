import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {h} from '../views/dom';
import {createNativeMusicPlayer} from './native-music-player';

export async function attachDesktopSpotube(root:HTMLElement,beforePlay:()=>void|Promise<void>,notify:(text:string)=>void,showMusic:()=>void) {
  if (!await invoke<boolean>('music_available').catch(()=>false)) return;
  let active = false, displayed = false;
  const bounds = () => {
    const rect = root.getBoundingClientRect(), scale = devicePixelRatio;
    const heading = root.querySelector('.music-heading')!.getBoundingClientRect();
    const footer = document.querySelector('.activity-bar')?.getBoundingClientRect().top ?? innerHeight;
    const dock = document.querySelector('.native-music-player:not([hidden])')?.getBoundingClientRect();
    const top = Math.max(0,rect.top,heading.bottom+12);
    const bottom = Math.min(innerHeight,footer,dock?.height?dock.top:innerHeight)-12;
    return {x:Math.round(rect.left*scale),y:Math.round(top*scale),width:Math.max(1,Math.round(rect.width*scale)),height:Math.max(1,Math.round((bottom-top)*scale))};
  };
  let pending = Promise.resolve();
  const update = () => {
    pending = pending.catch(()=>{}).then(async()=>{
      if (active && document.body.classList.contains('music-view') && !document.hidden) {
        displayed=true;await invoke('music_open',{bounds:bounds()});
      } else if(displayed) {
        await invoke('music_hide');displayed=false;
      }
    });
    return pending;
  };
  const changed = () => {void update().catch(error=>{active=false;select();notify(String(error));});};
  const player = createNativeMusicPlayer({
    request:operation=>invoke('music_control',{operation}),beforePlay,notify,
    open:async()=>{showMusic();active=true;select();try{await update();}catch(error){active=false;select();throw error;}},
  });
  const localButton=h('button',{type:'button',text:'Local library','aria-pressed':'true',onclick:()=>void showLocal()});
  const openButton=h('button',{type:'button',text:'Open Spotube','aria-pressed':'false',onclick:()=>void player.open()});
  function select(){localButton.setAttribute('aria-pressed',String(!active));openButton.setAttribute('aria-pressed',String(active));}
  async function showLocal(){player.suspend();active=false;select();try{await update();await invoke('music_control',{operation:'pause'});}catch(error){notify(String(error));}}
  root.querySelector('.music-heading')!.append(h('div',{class:'row','aria-label':'Music source'},localButton,openButton));
  // Playback status can reveal the dock without any window resize.
  const layout = new ResizeObserver(changed);
  for(const element of [root,root.querySelector('.music-heading')!,document.querySelector('.native-music-player')!])layout.observe(element);
  await listen('spotube-closed',()=>{active=false;select();changed();void player.refresh();});
  document.addEventListener('anf-view-changed',changed);
  window.addEventListener('resize',changed);
  document.addEventListener('visibilitychange',changed);
  return {...player,suspend:async()=>{player.suspend();active=false;select();await update();}};
}
