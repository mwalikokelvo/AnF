import {h, svg} from '../views/dom';
import {durationText} from './audio-data';
import './music-hub.css';

export type NativeMusicOperation = 'status' | 'play' | 'pause' | 'previous' | 'next' | 'retry';
export type NativeMusicState = {
  hasTrack:boolean; playing:boolean; title:string; artist:string; position:number; duration:number;
  buffering?:boolean; error?:string|null;
};
export function validateNativeMusicState(value:unknown):NativeMusicState|null {
  if (value == null) return null;
  const s = value as NativeMusicState;
  if (typeof s.hasTrack !== 'boolean' || typeof s.playing !== 'boolean' ||
      typeof s.title !== 'string' || s.title.length > 400 || typeof s.artist !== 'string' || s.artist.length > 400 ||
      !Number.isSafeInteger(s.position) || s.position < 0 || !Number.isSafeInteger(s.duration) || s.duration < 0 ||
      (s.buffering!==undefined&&typeof s.buffering!=='boolean') || (s.error!=null&&(typeof s.error!=='string'||s.error.length>400))) {
    throw Error('Invalid Spotube playback status.');
  }
  return s;
}

/** One native engine, with controls retained while navigating the AnF workspace. */
export function createNativeMusicPlayer(options:{
  request:(operation:NativeMusicOperation)=>Promise<unknown>;
  beforePlay:()=>void|Promise<void>;
  open:()=>Promise<void>;
  notify:(text:string)=>void;
  onState?:(phase:string,error:string)=>void;
}) {
  const title = h('strong'), artist = h('span'), elapsed = h('span'), total = h('span');
  const progress = h('progress', {max:1,value:0,'aria-label':'Spotube listening position'});
  const dock = h('aside', {class:'music-player native-music-player',hidden:true,'aria-label':'Spotube player'});
  const message = h('p',{class:'native-music-message',role:'status',hidden:true});
  const phase = h('span',{class:'native-music-phase',role:'status',text:'Paused'});
  const retry = h('button',{type:'button',text:'Retry playback',hidden:true,onclick:()=>void command('retry')});
  const recover = h('button',{type:'button',text:'Open Spotube',hidden:true,onclick:()=>void open()});
  let state:NativeMusicState|null = null, enabled = false, busy = false, disposed = false, epoch = 0;
  let timer:ReturnType<typeof setTimeout>|undefined;
  let loadingSince=0,lastTrack='',failure=false;
  let queuedOpen=false;
  function afterRequest(){busy=false;paint();if(queuedOpen&&!disposed){queuedOpen=false;void open();}else schedule();}
  const icons = {play:'m8 5 11 7-11 7Z',pause:'M8 5v14M16 5v14',previous:'M5 5v14M19 5 8 12l11 7Z',next:'M19 5v14M5 5l11 7L5 19Z',music:'M9 18V5l12-2v13M9 7l12-2M9 18c0 4-7 4-7 0s7-4 7 0Zm12-2c0 4-7 4-7 0s7-4 7 0Z'};
  const control = (label:string,operation:NativeMusicOperation,icon:keyof typeof icons) => h('button', {
    type:'button','aria-label':label,title:label,onclick:()=>void command(operation),
  },svg(icons[icon],20,{stroke:1.8}));
  const toggle = control('Play Spotube','play','play'); toggle.className = 'music-play';
  const previous = control('Previous Spotube track','previous','previous');
  const next = control('Next Spotube track','next','next');
  const info = h('button',{class:'music-now-info',type:'button','aria-label':'Open Spotube now playing',onclick:()=>void open()},title,artist);
  dock.append(h('div',{class:'music-now'},h('div',{class:'music-player-art'},svg(icons.music,28,{stroke:1.5})),info),
    h('div',{class:'music-transport'},h('div',{class:'music-controls'},previous,toggle,next),h('div',{class:'music-progress'},elapsed,progress,total)),
    h('div',{class:'native-music-source'},phase,h('span',{text:'Powered by Spotube'}),retry,recover),message);
  document.body.append(dock);
  function paint() {
    dock.hidden = !enabled || !state?.hasTrack;
    document.body.classList.toggle('has-native-music-player', !dock.hidden);
    title.textContent = state?.title || 'Spotube music'; artist.textContent = state?.artist || 'Powered by Spotube';
    const playing = state?.playing === true;
    const loading=!!state?.hasTrack&&playing&&(state.buffering===true||state.duration===0);
    if(state?.title!==lastTrack){loadingSince=0;lastTrack=state?.title||'';}
    if(loading){if(!loadingSince)loadingSince=Date.now();}else loadingSince=0;
    const advancing=playing&&!!state&&state.duration>0&&state.position>0;
    failure=(!!state?.error&&!advancing)||!!loadingSince&&Date.now()-loadingSince>30000;
    phase.textContent=failure?'Playback failed':loading?'Buffering…':playing?'Playing':'Paused';
    options.onState?.(state?.hasTrack?phase.textContent:'Choose a track',failure?(state?.error||'Audio has not started. Retry playback or check your provider.'):'');
    dock.dataset.playbackState=failure?'failed':loading?'buffering':playing?'playing':'paused';
    retry.hidden=recover.hidden=!failure;
    if(failure){message.dataset.engineError='true';message.textContent=state?.error||'Audio has not started. Retry playback or open Spotube to check your provider.';message.hidden=false;}
    else if(message.dataset.engineError){delete message.dataset.engineError;message.hidden=true;}
    toggle.setAttribute('aria-label',playing ? 'Pause Spotube' : 'Play Spotube');
    toggle.title = playing ? 'Pause Spotube' : 'Play Spotube';
    toggle.replaceChildren(svg(icons[playing ? 'pause' : 'play'],22,{stroke:1.8}));
    elapsed.textContent = durationText((state?.position || 0)/1000);
    total.textContent = durationText((state?.duration || 0)/1000);
    progress.max = state?.duration || 1; progress.value = Math.min(state?.position || 0,progress.max);
    for (const button of [previous,toggle,next]) button.disabled = busy;
  }
  function cancelTimer() { if (timer !== undefined) clearTimeout(timer); timer = undefined; }
  function report(error:unknown) {
    const text = String(error).replace(/^Error: /,'');
    message.textContent = text; message.hidden = false; options.notify(text);
  }
  function schedule() {
    cancelTimer();
    if (enabled && !document.hidden && !disposed) timer = setTimeout(()=>void refresh(),state?.playing ? 1500 : 4000);
  }
  async function refresh() {
    cancelTimer();
    if (!enabled || document.hidden || busy || disposed) { schedule(); return; }
    const token = epoch;
    busy = true;
    try {
      const value = validateNativeMusicState(await options.request('status'));
      if (token !== epoch || disposed) return;
      state = value;
      if (!value) enabled = false;
    } catch {
      if (token === epoch) { state = null; enabled = false; options.notify('Spotube stopped responding. Open Spotube to reconnect.'); }
    } finally { afterRequest(); }
  }
  async function command(operation:NativeMusicOperation) {
    if (busy || !state?.hasTrack || !enabled || disposed) return;
    cancelTimer(); busy = true; message.hidden = true; paint();
    const token = epoch;
    // Resolve the toggle at click time, using the most recently acknowledged state.
    const actual = operation === 'play' && state.playing ? 'pause' : operation;
    try {
      if (actual === 'play' || actual === 'previous' || actual === 'next' || actual==='retry') await options.beforePlay();
      if (token !== epoch || disposed) return;
      const value = validateNativeMusicState(await options.request(actual));
      if (token === epoch && !disposed) { state = value; if (!value) enabled = false; if(actual==='retry'){loadingSince=0;message.hidden=true;} }
    } catch(error) { if (token === epoch) report(error); }
    finally { afterRequest(); }
  }
  async function open() {
    if (disposed) return;
    if (busy) {queuedOpen=true;return;}
    cancelTimer(); busy = true; message.hidden = true; paint();
    const token = ++epoch;
    try { await options.beforePlay(); if (token !== epoch || disposed) return; await options.open(); if (token === epoch) enabled = true; }
    catch(error) { report(error); }
    finally { busy = false; paint(); if (enabled) void refresh(); }
  }
  function suspend() { ++epoch; queuedOpen=false;enabled = false; cancelTimer(); paint(); }
  const visible = () => { cancelTimer(); if (!document.hidden && enabled) void refresh(); };
  document.addEventListener('visibilitychange',visible);
  document.addEventListener('anf-view-changed',visible);
  window.addEventListener('pagehide',()=>{disposed=true;suspend();document.removeEventListener('visibilitychange',visible);document.removeEventListener('anf-view-changed',visible);});
  return {dock,open,suspend,refresh};
}
