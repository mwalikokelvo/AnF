import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {h} from '../views/dom';
import {createNativeMusicPlayer} from './native-music-player';

export async function attachDesktopSpotube(root:HTMLElement,beforePlay:()=>void|Promise<void>,notify:(text:string)=>void,showMusic:()=>void) {
  if (!await invoke<boolean>('music_available').catch(()=>false)) return;
  const heading = root.querySelector<HTMLElement>('.music-heading')!;
  const localHeading=heading.firstElementChild as HTMLElement;
  const localContent = Array.from(root.children).filter(child=>child!==heading) as HTMLElement[];
  const host = h('div',{class:'spotube-host',hidden:true,'aria-label':'Embedded Spotube'});
  const stateLabel=h('span',{role:'status',text:'Choose a track'});
  const retry=h('button',{text:'Retry playback',type:'button',hidden:true,onclick:()=>void invoke('music_control',{operation:'retry'}).then(()=>player.refresh()).catch(error=>notify(String(error)))});
  const connection=h('div',{class:'spotube-connection',hidden:true},stateLabel,retry);
  const localButton = h('button',{type:'button',text:'Local library','aria-pressed':'true',onclick:()=>void showLocal()});
  const openButton = h('button',{type:'button',text:'Open Spotube','aria-pressed':'false',onclick:()=>void player.open()});
  heading.append(h('div',{class:'music-source-switch','aria-label':'Music source'},localButton,openButton));
  root.append(connection,host);
  let active = false, enteredMusic = false, preferLocal = false;
  try{preferLocal=localStorage.getItem('anf-music-source')==='local';}catch{}
  const previousHidden = new Map<HTMLElement,boolean>();
  const select = (native:boolean) => {
    if(native && !active)for(const child of localContent)previousHidden.set(child,child.hidden);
    active = native; host.hidden = !native;
    connection.hidden=!native;
    localHeading.hidden=native;
    const monogram=heading.querySelector<HTMLElement>('.music-monogram');if(monogram)monogram.hidden=native;
    const search=heading.querySelector<HTMLElement>('.music-search');if(search)search.hidden=native;
    for (const child of localContent) if(native)child.hidden=true;else if(previousHidden.has(child))child.hidden=previousHidden.get(child)!;
    localButton.setAttribute('aria-pressed',String(!native));
    openButton.setAttribute('aria-pressed',String(native));
  };
  const bounds = () => {
    const rect = host.getBoundingClientRect(), scale = devicePixelRatio;
    const footer = document.querySelector('.activity-bar')?.getBoundingClientRect().top ?? innerHeight;
    const dockRect = document.querySelector('.native-music-player:not([hidden])')?.getBoundingClientRect();
    const dock=dockRect?.height?dockRect.top:innerHeight;
    const bottom = Math.min(footer,dock,innerHeight)-12;
    return {x:Math.round(rect.left*scale),y:Math.round(rect.top*scale),width:Math.max(1,Math.round(rect.width*scale)),height:Math.max(1,Math.round((bottom-Math.max(0,rect.top))*scale))};
  };
  // Serialize visibility changes so a late SHOW cannot cover another section.
  let pending = Promise.resolve();
  const update = () => {
    pending = pending.catch(()=>{}).then(async()=>{
      const modal=document.querySelector('[role="dialog"]:not([hidden]),dialog[open]');
      const visible=active && document.body.classList.contains('music-view') && !document.hidden && !modal;
      document.body.classList.toggle('spotube-visible',!!visible);
      if (visible) {
        const rect = host.getBoundingClientRect();
        if (rect.top<0 || rect.top>=innerHeight-60 || rect.width<1) await invoke('music_hide');
        else await invoke('music_open',{bounds:bounds()});
      } else await invoke('music_hide');
    });
    return pending;
  };
  async function showLocal() { preferLocal=true;try{localStorage.setItem('anf-music-source','local');}catch{}player.suspend();select(false);try{await update();await invoke('music_control',{operation:'pause'});}catch(error){notify(String(error));} }
  const player = createNativeMusicPlayer({
    request:operation=>invoke('music_control',{operation}),beforePlay,notify,
    onState:(phase,error)=>{stateLabel.textContent=error||phase;retry.hidden=!error;connection.dataset.playbackState=error?'failed':phase;},
    open:async()=>{
      preferLocal=false;try{localStorage.setItem('anf-music-source','spotube');}catch{}enteredMusic=true;showMusic();select(true);stateLabel.textContent='Connecting to Spotube…';host.textContent='Connecting to Spotube…';host.setAttribute('aria-busy','true');
      try{
        await update();
        // SHOW only writes to the pipe. Wait for Dart's ready handshake so a
        // failed startup returns to the local library instead of a blank host.
        const state=await invoke('music_control',{operation:'status'});
        if(!state)throw Error('Embedded music did not finish starting. Try Open Spotube again.');
        await syncTheme();
        host.textContent='';
        notify('Spotube ready.');
      }catch(error){select(false);await update().catch(()=>{});throw error;}
      finally{host.removeAttribute('aria-busy');}
    },
  });
  async function syncTheme(){if(!active)return;const root=document.getElementById('workspace-root');const configured=root?.getAttribute('data-theme')||'system';const scheme=root?getComputedStyle(root).colorScheme:'dark';const theme=configured==='system'?(scheme.includes('light')?'light':'dark'):configured;await invoke('music_control',{operation:theme==='light'?'light':'dark'});}
  document.addEventListener('anf-appearance-changed',()=>void syncTheme().catch(()=>{}));
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>void syncTheme().catch(()=>{}));
  await listen('spotube-closed',()=>{select(false);void update().catch(()=>{});void player.refresh();});
  const changed=()=>{void update().catch(error=>{select(false);notify(String(error));});};
  const viewChanged=()=>{const music=document.body.classList.contains('music-view');const entering=music&&!enteredMusic;enteredMusic=music;if(entering&&!preferLocal&&!active){void player.open();return;}changed();};
  document.addEventListener('anf-view-changed',viewChanged);
  window.addEventListener('resize',changed);
  document.addEventListener('visibilitychange',changed);
  document.querySelector('.panel-host')?.addEventListener('scroll',changed,{passive:true});
  new ResizeObserver(changed).observe(host);
  new MutationObserver(changed).observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden','open']});
  viewChanged();
  return {...player,suspend:async()=>{player.suspend();select(false);await update();}};
}
