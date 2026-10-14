import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {h} from '../views/dom';
import {createNativeMusicPlayer} from './native-music-player';

export async function attachDesktopSpotube(root:HTMLElement,beforePlay:()=>void|Promise<void>,notify:(text:string)=>void,showMusic:()=>void) {
  if (!await invoke<boolean>('music_available').catch(()=>false)) return;
  let active = false;
  const bounds = () => {
    const rect = root.getBoundingClientRect(), scale = devicePixelRatio;
    return {x:Math.round(rect.left*scale),y:Math.round(rect.top*scale),width:Math.max(1,Math.round(rect.width*scale)),height:Math.max(1,Math.round((innerHeight-rect.top-16)*scale))};
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
  await listen('spotube-closed',()=>{active=false;void player.refresh();});
  document.addEventListener('anf-view-changed',()=>void update());
  window.addEventListener('resize',()=>void update());
  document.addEventListener('visibilitychange',()=>void update());
  return {...player,suspend:async()=>{player.suspend();active=false;await invoke('music_hide');}};
}
