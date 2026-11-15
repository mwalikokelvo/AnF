import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {h} from '../views/dom';
import {createNativeMusicPlayer} from './native-music-player';

export async function attachDesktopSpotube(root:HTMLElement,beforePlay:()=>void|Promise<void>,notify:(text:string)=>void,showMusic:()=>void) {
  if (!await invoke<boolean>('music_available').catch(()=>false)) return;
  let active = false;
  const bounds = () => {
    const rect = root.getBoundingClientRect(), scale = devicePixelRatio;
    const heading = root.querySelector('.music-heading')!.getBoundingClientRect();
    const footer = document.querySelector('.activity-bar')?.getBoundingClientRect().top ?? innerHeight;
    const dock = document.querySelector('.native-music-player:not([hidden])')?.getBoundingClientRect();
    const top = Math.max(0,rect.top,heading.bottom+12);
    const bottom = Math.min(innerHeight,footer,dock?.height?dock.top:innerHeight)-12;
    return {x:Math.round(rect.left*scale),y:Math.round(top*scale),width:Math.max(1,Math.round(rect.width*scale)),height:Math.max(1,Math.round((bottom-top)*scale))};
  };
  const update = async () => {
    if (!active) return;
    try {
      if (document.body.classList.contains('music-view') && !document.hidden) await invoke('music_open',{bounds:bounds()});
      else await invoke('music_hide');
    } catch(error) { active = false; notify(String(error)); }
  };
  const player = createNativeMusicPlayer({
    request:operation=>invoke('music_control',{operation}),beforePlay,notify,
    open:async()=>{showMusic();active=true;await invoke('music_open',{bounds:bounds()});},
  });
  root.querySelector('.music-heading')!.append(h('button',{type:'button',text:'Open Spotube',onclick:()=>void player.open()}));
  // Playback status can reveal the dock without any window resize.
  const layout = new ResizeObserver(()=>void update());
  for(const element of [root,root.querySelector('.music-heading')!,document.querySelector('.native-music-player')!])layout.observe(element);
  await listen('spotube-closed',()=>{active=false;void player.refresh();});
  document.addEventListener('anf-view-changed',()=>void update());
  window.addEventListener('resize',()=>void update());
  document.addEventListener('visibilitychange',()=>void update());
  return {...player,suspend:async()=>{player.suspend();active=false;await invoke('music_hide');}};
}
