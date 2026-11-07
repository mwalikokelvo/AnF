import {h,svg} from '../views/dom';
import {audioLibrary,type AudioTrack,type AudioPlaylist} from './audio-library';
import {readAudioMetadata,formatBadge} from './audio-metadata';
import {durationText} from './audio-data';
import {
  nextTrack,
  previousTrack,
  shuffled,
  reconcileQueue,
  enqueueTrack,
  playNextTrack,
  playPreviousTrack,
  removeTrack,
  type RepeatMode
} from './audio-queue';
import {kindFromFile,kindLabel} from './media-kinds';
import {
  fetchFeed,
  loadFeeds,
  saveFeeds,
  substackFeedUrl,
  updateEpisodePosition,
  markEpisodePlayed,
  downloadPodcastEnclosure,
  removeDownloadedPodcast,
  type PodcastFeed,
  type PodcastEpisode
} from './podcast-feeds';
import {parseLyrics,activeLine,matchLyricsTrack,type Lyrics} from './lyrics';
import {chapterEndAt,chapterSleepStep} from './sleep-timer';
import {fetchOnlineLyrics} from './lyrics-provider';
import {cssUrl,onlineLookupsEnabled,safeHttpsUrl,setOnlineLookups,ONLINE_LOOKUPS_OFF} from './online-lookups';
import {hasSafeFetch,safeFetchImage} from './safe-fetch';
import {resolveCoverSrc} from './cover-src';
import {echoDna} from './echo-music-dna';
import {handOffLockScreen,lockScreenPlan,nativeBridgeId} from './lock-screen';
import {rankMusicFlowCandidates,filterMusicFlowCandidates,audioTrackToFlowItem,type MusicFlowItem} from './music-flow';
import {
  streamService,
  cacheStreamTrack,
  findBrokenStreamEntries,
  pruneIdsFromPlaylistOrders,
  searchMultiSource,
  resolveDirectUrl,
  resolveBatchUrl,
  queueWithArchiveParts,
  describeStreamError,
  unresolvedStreamError,
  verifyAudioUrl,
  isAudioContentType,
  shouldResolveCatalogueTrack,
  type StreamTrackMetadata
} from './streaming-provider';
import {
  audioDsp,
  ensurePreservesPitch,
  createEqDialog,
  EQ_PRESETS,
  type EqPresetName
} from './audio-dsp';
import { askConfirm, askText } from './music-dialogs';
import './music-hub.css';

// Listening data helpers embedded for local offline tracking
export type MediaKind='music'|'podcast'|'audiobook';
export type ListeningState={positions:Record<string,number>;seconds:Record<string,number>;rate:number};
export function listeningState(value:unknown):ListeningState{
 const raw=value&&typeof value==='object'?value as Partial<ListeningState>:{};
 const numbers=(input:unknown,max:number)=>Object.fromEntries(
  input&&typeof input==='object'
   ?Object.entries(input).filter(([key,n])=>key.length<180&&typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=max).slice(-10000)
   :[]
 );
 return {positions:numbers(raw.positions,604800),seconds:numbers(raw.seconds,31622400),rate:[.75,1,1.25,1.5,1.75,2].includes(raw.rate!)?raw.rate!:1};
}
export function heardSeconds(wall:number,media:number,rate:number):number{
 return wall>0&&wall<=3&&media>0&&Math.abs(media-wall*rate)<.5?Math.min(wall,media/rate):0;
}
export function recordListening(state:ListeningState,id:string,seconds:number,date=new Date()):void{
 if(!id||id.length>100||!Number.isFinite(seconds)||seconds<=0||seconds>3)return;
 const key=date.getFullYear()+'|'+id;
 state.seconds[key]=(state.seconds[key]||0)+seconds;
 const keys=Object.keys(state.seconds);if(keys.length>10000)delete state.seconds[keys[0]];
}
export function localMix<T extends {id:string}>(tracks:T[],mode:string,favorites:string[],recent:string[]):T[]{
 if(mode==='liked')return tracks.filter(t=>favorites.includes(t.id));
 if(mode==='fresh')return tracks.filter(t=>!recent.includes(t.id));
 if(mode==='recent')return recent.map(id=>tracks.find(t=>t.id===id)).filter((t):t is T=>!!t);
 return tracks;
}
export type PlaylistRecipe={format:'anf-playlist-1';name:string;tracks:{title:string;artist:string;name:string}[]};
export function playlistRecipe(value:unknown):PlaylistRecipe{
 if(!value||typeof value!=='object')throw Error('Invalid playlist file.');
 const v=value as PlaylistRecipe;
 if(v.format!=='anf-playlist-1'||typeof v.name!=='string'||!v.name.trim()||v.name.length>80||!Array.isArray(v.tracks)||v.tracks.length>10000)throw Error('Unsupported playlist file.');
 const tracks=v.tracks.map(t=>{if(!t||[t.title,t.artist,t.name].some(s=>typeof s!=='string'||s.length>500))throw Error('Invalid playlist item.');return {title:t.title,artist:t.artist,name:t.name};});
 return {format:'anf-playlist-1',name:v.name,tracks};
}
export function matchPlaylist<T extends {id:string;title:string;artist:string;name:string}>(recipe:PlaylistRecipe,tracks:T[]):{order:string[];missing:number}{
 const key=(t:{title:string;artist:string;name:string})=>JSON.stringify([t.title,t.artist,t.name]);
 const index=new Map<string,string|null>();for(const t of tracks){const k=key(t);index.set(k,index.has(k)?null:t.id);}
 const order:string[]=[],seen=new Set<string>();let missing=0;
 for(const item of recipe.tracks){const id=index.get(key(item));if(id){if(!seen.has(id)){order.push(id);seen.add(id);}}else missing++;}
 return {order,missing};
}

export type PlaybackState = 'idle' | 'buffering' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';

export function trackBadge(t: AudioTrack | StreamTrackMetadata): { label: string; kind: 'youtube' | 'spotify' | 'audiobook' | 'local' | 'custom' } {
 const source = (t as StreamTrackMetadata).source;
 const id = t.id || '';
 if (source === 'youtube' || id.startsWith('yt:') || id.startsWith('stream:yt:') || (t as AudioTrack).format?.includes('youtube')) {
  return { label: 'YouTube', kind: 'youtube' };
 }
 if (source === 'audiobook' || id.startsWith('ia:') || id.startsWith('stream:ia:') || (t as AudioTrack).kind === 'audiobook') {
  return { label: 'Audiobook', kind: 'audiobook' };
 }
 if (source === 'spotify' || source === 'spotube' || id.startsWith('stream:') || (t as AudioTrack).streamUrl) {
  return { label: 'Spotify', kind: 'spotify' };
 }
 if (source === 'custom' || id.startsWith('custom:')) {
  return { label: 'Direct', kind: 'custom' };
 }
 return { label: 'Local', kind: 'local' };
}

export function createVisualizer(barCount = 12, className = 'music-visualizer'): HTMLElement {
 if (typeof document === 'undefined') {
  return { className, children: new Array(barCount).fill({ className: 'music-vis-bar' }), classList: { toggle: () => {} } } as any;
 }
 const wrapper = h('div', { class: className, 'aria-hidden': 'true' });
 for (let i = 0; i < barCount; i++) {
  wrapper.append(h('span', { class: 'music-vis-bar' }));
 }
 return wrapper;
}

const icons={play:'m8 5 11 7-11 7Z',pause:'M8 5v14M16 5v14',previous:'M5 5v14M19 5 8 12l11 7Z',next:'M19 5v14M5 5l11 7L5 19Z',heart:'M12 20 3 11C-2 3 8-1 12 6c4-7 14-3 9 5Z',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6',music:'M9 18V5l12-2v13M9 7l12-2M9 18c0 4-7 4-7 0s7-4 7 0Zm12-2c0 4-7 4-7 0s7-4 7 0Z',queue:'M3 5h18M3 11h18M3 17h12',shuffle:'M3 5h3l12 14h3M18 16l3 3-3 3M3 19h3l4-5M14 9l4-4h3M18 2l3 3-3 3',repeat:'M20 8V5H7a4 4 0 0 0-4 4M4 16v3h13a4 4 0 0 0 4-4M17 5l3 3 3-3M7 19l-3-3-3 3',eq:'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',chevronRight:'M9 18l6-6-6-6',chevronLeft:'M15 18l-6-6 6-6',mic:'M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zm-7 9a7 7 0 0 0 14 0h-2a5 5 0 0 1-10 0H5zm6 8v3H9v2h6v-2h-2v-3a7.002 7.002 0 0 0 6-6.9v-.1h-2v.1a5 5 0 0 1-5 5 5 5 0 0 1-5-5v-.1H7v.1c0 3.53 2.61 6.43 6 6.9z',sliders:'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6'};
type Preferences={current?:string;position:number;volume:number;speed:number;recent:string[];favorites:string[];queue:string[];originalQueue:string[];shuffle:boolean;repeat:RepeatMode;sort:'newest'|'title'|'artist'|'longest'|'shortest'|'year'};

export function createMusicHub(options:{exportPlaylist?:(text:string)=>void|Promise<void>;notify:(text:string)=>void;beforePlay:()=>void|Promise<void>}){
 const library=audioLibrary(),audio=new Audio();audio.preload='metadata';
 audio.crossOrigin='anonymous';
 audioDsp.attachAudioElement(audio);
 ensurePreservesPitch(audio, true);
 const root=h('div',{class:'music-hub'}),content=h('div',{class:'music-content'}),notice=h('p',{class:'music-notice',role:'status'});
 const ambient=h('div',{class:'music-hub-ambient','aria-hidden':'true'});
 const search=h('input',{type:'search',placeholder:'Search songs, artists, albums or podcasts…','aria-label':'Search music'});
 const files=h('input',{type:'file',multiple:true,accept:'audio/*,.flac,.mp3,.m4a,.m4b,.ogg,.opus,.wav,.lrc','aria-label':'Import local music',hidden:true});
 const folder=h('input',{type:'file',multiple:true,webkitdirectory:'','aria-label':'Import music folder',hidden:true});
 let tracks:AudioTrack[]=[],playlists:AudioPlaylist[]=[],tab='music',feeds:PodcastFeed[]=loadFeeds(),selectedFeed:PodcastFeed|null=null,current:AudioTrack|undefined,queue:string[]=[],epoch=0,source='',cover='',pending=0,busy=false,lastSave=0,suspended=false,libraryLimit=80;
 let playbackState:PlaybackState='idle',playbackError:string|null=null;
 let streamingResults:StreamTrackMetadata[]=[],streamingQuery='',streamingBusy=false,streamingServiceTab:'all'|'youtube'|'spotify'|'audiobook'|'cached'='all',directUrlInput='';
 let prefs:Preferences={position:0,volume:.7,speed:1,recent:[],favorites:[],queue:[],originalQueue:[],shuffle:false,repeat:'off',sort:'newest'};
 try{const value=JSON.parse(localStorage.getItem('anf-music-player')||'null');if(value){prefs={current:typeof value.current==='string'?value.current:undefined,position:Number.isFinite(value.position)?Math.max(0,value.position):0,volume:Number.isFinite(value.volume)?Math.min(1,Math.max(0,value.volume)):.7,speed:[.75,1,1.25,1.5,1.75,2].includes(value.speed)?value.speed:1,recent:Array.isArray(value.recent)?value.recent.filter((s:unknown)=>typeof s==='string').slice(0,40):[],favorites:Array.isArray(value.favorites)?value.favorites.filter((s:unknown)=>typeof s==='string').slice(0,5000):[],queue:Array.isArray(value.queue)?value.queue.filter((s:unknown)=>typeof s==='string').slice(0,10000):[],originalQueue:Array.isArray(value.originalQueue)?value.originalQueue.filter((s:unknown)=>typeof s==='string').slice(0,10000):[],shuffle:value.shuffle===true,repeat:['off','track','all'].includes(value.repeat)?value.repeat:'off',sort:['newest','title','artist','longest','shortest','year'].includes(value.sort)?value.sort:'newest'};}}catch{/* Start with a valid empty preference record. */}
 let listening=listeningState(null),mix='all',lastWall=0,lastMedia=0;
 try{const raw=localStorage.getItem('anf-listening');if(raw){listening=listeningState(JSON.parse(raw));prefs.speed=listening.rate;}}catch{}
 
 function setPlaybackState(state:PlaybackState,error:string|null=null){
  playbackState=state;
  playbackError=error;
  paint();
 }

 function sample(){const now=performance.now();if(current&&!audio.paused&&!audio.seeking&&!audio.ended&&lastWall)recordListening(listening,current.id,heardSeconds((now-lastWall)/1000,audio.currentTime-lastMedia,audio.playbackRate));lastWall=now;lastMedia=audio.currentTime;}
 function resetClock(){lastWall=performance.now();lastMedia=audio.currentTime;}
 function saveListening(){if(current&&audio.readyState)listening.positions[current.id]=audio.currentTime;listening.rate=prefs.speed;try{localStorage.setItem('anf-listening',JSON.stringify(listening));}catch{report('Could not save listening history. Check device storage.');}}
 
 audio.volume=prefs.volume;
 audio.playbackRate=prefs.speed;

 function report(text:string){notice.textContent=text;}
 function run(fn:()=>void|Promise<void>){
  if(busy)return;
  try{
   const res=fn();
   if(res&&typeof (res as any).then==='function'){
    busy=true;
    root.setAttribute('aria-busy','true');
    (res as Promise<void>).catch(e=>report(String(e).replace(/^Error: /,''))).finally(()=>{
     busy=false;
     root.removeAttribute('aria-busy');
    });
   }
  }catch(e){
   report(String(e).replace(/^Error: /,''));
  }
 }
 const button=(label:string,fn:()=>void|Promise<void>,icon?:keyof typeof icons)=>{const b=h('button',{type:'button','aria-label':label,title:label,onclick:()=>void run(fn)});b.append(icon?svg(icons[icon],20,{stroke:1.6}):h('span',{text:label}));return b;};
 const tabs=h('div',{class:'music-tabs',role:'tablist','aria-label':'Music views'});

 const importKind=h('select',{'aria-label':'Import content as'},...['auto','music','podcast','audiobook'].map(value=>h('option',{value,text:value==='auto'?'Detect file type':value==='music'?'Music':value==='podcast'?'Podcast':'Audiobook'})));
 const mixes=h('select',{'aria-label':'Listening mix'},...['all','liked','fresh','recent'].map(value=>h('option',{value,text:value==='all'?'All items':value==='liked'?'Liked items':value==='fresh'?'Not recently played':'Recently played'})));
 mixes.addEventListener('change',()=>{mix=mixes.value;render();});
 const playlistFile=h('input',{type:'file',accept:'.json,application/json',hidden:true,'aria-label':'Import playlist file'});root.append(playlistFile);
 playlistFile.addEventListener('change',()=>void run(async()=>{try{const file=playlistFile.files?.[0];if(!file)return;if(file.size>2_000_000)throw Error('Playlist files must be smaller than 2 MB.');const recipe=playlistRecipe(JSON.parse(await file.text()));const match=matchPlaylist(recipe,tracks);if(!await askConfirm('Import '+recipe.name+' with '+match.order.length+' matched items? '+match.missing+' missing or ambiguous items will be skipped. Audio files are not included.'))return;await library.savePlaylist({id:crypto.randomUUID(),name:recipe.name,order:match.order});await refresh();report('Playlist imported. '+match.missing+' items skipped.');}finally{playlistFile.value='';}}));
 async function exportPlaylist(p:AudioPlaylist){const selected=p.order.map(id=>tracks.find(t=>t.id===id)).filter((t):t is AudioTrack=>!!t);const recipe=playlistRecipe({format:'anf-playlist-1',name:p.name,tracks:selected.map(({title,artist,name})=>({title,artist,name}))});const text=JSON.stringify(recipe,null,2);if(new TextEncoder().encode(text).length>200000)throw Error('Playlist export exceeds 200 KB. Split the playlist into smaller collections.');if(options.exportPlaylist){await options.exportPlaylist(text);return;}const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const link=h('a',{href:url,download:'AnF-playlist.json'});document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 function showRecap(){const el=h('dialog',{class:'music-dialog','aria-label':'Listening recap'}),year=new Date().getFullYear();const entries=tracks.map(track=>({track,seconds:listening.seconds[year+'|'+track.id]||0})).filter(item=>item.seconds>0).sort((a,b)=>b.seconds-a.seconds);el.append(h('h3',{text:'Listening recap'}),h('p',{text:year+' · '+Math.floor(entries.reduce((n,item)=>n+item.seconds,0)/60)+' minutes heard'}),h('p',{text:'Local playback only. Pauses, seeking, and Spotube do not count.'}),...entries.slice(0,10).map(({track,seconds})=>h('p',{text:track.title+' — '+durationText(seconds)})),button('Clear listening totals',()=>{void run(async()=>{if(!await askConfirm('Clear local listening totals? Files and saved positions will remain.'))return;listening.seconds={};saveListening();el.close();el.remove();showRecap();});}),button('Close recap',()=>{el.close();el.remove();}));el.addEventListener('cancel',()=>el.remove());document.body.append(el);el.showModal();}

 const tabButtons=['Music','Audiobooks','Podcasts','Favorites','Playlists'].map(label=>{const b=button(label,()=>{tab=label.toLowerCase();libraryLimit=80;selectedFeed=null;render();});b.setAttribute('role','tab');b.id='music-tab-'+label.toLowerCase();b.setAttribute('aria-controls','music-content');tabs.append(b);return b;});
 function showPlaylist(p:AudioPlaylist){
  const dialog=h('dialog',{class:'music-dialog','aria-label':'Playlist '+p.name});
  async function paintPlaylist(){
   const latest=(await library.playlists()).find(item=>item.id===p.id);
   if(!latest){dialog.close();report('This playlist no longer exists.');return;}
   const selected=latest.order.map(id=>tracks.find(t=>t.id===id)).filter((t):t is AudioTrack=>!!t);
   dialog.replaceChildren(h('h3',{text:latest.name}),...selected.map(t=>h('div',{class:'music-recent-row'},button(t.title,()=>playTrack(t,selected)),button('Remove '+t.title+' from playlist',async()=>{const fresh=(await library.playlists()).find(item=>item.id===p.id);if(!fresh)return;await library.savePlaylist({...fresh,order:fresh.order.filter(id=>id!==t.id)});await paintPlaylist();await refresh();}))),...(!selected.length?[h('p',{text:'This playlist is empty.'})]:[]),button('Close playlist',()=>dialog.close()));
  }
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();void paintPlaylist().catch(error=>{dialog.close();report(String(error));});
 }
 tabs.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const index=tabButtons.indexOf(document.activeElement as HTMLButtonElement);const next=event.key==='Home'?0:event.key==='End'?tabButtons.length-1:(index+(event.key==='ArrowRight'?1:tabButtons.length-1))%tabButtons.length;tabButtons[next].focus();tabButtons[next].click();});
 content.id='music-content';content.setAttribute('role','tabpanel');
 const subtitle=h('p',{text:'Your music, audiobooks, and podcasts. Everything plays from this computer.'});
 const theme=h('select',{'aria-label':'Music theme'},...[['ink','Emerald Ink (Default)'],['bloom','Spicetify Bloom (Neon)'],['cyberpunk','Cyberpunk Neon'],['velvet','Midnight Velvet'],['oled','OLED Pure Black']].map(([value,text])=>h('option',{value,text}))) as HTMLSelectElement;
 const savedTheme=localStorage.getItem('anf-music-theme')||'ink';
 const initialTheme=savedTheme==='ember'?'cyberpunk':savedTheme==='violet'?'bloom':savedTheme==='dusk'?'velvet':savedTheme;
 theme.value=['ink','bloom','cyberpunk','velvet','oled'].includes(initialTheme)?initialTheme:'ink';
 function applyTheme(){root.dataset.musicTheme=theme.value;try{localStorage.setItem('anf-music-theme',theme.value);}catch{/* The theme still applies for this session. */}}
 theme.addEventListener('change',applyTheme);
 const onlineBox=h('input',{type:'checkbox','aria-label':'Online lookups'}) as HTMLInputElement;
 onlineBox.checked=onlineLookupsEnabled();
 onlineBox.addEventListener('change',()=>{setOnlineLookups(onlineBox.checked);report(onlineBox.checked?'Online lookups on: lyrics, metadata and streaming sources may be contacted.':'Online lookups off. Nothing is sent to third-party services.');});
 const onlineToggle=h('label',{class:'music-label',title:'Allow lyrics, metadata and streaming lookups on third-party services (off by default)'},onlineBox,' Online lookups');
 const flowBtn=button('Music Flow',()=>openMusicFlow());
 flowBtn.className='nothing-pill';

 function extractDominantColor(t: AudioTrack): string {
  let hash = 0;
  const str = (t.title || '') + (t.artist || '') + (t.album || '');
  for (let i = 0; i < str.length; i++) {
   hash = (hash << 5) - hash + str.charCodeAt(i);
   hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 80%, 46%)`;
 }

 const header=h('header',{class:'music-heading'},h('div',{},h('h2',{text:'Music Hub'}),subtitle),h('label',{class:'music-search'},svg(icons.search,20,{stroke:1.5}),search),flowBtn,onlineToggle,theme);

 // Center Main Stage
 const mainStage=h('div',{class:'music-main-stage'},header,tabs,notice,content);

 // Right Collapsible Now Playing Canvas Drawer
 const drawer=h('aside',{class:'music-now-playing-drawer','aria-label':'Now playing drawer'});
 const isDrawerCollapsed=localStorage.getItem('anf_music_drawer_collapsed')==='1';
 const drawerHeader=h('div',{class:'music-drawer-header'},
  h('span',{class:'music-drawer-heading-text',text:'Now Playing'}),
  h('button',{type:'button',class:'music-drawer-toggle','aria-label':'Toggle Now Playing drawer',title:'Toggle Now Playing drawer',onclick:()=>{
   studioLayout.classList.toggle('drawer-collapsed');
   const collapsed=studioLayout.classList.contains('drawer-collapsed');
   try{localStorage.setItem('anf_music_drawer_collapsed',collapsed?'1':'0');}catch{}
  }},svg(icons.chevronRight,16,{stroke:2}))
 );
 const drawerArt=h('div',{class:'music-drawer-art'});
 const drawerArtImg=h('img',{alt:'',class:'music-drawer-art-img',hidden:true});
 const drawerArtFallback=svg(icons.music,48,{stroke:1.2});
 const drawerPlayingBadge=h('span',{class:'music-drawer-status-badge',text:'READY'});
 drawerArt.append(drawerArtFallback,drawerArtImg,drawerPlayingBadge);

 const drawerMeta=h('div',{class:'music-drawer-meta'});
 const drawerTitle=h('strong',{class:'music-drawer-title',text:'No track playing'});
 const drawerArtist=h('span',{class:'music-drawer-artist',text:'Select a song to start listening'});
 const drawerAlbum=h('span',{class:'music-drawer-album'});
 drawerMeta.append(drawerTitle,drawerArtist,drawerAlbum);

 const drawerLyricsHud=h('div',{class:'music-drawer-lyrics-hud','aria-label':'Synced lyrics HUD'});
 const drawerLyricPrev=h('p',{class:'music-drawer-lyric-prev'});
 const drawerLyricActive=h('p',{class:'music-drawer-lyric-active',text:'♪'});
 const drawerLyricNext=h('p',{class:'music-drawer-lyric-next'});
 drawerLyricsHud.append(drawerLyricPrev,drawerLyricActive,drawerLyricNext);

 const drawerActions=h('div',{class:'music-drawer-actions'});
 const drawerLikeBtn=h('button',{type:'button',class:'music-drawer-btn','aria-label':'Favorite',onclick:()=>{
  if(!current)return;
  prefs.favorites=prefs.favorites.includes(current.id)?prefs.favorites.filter(id=>id!==current!.id):[...prefs.favorites,current.id];
  save();paint();render();
 }},svg(icons.heart,16,{stroke:1.8}));
 const drawerDnaBtn=h('button',{type:'button',class:'music-drawer-btn','aria-label':'Track DNA',onclick:()=>{if(current)showMusicDna(current);}},h('span',{text:'DNA',style:'font-weight:700;font-size:10px;'}));
 const drawerEqBtn=h('button',{type:'button',class:'music-drawer-btn','aria-label':'Equalizer',onclick:()=>openEqModal()},svg(icons.sliders,16,{stroke:1.8}));
 drawerActions.append(drawerLikeBtn,drawerDnaBtn,drawerEqBtn);

 drawer.append(drawerHeader,drawerArt,drawerMeta,drawerLyricsHud,drawerActions);

 const studioLayout=h('div',{class:'music-studio-layout'+(isDrawerCollapsed?' drawer-collapsed':'')});
 studioLayout.append(mainStage,drawer);

 root.append(ambient,studioLayout,files,folder);
 applyTheme();

 const fullPlayer=h('dialog',{class:'music-player music-full-player','aria-label':'Now playing'});
 const dock=h('aside',{class:'music-player',hidden:true,'aria-label':'Music player'}),dockArt=h('div',{class:'music-player-art'}),dockTitle=h('strong'),dockArtist=h('span'),dockLyric=h('span',{class:'music-now-lyric'});
 const miniVis=createVisualizer(8,'music-visualizer-mini');
 const fullVis=createVisualizer(24,'music-visualizer-full');
 const toggle=button('Play',async()=>{if(!current)return;if(audio.paused)await resume();else pause();},'play');
 const stopBtn=button('Stop',()=>stop(),'pause');
 const like=button('Like track',()=>{if(!current)return;prefs.favorites=prefs.favorites.includes(current.id)?prefs.favorites.filter(id=>id!==current!.id):[...prefs.favorites,current.id];save();paint();render();},'heart');
 const seek=h('input',{type:'range',min:0,max:1,step:.1,value:0,'aria-label':'Music position'}),elapsed=h('span',{text:'0:00'}),total=h('span',{text:'0:00'}),volume=h('input',{type:'range',min:0,max:1,step:.01,value:prefs.volume,'aria-label':'Music volume'});
 const mute=button('Mute volume',()=>{audio.muted=!audio.muted;mute.setAttribute('aria-pressed',String(audio.muted));mute.textContent=audio.muted?'Unmute':'Mute';});
 const speed=h('select',{'aria-label':'Playback speed'},...[.75,1,1.25,1.5,1.75,2].map(n=>h('option',{value:String(n),text:n+'×'})));speed.value=String(prefs.speed);
 const sleep=h('select',{'aria-label':'Sleep timer'},...[['0','Off'],['15','15 min'],['30','30 min'],['45','45 min'],['60','60 min'],['end','End of track'],['chapter','End of chapter']].map(([value,text])=>h('option',{value,text})));
 let sleepTimer:ReturnType<typeof setTimeout>|undefined;
 let chapterStopAt:number|null=null;
 function clearChapterSleep(){chapterStopAt=null;}
 function armSleep(minutes:number){clearChapterSleep();if(sleepTimer)clearTimeout(sleepTimer);sleepTimer=undefined;if(!Number.isFinite(minutes)||minutes<=0){report('');return;}sleepTimer=setTimeout(()=>{pause();report('Sleep timer ended playback.');},minutes*60*1000);report('Sleep timer set for '+minutes+' minutes.');}
 function armChapterSleep(){
  if(sleepTimer){clearTimeout(sleepTimer);sleepTimer=undefined;}
  const at=chapterEndAt(current?.chapters,audio.currentTime||0,duration());
  if(at===null){clearChapterSleep();sleep.value='end';report('No chapters in this track. Sleep timer will stop at end of track.');updateChips();return;}
  chapterStopAt=at;
  sleep.value='chapter';
  report('Sleep timer will stop at the end of this chapter.');
  updateChips();
 }

 const speedChips=h('div',{class:'music-speed-chips','aria-label':'Playback speed chips'});
 for(const s of [.75,1,1.25,1.5,2]){
  const b=h('button',{type:'button',class:'music-chip'+(prefs.speed===s?' active':''),text:s+'×',onclick:()=>{sample();audio.playbackRate=prefs.speed=s;ensurePreservesPitch(audio, true);speed.value=String(s);resetClock();save();updateChips();}});
  b.dataset.speed=String(s);
  speedChips.append(b);
 }

 const sleepChips=h('div',{class:'music-sleep-chips','aria-label':'Sleep timer chips'});
 for(const [v,label] of [['0','Off'],['15','15m'],['30','30m'],['45','45m'],['60','60m'],['end','End'],['chapter','Chapter']]){
  const b=h('button',{type:'button',class:'music-chip'+(sleep.value===v?' active':''),text:label,onclick:()=>{sleep.value=v;if(v==='chapter'){armChapterSleep();}else if(v==='end'){clearChapterSleep();if(sleepTimer){clearTimeout(sleepTimer);sleepTimer=undefined;}report('Sleep timer will stop at end of track.');}else{armSleep(Number(v));}updateChips();}});
  b.dataset.sleep=v;
  sleepChips.append(b);
 }

 const eqChips=h('div',{class:'music-speed-chips music-eq-chips','aria-label':'Equalizer preset chips'});
 const eqPresetsList: [EqPresetName, string][] = [
  ['Flat', 'Flat'],
  ['Bass Boost', 'Bass'],
  ['Vocal Clarity', 'Vocal'],
  ['Acoustic', 'Acoustic'],
  ['Podcast / Audiobook Voice Clarifier', 'Voice Clarifier']
 ];
 for(const [name, label] of eqPresetsList){
  const b=h('button',{
   type:'button',
   class:'music-chip'+(audioDsp.getCurrentPreset()===name?' active':''),
   text:label,
   title:EQ_PRESETS[name].description,
   onclick:()=>{audioDsp.applyPreset(name);updateChips();}
  });
  b.dataset.eq=name;
  eqChips.append(b);
 }

 function openEqModal(){
  const dlg=createEqDialog(audioDsp);
  document.body.append(dlg);
  dlg.showModal();
 }

 function updateChips(){
  for(const el of root.querySelectorAll<HTMLElement>('.music-chip[data-speed], .music-player .music-chip[data-speed]'))el.classList.toggle('active',Number(el.dataset.speed)===prefs.speed);
  for(const el of root.querySelectorAll<HTMLElement>('.music-chip[data-sleep], .music-player .music-chip[data-sleep]'))el.classList.toggle('active',el.dataset.sleep===sleep.value);
  const curPreset=audioDsp.getCurrentPreset();
  for(const el of document.querySelectorAll<HTMLElement>('.music-chip[data-eq]'))el.classList.toggle('active',el.dataset.eq===curPreset);
 }
 audioDsp.subscribe(()=>updateChips());
 const shuffle=button('Shuffle queue',()=>{prefs.shuffle=!prefs.shuffle;if(prefs.shuffle){prefs.originalQueue=[...queue];queue=[...(current?[current.id]:[]),...shuffled(queue.filter(id=>id!==current?.id))];}else queue=reconcileQueue(prefs.originalQueue,tracks.map(t=>t.id),false);save();paint();renderQueue();},'shuffle');
 const repeat=button('Repeat off',()=>{prefs.repeat=({off:'all',all:'track',track:'off'} as const)[prefs.repeat];save();paint();},'repeat');
 const queuePanel=h('div',{class:'music-queue',hidden:true,'aria-label':'Playback queue'});

 // Lyrics show in the full player only. Synced lines highlight as the track plays; clicking one seeks there.
 const lyricsPanel=h('div',{class:'music-lyrics',role:'region','aria-label':'Lyrics'});
 let lyrics:Lyrics={synced:false,lines:[]},lyricRows:HTMLElement[]=[],lyricIndex=-2;
 
 async function lookupLyrics(){
  if(!current)return;
  if(!onlineLookupsEnabled()){report(ONLINE_LOOKUPS_OFF);return;}
  report('Searching LRCLIB for synced lyrics...');
  try{
   const online=await fetchOnlineLyrics({title:current.title,artist:current.artist,album:current.album,duration:current.duration});
   if(online){
    current.lyrics=online;
    await library.put(current);
    renderLyrics();
    paintLyrics();
    report('Synced lyrics loaded from LRCLIB.');
   }else{
    report('No online lyrics found for '+current.title+'.');
   }
  }catch(err){
   report('Lyrics search failed: '+String(err));
  }
 }

 async function showMusicDna(t: AudioTrack) {
  const overlay = h('div', { class: 'music-dna-overlay' });
  const modal = h('div', { class: 'music-dna-modal liquid-glass' });
  modal.replaceChildren(
   h('div', { class: 'music-dna-header' },
    h('div', {},
     h('h3', { text: t.title }),
     h('span', { class: 'music-dna-badge', text: 'Fetching Music DNA...' })
    ),
    button('Close', () => { overlay.remove(); })
   ),
   h('p', { class: 'music-muted', text: 'Connecting to Genius & Wikipedia knowledge archives...' })
  );
  overlay.append(modal);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.body.append(overlay);

  try {
   const dna = await echoDna.fetchMusicDna({ title: t.title, artist: t.artist, album: t.album });
   modal.replaceChildren(
    h('div', { class: 'music-dna-header' },
     h('div', {},
      h('h3', { text: dna.songTitle }),
      h('span', { class: 'music-dna-badge', text: 'DNA Source: ' + dna.source.toUpperCase() })
     ),
     button('Close', () => { overlay.remove(); })
    ),
    h('div', { class: 'music-dna-section' },
     h('h4', { text: 'About This Song & Backstory' }),
     h('p', { text: dna.meaning })
    ),
    h('div', { class: 'music-dna-section' },
     h('h4', { text: 'Artist Context (' + dna.artistName + ')' }),
     h('p', { text: dna.artistBio })
    ),
    ...(dna.albumName ? [h('div', { class: 'music-dna-section' },
     h('h4', { text: 'Album' }),
     h('p', { text: dna.albumName })
    )] : [])
   );
  } catch (err) {
   modal.replaceChildren(
    h('div', { class: 'music-dna-header' },
     h('h3', { text: t.title }),
     button('Close', () => { overlay.remove(); })
    ),
    h('p', { class: 'music-notice', text: 'Could not fetch Music DNA: ' + String(err) })
   );
  }
 }

 function openMusicFlow() {
  if (!tracks.length) {
   report('Add tracks to your library first to enter Music Flow.');
   return;
  }

  const overlay = h('div', { class: 'music-flow-overlay' });
  const viewport = h('div', { class: 'music-flow-viewport' });
  const flowArtUrls: string[] = [];

  const flowCandidates: MusicFlowItem[] = tracks.map(t => audioTrackToFlowItem(t));
  const filtered = filterMusicFlowCandidates(flowCandidates);
  const ranked = rankMusicFlowCandidates(
   filtered,
   [],
   new Set(prefs.favorites),
   new Set()
  );

  const topbar = h('div', { class: 'music-flow-topbar' },
   h('span', { class: 'nothing-pill', text: 'Music Flow · Reel' }),
   button('Close Flow', () => { for (const url of flowArtUrls) URL.revokeObjectURL(url); flowArtUrls.length = 0; overlay.remove(); })
  );

  function renderCard(item: MusicFlowItem) {
   const cardEl = h('div', { class: 'music-flow-card' });
   const backdrop = h('div', {
    class: 'music-flow-backdrop',
    style: 'background: #12181a;'
   });
   const scrim = h('div', { class: 'music-flow-scrim' });

   const artContainer = h('div', { class: 'music-flow-artwork-container' });
   if (safeHttpsUrl(item.coverUrl)) {
    const flowImg = h('img', { alt: item.title });
    artContainer.append(flowImg);
    void resolveHubCover(item.coverUrl).then(src => {
     if (!src) return;
     flowImg.src = src;
     backdrop.style.backgroundImage = cssUrl(src);
     if (src.startsWith('blob:')) flowArtUrls.push(src);
    });
   } else {
    artContainer.append(svg(icons.music, 64, { stroke: 1.2 }));
   }
   const glyph = h('div', { class: 'music-flow-play-glyph' }, svg(icons.play, 28, { stroke: 2 }));
   artContainer.append(glyph);

   const lyricsHud = h('div', { class: 'music-flow-lyrics-hud' });
   const currentLine = h('div', { class: 'music-flow-current-line', text: item.title });
   const nextLine = h('div', { class: 'music-flow-next-line', text: item.artist });
   lyricsHud.append(currentLine, nextLine);

   const meta = h('div', { class: 'music-flow-meta' });
   const title = h('h3', { class: 'music-flow-title', text: item.title });
   const artistRow = h('div', { class: 'music-flow-artist-row' });
   artistRow.append(h('span', { class: 'music-flow-artist', text: item.artist }));
   meta.append(title, artistRow);

   const actionRow = h('div', { class: 'music-flow-action-row' });
   const likeBtn = h('button', {
    type: 'button',
    class: 'music-flow-action-btn',
    'aria-label': 'Like',
    onclick: (e: Event) => {
     e.stopPropagation();
     prefs.favorites = prefs.favorites.includes(item.id)
      ? prefs.favorites.filter(id => id !== item.id)
      : [...prefs.favorites, item.id];
     save();
     likeBtn.style.color = prefs.favorites.includes(item.id) ? 'var(--accent, #79e4b4)' : '#ffffff';
    }
   }, svg(icons.heart, 20, { stroke: 1.8 }));
   if (prefs.favorites.includes(item.id)) likeBtn.style.color = 'var(--accent, #79e4b4)';

   const dnaBtn = h('button', {
    type: 'button',
    class: 'music-flow-action-btn',
    'aria-label': 'Music DNA',
    title: 'Music DNA',
    onclick: (e: Event) => {
     e.stopPropagation();
     const trk = tracks.find(x => x.id === item.id);
     if (trk) showMusicDna(trk);
    }
   }, h('span', { text: 'DNA', style: 'font-size: 10px; font-weight: 800;' }));

   actionRow.append(likeBtn, dnaBtn);

   artContainer.onclick = async () => {
    const trk = tracks.find(x => x.id === item.id);
    if (trk) {
     if (current?.id === trk.id && !audio.paused) {
      pause();
      glyph.style.opacity = '1';
     } else {
      await playTrack(trk, tracks);
      glyph.style.opacity = '0';
     }
    }
   };

   const contentWrap = h('div', { class: 'music-flow-content' });
   contentWrap.append(lyricsHud, artContainer, meta, actionRow);

   cardEl.append(backdrop, scrim, contentWrap);
   return cardEl;
  }

  for (let i = 0; i < ranked.length; i++) {
   viewport.append(renderCard(ranked[i]));
  }

  overlay.append(topbar, viewport);
  document.body.append(overlay);
 }

 function renderLyrics(){
  lyrics=current?.lyrics?parseLyrics(current.lyrics):{synced:false,lines:[]};
  lyricIndex=-2;
  lyricRows=lyrics.lines.map(line=>lyrics.synced
   ?h('button',{type:'button',class:'music-lyric',text:line.text||'♪',onclick:()=>{audio.currentTime=line.time!;paint();save();}})
   :h('p',{class:'music-lyric',text:line.text})
  );
  lyricsPanel.replaceChildren(
   ...(lyricRows.length
    ?[
      h('div',{class:'music-lyrics-header'},
       h('span',{class:'music-lyrics-badge',text:lyrics.synced?'Synced (MKR / LRCLIB)':'Plain lyrics'}),
       lyrics.synced?h('span',{class:'music-lyrics-hint',text:'Click any line to seek playback'}):null
      ),
      ...lyricRows
     ]
    :[
      h('div',{class:'music-lyrics-empty'},
       h('p',{text:'No lyrics for this track. Import a .lrc file or search online with MKR Music.'}),
       button('Find Synced Lyrics (MKR)',lookupLyrics)
      )
     ]
   )
  );
 }

 function paintLyrics(){
  if(!lyrics.synced||!lyrics.lines.length){
   dockLyric.textContent='';
   drawerLyricPrev.textContent='';
   drawerLyricActive.textContent='♪';
   drawerLyricNext.textContent='';
   return;
  }
  const i=activeLine(lyrics,audio.currentTime||0);
  if(i>=0&&lyrics.lines[i]){
   dockLyric.textContent='♪ '+lyrics.lines[i].text;
   drawerLyricPrev.textContent=i>0?lyrics.lines[i-1].text:'';
   drawerLyricActive.textContent=lyrics.lines[i].text;
   drawerLyricNext.textContent=i<lyrics.lines.length-1?lyrics.lines[i+1].text:'';
  }else{
   dockLyric.textContent='';
   drawerLyricPrev.textContent='';
   drawerLyricActive.textContent='♪';
   drawerLyricNext.textContent='';
  }
  if(i===lyricIndex)return;
  lyricRows[lyricIndex]?.classList.remove('active');
  lyricRows[lyricIndex]?.removeAttribute('aria-current');
  lyricIndex=i;
  const row=lyricRows[i];
  if(!row)return;
  row.classList.add('active');
  row.setAttribute('aria-current','true');
  if(fullPlayer.open)lyricsPanel.scrollTo({top:row.offsetTop-(lyricsPanel.clientHeight-row.offsetHeight)/2,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 }

 dock.append(
  h('div',{class:'music-now'},dockArt,h('button',{class:'music-now-info',type:'button','aria-label':'Open full player',onclick:()=>openFullPlayer()},dockTitle,dockArtist,dockLyric),miniVis,like),
  h('div',{class:'music-transport'},h('div',{class:'music-controls'},shuffle,button('Previous track',()=>step(-1),'previous'),toggle,stopBtn,button('Next track',()=>step(1),'next'),repeat,Object.assign(button('Equalizer',()=>openEqModal(),'eq'),{className:'music-eq-dock'})),h('div',{class:'music-progress'},elapsed,seek,total)),
  h('div',{class:'music-extras'},button('Back 15s',()=>{audio.currentTime=Math.max(0,audio.currentTime-15);save();paint();}),button('Forward 30s',()=>{audio.currentTime=Math.min(duration(),audio.currentTime+30);save();paint();}),button('Show queue',()=>{queuePanel.hidden=!queuePanel.hidden;renderQueue();},'queue'),button('Clear queue',()=>{queue=current?[current.id]:[];save();renderQueue();report('Queue cleared.');}),button('DNA',()=>{if(current)void showMusicDna(current);}),button('Flow',()=>openMusicFlow()),button('Find lyrics',lookupLyrics),button('EQ',()=>openEqModal(),'eq'),button('Lock screen',()=>void run(playOnLockScreen)),h('label',{class:'music-speed'},'Speed',speed),h('label',{class:'music-sleep'},'Sleep',sleep),h('label',{class:'music-volume'},'Volume',volume),mute),
  queuePanel,
  lyricsPanel
 );
 document.body.append(dock);

 const playerParts=Array.from(dock.children);
 function openFullPlayer(){
  if(!current||fullPlayer.open)return;
  fullPlayer.replaceChildren(
   button('Close player',()=>fullPlayer.close()),
   fullVis,
   ...playerParts,
   h('div',{class:'music-full-chips'},
    h('div',{class:'music-toolbar-group'},h('span',{class:'music-label',text:'Speed'}),speedChips),
    h('div',{class:'music-toolbar-group'},h('span',{class:'music-label',text:'Sleep'}),sleepChips),
    h('div',{class:'music-toolbar-group'},h('span',{class:'music-label',text:'EQ Presets'}),eqChips,button('EQ Sliders',()=>openEqModal(),'eq'))
   )
  );
  dock.hidden=true;
  fullPlayer.showModal();
  lyricIndex=-2;
  paintLyrics();
 }
 fullPlayer.addEventListener('close',()=>{queuePanel.hidden=true;dock.append(...playerParts);dock.hidden=!current||suspended;});
 document.body.append(fullPlayer);

 function save(){saveListening();prefs.queue=[...queue];prefs.current=current?.id;prefs.position=audio.readyState?audio.currentTime:pending;try{localStorage.setItem('anf-music-player',JSON.stringify(prefs));}catch{report('Could not save your listening position. Check device storage.');}}
 function duration(){return Number.isFinite(audio.duration)?audio.duration:current?.duration||0;}

 let paintedPlaying:boolean|undefined;
 function paint(){
  mute.setAttribute('aria-pressed',String(audio.muted));mute.textContent=audio.muted?'Unmute':'Mute';
  shuffle.setAttribute('aria-pressed',String(prefs.shuffle));
  repeat.setAttribute('aria-pressed',String(prefs.repeat!=='off'));
  repeat.setAttribute('aria-label','Repeat '+prefs.repeat);
  repeat.title='Repeat '+prefs.repeat;
  const playing=!audio.paused&&playbackState==='playing';
  miniVis.classList.toggle('playing',playing);
  fullVis.classList.toggle('playing',playing);
  updateChips();
  if(paintedPlaying!==playing){
   paintedPlaying=playing;
   toggle.replaceChildren(svg(icons[playing?'pause':'play'],22,{stroke:1.8}));
   toggle.setAttribute('aria-label',playing?'Pause':'Play');
   toggle.title=playing?'Pause':'Play';
   toggle.classList.add('music-play');
  }
  seek.max=String(duration()||1);
  seek.value=String(audio.currentTime||0);
  elapsed.textContent=durationText(audio.currentTime||0);
  const rem=Math.max(0,duration()-(audio.currentTime||0));
  total.textContent=durationText(duration())+(rem>0?' (-'+durationText(rem)+')':'');
  seek.setAttribute('aria-valuetext',elapsed.textContent+' of '+total.textContent);
  like.setAttribute('aria-pressed',String(!!current&&prefs.favorites.includes(current.id)));
  dockTitle.textContent=current?.title||'';
  const pct=duration()>0?Math.round(audio.currentTime/duration()*100):0;
  const nextId=current?nextTrack(queue,current.id,prefs.repeat,false):undefined;
  const next=nextId?tracks.find(t=>t.id===nextId):undefined;
  const qIndex=current?queue.indexOf(current.id):-1;
  const qPos=qIndex>=0&&queue.length>1?' · '+(qIndex+1)+'/'+queue.length:'';
  const trackLabel=current?.trackNo?(current.trackOf?current.trackNo+'/'+current.trackOf:'#'+current.trackNo):'';
  const stateLabel=playbackState==='buffering'?' [Buffering...]':playbackState==='error'?' [Error]':'';
  dockArtist.textContent=(current?kindLabel(current.kind||'music')+' · ':'')+(current?.artist||'Unknown artist')+(current?.album?' · '+current.album:'')+(trackLabel?' · '+trackLabel:'')+(current?.year?' · '+current.year:'')+(current?.genre?' · '+current.genre:'')+(current&&formatBadge(current)?' · '+formatBadge(current):'')+(pct>0?' · '+pct+'%':'')+qPos+(next?' · Up next: '+next.title:'')+stateLabel;
  if(current){
   drawerPlayingBadge.textContent=(playing?'PLAYING':'PAUSED')+' · '+playbackMark(current);
   drawerLikeBtn.style.color=prefs.favorites.includes(current.id)?'var(--music-accent, #79e4b4)':'var(--music-ink)';
   drawerLikeBtn.setAttribute('aria-pressed',String(prefs.favorites.includes(current.id)));
  }
  paintLyrics();
 }

 function clearMediaSession(){
  if(!('mediaSession' in navigator))return;
  navigator.mediaSession.metadata=null;
  navigator.mediaSession.playbackState='none';
  const actions:MediaSessionAction[]=['play','pause','previoustrack','nexttrack','seekbackward','seekforward','seekto'];
  for(const a of actions){
   try{navigator.mediaSession.setActionHandler(a,null);}catch{}
  }
 }

 function metadata(){
  if(!current||!('mediaSession' in navigator))return;
  navigator.mediaSession.metadata=new MediaMetadata({title:current.title,artist:current.artist,album:current.album,artwork:cover?[{src:cover,type:current.cover?current.cover.type:'image/png'}]:[]});
  for(const [action,fn] of Object.entries({
   play:()=>void run(resume),
   pause,
   previoustrack:()=>void run(()=>step(-1)),
   nexttrack:()=>void run(()=>step(1)),
   seekbackward:()=>{audio.currentTime=Math.max(0,audio.currentTime-15);save();},
   seekforward:()=>{audio.currentTime=Math.min(duration(),audio.currentTime+15);save();},
   seekto:(d:MediaSessionActionDetails)=>{if(d.seekTime!==undefined){audio.currentTime=Math.max(0,Math.min(duration(),d.seekTime));save();}}
  })) {
   try{navigator.mediaSession.setActionHandler(action as MediaSessionAction,fn);}catch{/* Optional device action. */}
  }
 }

 async function resume(){
  if(!current)return;
  suspended=false;
  dock.hidden=false;
  document.body.classList.add('has-music-player');
  await options.beforePlay();
  metadata();
  try{
   await audio.play();
   setPlaybackState('playing');
   if('mediaSession' in navigator)navigator.mediaSession.playbackState='playing';
  }catch(err){
   setPlaybackState('paused');
   report('Playback failed: '+describeStreamError(err));
   return;
  }
  prefs.recent=[current.id,...prefs.recent.filter(id=>id!==current!.id)].slice(0,40);
  save();
  markPlaying();
 }

 function pause(){
  sample();
  audio.pause();
  setPlaybackState('paused');
  if('mediaSession' in navigator)navigator.mediaSession.playbackState='paused';
  save();
 }

 function stop(){
  sample();
  audio.pause();
  audio.currentTime=0;
  pending=0;
  setPlaybackState('idle');
  clearMediaSession();
  save();
  paint();
 }

 function playbackMark(track:AudioTrack){return track.preview?'30 s PREVIEW':(formatBadge(track)||'320kbps');}

 async function ensurePlayable(track:AudioTrack):Promise<AudioTrack>{
  const id=track.id.startsWith('stream:')?track.id.slice('stream:'.length):track.id;
  const meta=await streamService.getTrack(id);
  if(!shouldResolveCatalogueTrack({blobSize:track.blob?.size||0,streamUrl:track.streamUrl,preview:track.preview},meta?.previewUrl))return track;
  if(!meta||(meta.source!=='spotube'&&meta.source!=='spotify'&&meta.source!=='youtube'))return track;
  const resolved=await streamService.resolveStream(meta);
  if(!resolved?.streamUrl)return track;
  const next:AudioTrack={...track,streamUrl:resolved.streamUrl,duration:resolved.duration??track.duration,preview:!!resolved.preview,format:resolved.mimeType||track.format};
  const at=tracks.findIndex(t=>t.id===track.id);
  if(at>=0)tracks[at]=next;
  return next;
 }

 async function select(track:AudioTrack,play=true,position?:number){
  const token=++epoch;
  track=await ensurePlayable(track);
  if(token!==epoch)return;
  if(track.blob&&track.blob.size>0&&!isAudioContentType(track.blob.type)){
   report('"'+track.title+'" is stored as '+(track.blob.type||'unknown data')+', not audio, so it cannot be played. Remove it from your library.');
   return;
  }
  pause();
  clearChapterSleep();
  if(sleep.value==='chapter')sleep.value='0';
  lastWall=0;
  if(source&&source.startsWith('blob:'))URL.revokeObjectURL(source);
  if(cover&&cover.startsWith('blob:'))URL.revokeObjectURL(cover);
  current=track;
  renderLyrics();

  if(track.blob&&track.blob.size>0){
   source=URL.createObjectURL(track.blob);
  }else if(track.streamUrl){
   source=safeHttpsUrl(track.streamUrl)||'';
  }else{
   source='';
  }

  if(track.cover){
   cover=URL.createObjectURL(track.cover);
  }else{
   cover=await resolveHubCover(track.coverUrl);
  }
  const domColor = extractDominantColor(track);
  root.style.setProperty('--ambient-glow-color', domColor);
  root.style.setProperty('--music-accent-glow', domColor.replace('hsl', 'hsla').replace(')', ', 0.4)'));
  try{document.documentElement.style.setProperty('--ambient-glow-color', domColor);}catch{}
  if(cover){
   ambient.style.backgroundImage=`radial-gradient(circle 900px at 50% 0%, ${domColor}, transparent 70%), ${cssUrl(cover)}`;
   ambient.classList.add('has-cover');
  }else{
   ambient.style.backgroundImage=`radial-gradient(circle 900px at 50% 0%, ${domColor}, transparent 70%)`;
   ambient.classList.remove('has-cover');
  }
  pending=position??((track.kind&&track.kind!=='music')?listening.positions[track.id]||0:0);
  audio.src=source;
  dockArt.replaceChildren(cover?h('img',{src:cover,alt:''}):svg(icons.music,28,{stroke:1.5}));
  fullPlayer.style.setProperty('--anf-art',cssUrl(cover));

  drawerTitle.textContent=track.title;
  drawerArtist.textContent=track.artist||'Unknown artist';
  drawerAlbum.textContent=track.album||'';
  drawerPlayingBadge.textContent='READY · '+playbackMark(track);
  if(play&&track.id.startsWith('stream:'))report('Playing '+track.title);
  if(cover){
   drawerArtImg.src=cover;
   drawerArtImg.hidden=false;
   drawerArtFallback.style.display='none';
  }else{
   drawerArtImg.hidden=true;
   drawerArtFallback.style.display='block';
  }

  audio.load();
  audio.playbackRate=prefs.speed;
  suspended=false;
  dock.hidden=false;
  document.body.classList.add('has-music-player');
  paint();
  save();
  renderQueue();
  if(play&&token===epoch)await resume();
 }

 async function step(direction:number,automatic=false){
  if(!current)return;
  if(direction<0&&audio.currentTime>3){audio.currentTime=0;paint();save();return;}
  const id=direction>0
   ?nextTrack(queue,current.id,prefs.repeat,automatic)
   :previousTrack(queue,current.id,prefs.repeat);
  const track=tracks.find(t=>t.id===id);
  if(track){
   if(track.id===current.id&&prefs.repeat==='track'){
    audio.currentTime=0;
    await resume();
   }else{
    await select(track);
   }
  }else{
   if(direction>0&&automatic){
    sample();
    audio.pause();
    audio.currentTime=0;
    setPlaybackState('ended');
    if('mediaSession' in navigator)navigator.mediaSession.playbackState='none';
    save();
   }else{
    pause();
   }
  }
 }

 function art(track:AudioTrack){
  const el=h('div',{class:'music-cover'});
  if(track.cover){
   const url=URL.createObjectURL(track.cover);
   artUrls.push(url);
   el.append(h('img',{src:url,alt:'',loading:'lazy'}));
  }else if(safeHttpsUrl(track.coverUrl)){
   el.append(coverImg(track.coverUrl));
  }else{
   el.style.setProperty('--cover-hue',String(Array.from(track.id).reduce((n,c)=>n+c.charCodeAt(0),0)%360));
   el.append(svg(icons.music,40,{stroke:1.2}));
  }
  return el;
 }
 let artUrls:string[]=[];
 const coverFetchEnabled=hasSafeFetch();
 function rememberArtBlob(url:string){if(url.startsWith('blob:'))artUrls.push(url);}
 async function resolveHubCover(url:string|undefined):Promise<string>{
  const direct=safeHttpsUrl(url);
  if(!direct)return '';
  if(!coverFetchEnabled)return direct;
  try{
   const src=await resolveCoverSrc(url,coverFetchEnabled,safeFetchImage);
   return src??direct;
  }catch{
   return direct;
  }
 }
 function coverImg(url:string|undefined){
  const img=h('img',{alt:'',loading:'lazy'});
  const fallback=safeHttpsUrl(url)||'';
  void resolveHubCover(url).then(src=>{const shown=src||fallback;if(!shown)return;img.src=shown;rememberArtBlob(shown);}).catch(()=>{if(fallback)img.src=fallback;});
  return img;
 }

 function visible():AudioTrack[]{
  const term=search.value.trim().toLocaleLowerCase();
  return localMix<AudioTrack>(tracks,mix,prefs.favorites,prefs.recent).filter((t:AudioTrack)=>{
   const kind=t.kind||'music';
   if(tab==='audiobooks'&&kind!=='audiobook')return false;
   if(tab==='music'&&kind!=='music')return false;
   if(tab==='podcasts'&&kind!=='podcast')return false;
   if(tab==='favorites'&&!prefs.favorites.includes(t.id))return false;
   if(tab==='streaming'&&(!t.id.startsWith('stream:')&&!t.streamUrl))return false;
   return !term||[t.title,t.artist,t.album,t.genre,t.format].some(s=>s?.toLocaleLowerCase().includes(term));
  });
 }

 function playTrack(t:AudioTrack,list:AudioTrack[]=visible()){
  prefs.originalQueue=list.map((item:AudioTrack)=>item.id);
  queue=prefs.shuffle?[t.id,...shuffled(prefs.originalQueue.filter((id:string)=>id!==t.id))]:[...prefs.originalQueue];
  return select(t);
 }

 function markPlaying(){for(const el of root.querySelectorAll<HTMLElement>('.music-card'))el.classList.toggle('music-card-playing',el.dataset.id===current?.id);}
 function enqueue(t:AudioTrack){queue=enqueueTrack(queue,t.id);save();renderQueue();report(t.title+' added to the queue.');}
 function playNext(t:AudioTrack){queue=playNextTrack(queue,current?.id,t.id);save();renderQueue();report(t.title+' will play next.');}
 function playPrevious(t:AudioTrack){queue=playPreviousTrack(queue,current?.id,t.id);save();renderQueue();report(t.title+' will play previous.');}

 function playAlbum(t:AudioTrack){if(!t.album)return;const albumTracks=tracks.filter(x=>x.album===t.album&&x.artist===t.artist).sort((a,b)=>(a.trackNo||0)-(b.trackNo||0));if(!albumTracks.length)return;prefs.originalQueue=albumTracks.map(x=>x.id);queue=prefs.shuffle?shuffled(prefs.originalQueue):[...prefs.originalQueue];void select(albumTracks[0]);report('Playing album '+t.album+'.');}
 function playArtist(t:AudioTrack){if(!t.artist)return;const artistTracks=tracks.filter(x=>x.artist===t.artist).sort((a,b)=>(a.album||'').localeCompare(b.album||'')||(a.trackNo||0)-(b.trackNo||0));if(!artistTracks.length)return;prefs.originalQueue=artistTracks.map(x=>x.id);queue=prefs.shuffle?shuffled(prefs.originalQueue):[...prefs.originalQueue];void select(artistTracks[0]);report('Playing artist '+t.artist+'.');}
 function playGenre(t:AudioTrack){if(!t.genre)return;const genreTracks=tracks.filter(x=>x.genre===t.genre).sort((a,b)=>(a.artist||'').localeCompare(b.artist||'')||(a.album||'').localeCompare(b.album||'')||(a.trackNo||0)-(b.trackNo||0));if(!genreTracks.length)return;prefs.originalQueue=genreTracks.map(x=>x.id);queue=prefs.shuffle?shuffled(prefs.originalQueue):[...prefs.originalQueue];void select(genreTracks[0]);report('Playing genre '+t.genre+'.');}
 function playYear(t:AudioTrack){if(!t.year)return;const yearTracks=tracks.filter(x=>x.year===t.year).sort((a,b)=>(a.artist||'').localeCompare(b.artist||'')||(a.album||'').localeCompare(b.album||'')||(a.trackNo||0)-(b.trackNo||0));if(!yearTracks.length)return;prefs.originalQueue=yearTracks.map(x=>x.id);queue=prefs.shuffle?shuffled(prefs.originalQueue):[...prefs.originalQueue];void select(yearTracks[0]);report('Playing year '+t.year+'.');}
 function playDecade(t:AudioTrack){if(!t.year)return;const decade=Math.floor(t.year/10)*10;const decadeTracks=tracks.filter(x=>x.year&&Math.floor(x.year/10)*10===decade).sort((a,b)=>(a.year||0)-(b.year||0)||(a.artist||'').localeCompare(b.artist||'')||(a.album||'').localeCompare(b.album||'')||(a.trackNo||0)-(b.trackNo||0));if(!decadeTracks.length)return;prefs.originalQueue=decadeTracks.map(x=>x.id);queue=prefs.shuffle?shuffled(prefs.originalQueue):[...prefs.originalQueue];void select(decadeTracks[0]);report('Playing '+decade+'s.');}

 function card(t:AudioTrack,list:AudioTrack[]){
  const play=button('Play '+t.title,()=>playTrack(t,list));
  play.className='music-card-play';
  const trackLabel=t.trackNo?(t.trackOf?t.trackNo+'/'+t.trackOf:'#'+t.trackNo):'';
  const meta=(t.artist||'Unknown artist')+(t.album?' · '+t.album:'')+(trackLabel?' · '+trackLabel:'')+(t.year?' · '+t.year:'')+(t.genre?' · '+t.genre:'')+(formatBadge(t)?' · '+formatBadge(t):'')+(t.duration?' · '+durationText(t.duration):'');
  const coverEl=art(t);
  const badge=trackBadge(t);
  coverEl.append(h('span',{class:`music-card-badge music-badge-${badge.kind}`,text:badge.label}));
  play.replaceChildren(coverEl,h('strong',{text:t.title}),h('span',{text:meta}));
  const liked=prefs.favorites.includes(t.id);
  const likeBtn=button(liked?'Unlike '+t.title:'Like '+t.title,()=>{prefs.favorites=liked?prefs.favorites.filter(id=>id!==t.id):[...prefs.favorites,t.id];save();render();},'heart');
  likeBtn.setAttribute('aria-pressed',String(liked));
  const card=h('article',{class:'music-card'+(t.id===current?.id?' music-card-playing':''),'data-id':t.id},play,button('Play previous',()=>playPrevious(t)),button('Play next',()=>playNext(t)),t.album?button('Play album',()=>playAlbum(t)):null,t.artist?button('Play artist',()=>playArtist(t)):null,t.genre?button('Play genre',()=>playGenre(t)):null,t.year?button('Play year',()=>playYear(t)):null,t.year?button('Play decade',()=>playDecade(t)):null,button('Queue '+t.title,()=>enqueue(t)),likeBtn);
  card.append(h('details',{class:'music-item-actions'},h('summary',{text:'Track actions'}),button('Music DNA',()=>showMusicDna(t)),button('Details for '+t.title,()=>showDetails(t)),button('Add '+t.title+' to playlist',()=>choosePlaylist(t))));
  return card;
 }

 function showDetails(track:AudioTrack){
  const dialog=h('dialog',{class:'music-dialog','aria-label':'Audio details'});
  const kind=h('select',{'aria-label':'Item content type'},...['music','audiobook','podcast'].map(value=>h('option',{value,text:kindLabel(value as 'music'|'audiobook'|'podcast')})));
  kind.value=track.kind||'music';
  const close=()=>{dialog.close();dialog.remove();};
  async function update(changes:Partial<AudioTrack>){const latest=await library.get(track.id);if(!latest)throw Error('This audio item was removed.');const updated={...latest,...changes};await library.put(updated);if(current?.id===track.id){current=updated;renderLyrics();paint();}await refresh();close();}
  const lyricsFile=h('input',{type:'file',accept:'.lrc,.txt,text/plain','aria-label':'Import timed lyrics'});
  lyricsFile.addEventListener('change',()=>void run(async()=>{const file=lyricsFile.files?.[0];if(!file)return;if(file.size>200000)throw Error('Lyrics files must be under 200 KB.');const text=await file.text();if(!parseLyrics(text).lines.length)throw Error('Choose a nonempty lyrics file.');await update({lyrics:text});report('Lyrics saved locally.');}));
  dialog.append(h('h3',{text:track.title}),h('p',{text:[track.name,track.artist,track.album,track.year,track.genre,formatBadge(track)].filter(Boolean).join(' · ')}),kind,button('Save content type',()=>update({kind:kind.value as 'music'|'audiobook'|'podcast'})),lyricsFile,button('Close details',close));
  dialog.addEventListener('cancel',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
 }

 async function choosePlaylist(t:AudioTrack){
  if(!playlists.length){report('Create a playlist in Playlists first.');return;}
  const choices=h('dialog',{class:'music-dialog'});
  choices.append(h('h3',{text:'Add to playlist'}),...playlists.map(p=>button(p.name,async()=>{await library.savePlaylist({...p,order:[...new Set([...p.order,t.id])]});choices.close();choices.remove();await refresh();report('Added to '+p.name+'.');})),button('Cancel',()=>{choices.close();choices.remove();}));
  choices.addEventListener('cancel',()=>choices.remove());document.body.append(choices);choices.showModal();
 }

 function renderQueue(){
  const chapters=current?.chapters||[];
  function move(id:string,delta:number){const at=queue.indexOf(id),to=at+delta;if(at<0||to<0||to>=queue.length)return;[queue[at],queue[to]]=[queue[to],queue[at]];prefs.originalQueue=[...queue];save();renderQueue();}
  const ci=current?queue.indexOf(current.id):-1;
  const remIds=ci>=0?queue.slice(ci+1):queue.slice();
  const remTime=remIds.map(id=>tracks.find(t=>t.id===id)).reduce((n,t)=>n+(t?.duration||0),0);
  const remCount=remIds.length;
  const total=queue.length;
  const remLabel=remCount>0?(remCount+' remaining of '+total+(remTime>0?' · '+durationText(remTime)+' left':'')):(total?'of '+total:'');
  queuePanel.replaceChildren(h('div',{class:'music-queue-header'},h('h3',{text:(chapters.length?'Chapters':'Up next')+(remLabel?' · '+remLabel:'')}),button('Save queue as playlist',()=>{if(!queue.length){report('Queue is empty.');return;}void run(async()=>{const name=await askText('Playlist name for current queue');if(!name?.trim())return;await library.savePlaylist({id:crypto.randomUUID(),name:name.trim(),order:[...queue]});report('Saved queue as playlist “'+name.trim()+'”.');await refresh();});}),button('Shuffle remaining',()=>{if(queue.length<2){report('Not enough tracks to shuffle.');return;}const ci=current?queue.indexOf(current.id):-1;const head=ci>=0?queue.slice(0,ci+1):[];const tail=ci>=0?queue.slice(ci+1):[...queue];if(tail.length<2){report('Nothing left to shuffle.');return;}for(let i=tail.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[tail[i],tail[j]]=[tail[j],tail[i]];}queue=[...head,...tail];prefs.originalQueue=[...queue];save();renderQueue();report('Shuffled remaining queue.');}),button('Reverse remaining',()=>{const ci=current?queue.indexOf(current.id):-1;const head=ci>=0?queue.slice(0,ci+1):[];const tail=ci>=0?queue.slice(ci+1):[...queue];if(tail.length<2){report('Nothing left to reverse.');return;}tail.reverse();queue=[...head,...tail];prefs.originalQueue=[...queue];save();renderQueue();report('Reversed remaining queue.');}),button('Sort remaining by title',()=>{const ci=current?queue.indexOf(current.id):-1;const head=ci>=0?queue.slice(0,ci+1):[];const tail=ci>=0?queue.slice(ci+1):[...queue];if(tail.length<2){report('Nothing left to sort.');return;}const sorted=tail.slice().sort((a,b)=>{const ta=tracks.find(t=>t.id===a)?.title||'';const tb=tracks.find(t=>t.id===b)?.title||'';return ta.localeCompare(tb);});queue=[...head,...sorted];prefs.originalQueue=[...queue];save();renderQueue();report('Sorted remaining queue by title.');}),button('Sort remaining by artist',()=>{const ci=current?queue.indexOf(current.id):-1;const head=ci>=0?queue.slice(0,ci+1):[];const tail=ci>=0?queue.slice(ci+1):[...queue];if(tail.length<2){report('Nothing left to sort.');return;}const sorted=tail.slice().sort((a,b)=>{const ta=tracks.find(t=>t.id===a);const tb=tracks.find(t=>t.id===b);const aa=(ta?.artist||'')+'|'+(ta?.title||'');const bb=(tb?.artist||'')+'|'+(tb?.title||'');return aa.localeCompare(bb);});queue=[...head,...sorted];prefs.originalQueue=[...queue];save();renderQueue();report('Sorted remaining queue by artist.');}),button('Sort remaining by album',()=>{const ci=current?queue.indexOf(current.id):-1;const head=ci>=0?queue.slice(0,ci+1):[];const tail=ci>=0?queue.slice(ci+1):[...queue];if(tail.length<2){report('Nothing left to sort.');return;}const sorted=tail.slice().sort((a,b)=>{const ta=tracks.find(t=>t.id===a);const tb=tracks.find(t=>t.id===b);const aa=(ta?.album||'')+'|'+(String(ta?.trackNo||999).padStart(4,'0'))+'|'+(ta?.title||'');const bb=(tb?.album||'')+'|'+(String(tb?.trackNo||999).padStart(4,'0'))+'|'+(tb?.title||'');return aa.localeCompare(bb);});queue=[...head,...sorted];prefs.originalQueue=[...queue];save();renderQueue();report('Sorted remaining queue by album.');}),button('Sort remaining by duration',()=>{const ci=current?queue.indexOf(current.id):-1;const head=ci>=0?queue.slice(0,ci+1):[];const tail=ci>=0?queue.slice(ci+1):[...queue];if(tail.length<2){report('Nothing left to sort.');return;}const sorted=tail.slice().sort((a,b)=>{const ta=tracks.find(t=>t.id===a);const tb=tracks.find(t=>t.id===b);return (tb?.duration||0)-(ta?.duration||0);});queue=[...head,...sorted];prefs.originalQueue=[...queue];save();renderQueue();report('Sorted remaining queue by duration.');}),button('Sort remaining by year',()=>{const ci=current?queue.indexOf(current.id):-1;const head=ci>=0?queue.slice(0,ci+1):[];const tail=ci>=0?queue.slice(ci+1):[...queue];if(tail.length<2){report('Nothing left to sort.');return;}const sorted=tail.slice().sort((a,b)=>{const ta=tracks.find(t=>t.id===a);const tb=tracks.find(t=>t.id===b);const ya=ta?.year||0,yb=tb?.year||0;if(yb!==ya)return yb-ya;return (ta?.title||'').localeCompare(tb?.title||'');});queue=[...head,...sorted];prefs.originalQueue=[...queue];save();renderQueue();report('Sorted remaining queue by year.');}),button('Sort remaining by genre',()=>{const ci=current?queue.indexOf(current.id):-1;const head=ci>=0?queue.slice(0,ci+1):[];const tail=ci>=0?queue.slice(ci+1):[...queue];if(tail.length<2){report('Nothing left to sort.');return;}const sorted=tail.slice().sort((a,b)=>{const ta=tracks.find(t=>t.id===a);const tb=tracks.find(t=>t.id===b);const ga=(ta?.genre||'')+'|'+(ta?.title||'');const gb=(tb?.genre||'')+'|'+(tb?.title||'');return ga.localeCompare(gb);});queue=[...head,...sorted];prefs.originalQueue=[...queue];save();renderQueue();report('Sorted remaining queue by genre.');}),button('Sort remaining by track number',()=>{const ci=current?queue.indexOf(current.id):-1;const head=ci>=0?queue.slice(0,ci+1):[];const tail=ci>=0?queue.slice(ci+1):[...queue];if(tail.length<2){report('Nothing left to sort.');return;}const sorted=tail.slice().sort((a,b)=>{const ta=tracks.find(t=>t.id===a);const tb=tracks.find(t=>t.id===b);const na=ta?.trackNo||9999,nb=tb?.trackNo||9999;if(na!==nb)return na-nb;return (ta?.title||'').localeCompare(tb?.title||'');});queue=[...head,...sorted];prefs.originalQueue=[...queue];save();renderQueue();report('Sorted remaining queue by track number.');}),button('Sort remaining by added date',()=>{const ci=current?queue.indexOf(current.id):-1;const head=ci>=0?queue.slice(0,ci+1):[];const tail=ci>=0?queue.slice(ci+1):[...queue];if(tail.length<2){report('Nothing left to sort.');return;}const sorted=tail.slice().sort((a,b)=>{const ta=tracks.find(t=>t.id===a);const tb=tracks.find(t=>t.id===b);const ca=ta?.created||0,cb=tb?.created||0;if(cb!==ca)return cb-ca;return (ta?.title||'').localeCompare(tb?.title||'');});queue=[...head,...sorted];prefs.originalQueue=[...queue];save();renderQueue();report('Sorted remaining queue by added date.');}),button('Clear remaining',()=>{const ci=current?queue.indexOf(current.id):-1;if(ci<0||ci===queue.length-1){report('Nothing remaining to clear.');return;}queue=queue.slice(0,ci+1);prefs.originalQueue=[...queue];save();renderQueue();report('Cleared remaining queue.');}),button('Clear before current',()=>{const ci=current?queue.indexOf(current.id):-1;if(ci<=0){report('Nothing before current to clear.');return;}queue=queue.slice(ci);prefs.originalQueue=[...queue];save();renderQueue();report('Cleared tracks before current.');}),button('Remove duplicates',()=>{const seen=new Set<string>();const next=queue.filter(id=>{if(seen.has(id))return false;seen.add(id);return true;});if(next.length===queue.length){report('No duplicates in queue.');return;}queue=next;prefs.originalQueue=[...queue];save();renderQueue();report('Removed duplicate tracks from queue.');}),button('Clear all',()=>{if(!queue.length){report('Queue is already empty.');return;}void run(async()=>{if(!await askConfirm('Clear the entire queue? Playback will stop.'))return;queue=[];prefs.originalQueue=[];current=undefined;audio.pause();audio.currentTime=0;save();renderQueue();paint();report('Cleared entire queue.');});})),...(chapters.length?chapters.map(c=>button(c.title,()=>{audio.currentTime=c.start;paint();save();})):queue.map(id=>tracks.find(t=>t.id===id)).filter((t):t is AudioTrack=>!!t).map(t=>{
    const row=h('div',{class:'music-queue-row'}),up=button('Move up '+t.title,()=>move(t.id,-1)),down=button('Move down '+t.title,()=>move(t.id,1));up.disabled=queue.indexOf(t.id)===0;down.disabled=queue.indexOf(t.id)===queue.length-1;
    const reorder=(label:string,msg:string,place:(idx:number)=>number|null)=>button(label,()=>{const idx=queue.indexOf(t.id);if(idx<0)return;const item=queue.splice(idx,1)[0];const at=place(idx);if(at===null||at===idx){queue.splice(idx,0,item);return;}queue.splice(at,0,item);prefs.originalQueue=[...queue];save();renderQueue();report(msg);});
    const toTop=reorder('Move to top','Moved to top of queue.',i=>i<=0?null:0),toBottom=reorder('Move to bottom','Moved to bottom of queue.',i=>i>=queue.length?null:queue.length),afterCur=reorder('Move after current','Moved after current track.',()=>{if(!current)return null;const c=queue.indexOf(current.id);return c<0?null:c+1;}),beforeCur=reorder('Move before current','Moved before current track.',()=>{if(!current)return null;const c=queue.indexOf(current.id);return c<=0?null:c;});
    row.append(button(t.title+(t.id===current?.id?' (playing)':''),()=>select(t)),up,down,toTop,toBottom,afterCur,beforeCur,button('Remove from queue '+t.title,()=>{queue=removeTrack(queue,t.id);if(prefs.originalQueue)prefs.originalQueue=removeTrack(prefs.originalQueue,t.id);save();renderQueue();report('Removed from queue.');}));return row;
  })));
  if(!queuePanel.querySelector('button'))queuePanel.append(h('p',{class:'music-muted',text:'Your queue is empty. Add a track to play next.'}));
 }

 function saveEpisode(){
  if(current?.kind!=='podcast'||!audio.readyState)return;
  updateEpisodePosition(current.id,audio.currentTime);
  if(duration()>0&&audio.currentTime>=duration()-15){
   markEpisodePlayed(current.id,true);
  }
 }

 let nativeRequest=0;
 function mediaCall(op:string,data:unknown){
  const native=(window as unknown as {AnFAndroid?:{mediaRequest?:(id:string,op:string,json:string)=>void}}).AnFAndroid;
  if(!native?.mediaRequest)return Promise.reject(Error('Lock-screen controls are on the Android app.'));
  const id=nativeBridgeId(++nativeRequest);
  return new Promise<unknown>((resolve,reject)=>{
   const win=window as unknown as {AnFMediaResult?:(id:string,value:string,error:string)=>void;coucouMediaResult?:(id:string,value:string,error:string)=>void};
   const prevAnF=win.AnFMediaResult,prevCoucou=win.coucouMediaResult;
   const timer=setTimeout(()=>{win.AnFMediaResult=prevAnF;win.coucouMediaResult=prevCoucou;reject(Error('Android player did not respond.'));},20000);
   const handler=(rid:string,value:string,error:string)=>{
    if(rid!==id){prevAnF?.(rid,value,error);prevCoucou?.(rid,value,error);return;}
    clearTimeout(timer);win.AnFMediaResult=prevAnF;win.coucouMediaResult=prevCoucou;
    if(error)reject(Error(error));else{try{resolve(value?JSON.parse(value):{});}catch{reject(Error('Invalid Android player response.'));}}
   };
   win.AnFMediaResult=handler;win.coucouMediaResult=handler;
   native.mediaRequest!(id,op,JSON.stringify(data));
  });
 }
 async function playOnLockScreen(){
  const native=(window as unknown as {AnFAndroid?:{mediaRequest?:(id:string,op:string,json:string)=>void}}).AnFAndroid;
  if(!native?.mediaRequest){report('Lock-screen controls are on the Android app. Here, headset keys control playback.');return;}
  if(!current){report('Play something first.');return;}
  const track=current;
  const blobSize=track.streamUrl?1:track.blob.size;
  const plan=lockScreenPlan({id:track.id,name:track.name,title:track.title,artist:track.artist,album:track.album,kind:track.kind,streamUrl:track.streamUrl,blobSize});
  if(plan.kind==='stay'){report(plan.reason);return;}
  const bytes=plan.kind==='file'?new Uint8Array(await track.blob.arrayBuffer()):undefined;
  const sha256=bytes?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join(''):undefined;
  const message=await handOffLockScreen({id:track.id,name:track.name,title:track.title,artist:track.artist,album:track.album,kind:track.kind,streamUrl:track.streamUrl,blobSize,bytes,sha256},audio.currentTime||0,mediaCall);
  if(message==='Handed to the Android player.')pause();
  report(message);
 }

 function sorted(list:AudioTrack[]){
  const copy=[...list];
  if(prefs.sort==='title')return copy.sort((a,b)=>a.title.localeCompare(b.title));
  if(prefs.sort==='artist')return copy.sort((a,b)=>(a.artist||'').localeCompare(b.artist||'')||a.title.localeCompare(b.title));
  if(prefs.sort==='longest')return copy.sort((a,b)=>(b.duration||0)-(a.duration||0));
  if(prefs.sort==='shortest')return copy.sort((a,b)=>(a.duration||0)-(b.duration||0));
  if(prefs.sort==='year')return copy.sort((a,b)=>(b.year||0)-(a.year||0)||a.title.localeCompare(b.title));
  return copy.sort((a,b)=>(b.created||0)-(a.created||0));
 }

 async function playPodcastEpisode(ep:PodcastEpisode,f:PodcastFeed){
  let track=tracks.find(t=>t.id==='podcast:'+ep.id||(ep.localTrackId&&t.id===ep.localTrackId));
  if(!track){
   track={
    id:'podcast:'+ep.id,
    title:ep.title,
    artist:f.title||'Podcast',
    name:ep.title,
    album:f.title||'Podcast',
    kind:'podcast',
    blob:new Blob([],{type:ep.enclosureType||'audio/mpeg'}),
    streamUrl:ep.audioUrl,
    coverUrl:ep.image||f.image,
    duration:ep.duration,
    format:ep.enclosureType||'audio/mpeg',
    created:Date.now()
   };
  }
  await select(track,true,ep.playbackPosition||0);
 }

 function render(){
  // The streaming tab was removed in the local-first rebuild. A stale tab value
  // must never leave the hub on an empty panel.
  if(tab==='streaming')tab='music';
  const optionsOpen=root.querySelector<HTMLDetailsElement>('.music-listening-options')?.open||false;
  for(const url of artUrls)URL.revokeObjectURL(url);
  artUrls=[];
  for(const [,b] of tabButtons.entries()){
   const selected=b.id==='music-tab-'+tab;
   b.setAttribute('aria-selected',String(selected));
   b.tabIndex=selected?0:-1;
   b.classList.toggle('active',selected);
  }

  // --- TAB: PODCASTS (Two-level navigation) ---
  if(tab==='podcasts'){
   if(selectedFeed===null){
    // Level 1: Subscriptions Grid
    const feedGrid=h('div',{class:'music-feed-grid'});
    for(const f of feeds){
     const unplayed=f.episodes.filter(ep=>!ep.played).length;
     const card=h('article',{class:'music-feed-card'},
      h('div',{class:'music-feed-art'},f.image?coverImg(f.image):svg(icons.music,40,{stroke:1.2})),
      h('div',{class:'music-feed-meta'},h('strong',{text:f.title||f.url}),h('span',{text:(f.episodes.length)+' episodes · '+unplayed+' unplayed'})),
      button('Open podcast',()=>void run(async()=>{selectedFeed=f;render();})),
      button('Refresh feed',()=>void run(()=>refreshFeed(f))),
      button('Remove',()=>void run(()=>removeFeed(f)))
     );
     feedGrid.append(card);
    }

    content.replaceChildren(
     h('div',{class:'music-toolbar'},
      button('Add feed',()=>void run(addFeed)),
      button('Refresh all feeds',()=>void run(refreshFeeds))
     ),
     h('p',{class:'music-count',text:feeds.length+' podcast subscription'+(feeds.length===1?'':'s')}),
     feeds.length?feedGrid:h('p',{class:'music-empty',text:'No podcast subscriptions yet. Click "Add feed" to subscribe to any RSS feed.'})
    );
    return;
   }else{
    // Level 2: Feed Detail & Episodes List
    const f=selectedFeed;
    const header=h('div',{class:'music-feed-header'},
     h('div',{class:'music-feed-header-art'},f.image?coverImg(f.image):svg(icons.music,50,{stroke:1.2})),
     h('div',{class:'music-feed-header-info'},
      h('h3',{text:f.title||f.url}),
      h('p',{text:f.description||'Podcast subscription'}),
      h('div',{class:'music-feed-header-actions'},
       button('Refresh feed',()=>void run(async()=>{await refreshFeed(f);selectedFeed=feeds.find(x=>x.url===f.url)||f;render();})),
       button('Mark all played',()=>void run(async()=>{for(const ep of f.episodes)markEpisodePlayed(ep.id,true);render();report('All episodes marked as played.');})),
       button('Unsubscribe',()=>void run(async()=>{await removeFeed(f);selectedFeed=null;render();}))
      )
     )
    );

    const epList=h('div',{class:'music-episodes-list'});
    for(const ep of f.episodes){
     const isDownloaded=ep.downloadStatus==='downloaded'||tracks.some(t=>t.id==='podcast:'+ep.id);
     const epCard=h('article',{class:'music-episode-card'+(ep.played?' played':'')},
      h('div',{class:'music-episode-top'},
       h('h4',{class:'music-episode-title',text:ep.title}),
       h('span',{class:'music-episode-meta',text:(ep.duration?durationText(ep.duration):'')+(ep.published?' · '+ep.published:'')+(ep.played?' · (Played)':'')})
      ),
      ep.summary?h('p',{class:'music-episode-summary',text:ep.summary}):null,
      h('div',{class:'music-episode-actions'},
       button(ep.playbackPosition>0&&!ep.played?'Resume ('+durationText(ep.playbackPosition)+')':ep.played?'Play again':'Play episode',()=>void run(()=>playPodcastEpisode(ep,f)),'play'),
       button(ep.played?'Mark unplayed':'Mark played',()=>void run(async()=>{markEpisodePlayed(ep.id,!ep.played);ep.played=!ep.played;render();})),
       button(isDownloaded?'Delete download':ep.downloadStatus==='downloading'?'Downloading...':'Download offline',()=>void run(async()=>{
        if(isDownloaded){
         await removeDownloadedPodcast(library,ep.id);
         ep.downloadStatus='none';
         await refresh();
         report('Deleted downloaded episode.');
        }else{
         report('Downloading episode offline...');
         await downloadPodcastEnclosure(library,ep,f.title);
         await refresh();
         report('Episode downloaded for offline listening.');
        }
       })),
       button('Queue',()=>void run(async()=>{
        let track=tracks.find(t=>t.id==='podcast:'+ep.id);
        if(!track){
         track={id:'podcast:'+ep.id,title:ep.title,artist:f.title||'Podcast',name:ep.title,album:f.title||'Podcast',kind:'podcast',blob:new Blob([],{type:ep.enclosureType||'audio/mpeg'}),streamUrl:ep.audioUrl,coverUrl:ep.image||f.image,duration:ep.duration,format:ep.enclosureType||'audio/mpeg',created:Date.now()};
        }
        enqueue(track);
       }))
      )
     );
     epList.append(epCard);
    }

    content.replaceChildren(
     h('div',{class:'music-toolbar'},button('← Back to all feeds',()=>void run(async()=>{selectedFeed=null;render();}))),
     h('div',{class:'music-feed-detail'},header,epList)
    );
    return;
   }
  }

  // --- TAB: STREAMING (Multi-service Spicetify streaming platform) ---
  if(tab==='streaming'){
   const switcher=h('div',{class:'music-stream-tabs',role:'tablist','aria-label':'Streaming services'});
   const serviceDefs:{id:'all'|'youtube'|'spotify'|'audiobook'|'cached';label:string}[]=[
    {id:'all',label:'All Services'},
    {id:'youtube',label:'YouTube'},
    {id:'spotify',label:'Spotify / Spotube'},
    {id:'audiobook',label:'Audiobooks'},
    {id:'cached',label:'Cached Offline'}
   ];
   for(const s of serviceDefs){
    const pill=h('button',{
     type:'button',
     class:'music-pill'+(streamingServiceTab===s.id?' active':''),
     role:'tab',
     'aria-selected':String(streamingServiceTab===s.id),
     text:s.label,
     onclick:()=>void run(async()=>{
      streamingServiceTab=s.id;
      if(streamingServiceTab!=='cached'&&streamingQuery.trim()){
       streamingBusy=true;
       render();
       try{
        streamingResults=await searchMultiSource(streamingQuery.trim(),{service:streamingServiceTab,limit:30});
       }finally{
        streamingBusy=false;
        render();
       }
      }else{
       render();
      }
     })
    });
    switcher.append(pill);
   }

   const directBox=h('div',{class:'music-direct-url-box'});
   const directInput=h('input',{
    type:'url',
    placeholder:'Paste YouTube link or direct audio stream URL (MP3, M4A, Opus, WebM)...',
    'aria-label':'Direct stream link',
    value:directUrlInput,
    oninput:(e:Event)=>{directUrlInput=(e.target as HTMLInputElement).value;}
   });
   const playDirect=async()=>{
    const raw=directUrlInput.trim();
    if(!raw){report('Please paste a stream URL first.');return;}
    report('Resolving stream link...');
    try{
     const batch=await resolveBatchUrl(raw);
     if(batch&&batch.tracks.length>0){
      const audioTracks:AudioTrack[]=batch.tracks.map(t=>({
       id:'stream:'+t.id,
       title:t.title,
       artist:t.artist,
       name:t.title,
       album:t.album||batch.title,
       kind:t.source==='audiobook'?'audiobook':'music',
       blob:new Blob([],{type:'audio/mp4'}),
       streamUrl:t.streamUrl,
       coverUrl:t.coverUrl||t.artworkUrl||batch.artworkUrl,
       duration:t.duration,
       format:'audio/mp4',
       created:Date.now()
      }));
      for(const at of audioTracks){
       if(!tracks.some(x=>x.id===at.id))tracks.push(at);
       if(!queue.includes(at.id))queue.push(at.id);
      }
      await select(audioTracks[0],true);
      report(`Playing ${batch.title} (${batch.tracks.length} tracks queued)`);
      return;
     }

     const res=await resolveDirectUrl(raw);
     if(!res)throw Error('Could not resolve stream URL.');
     if(res.track.source==='custom')await verifyAudioUrl(res.stream.streamUrl);
     const track:AudioTrack={
      id:'stream:'+res.track.id,
      title:res.track.title,
      artist:res.track.artist,
      name:res.track.title,
      album:res.track.album||'Direct Stream',
      kind:res.track.source==='audiobook'?'audiobook':'music',
      blob:new Blob([],{type:res.stream.mimeType||'audio/mp4'}),
      streamUrl:res.stream.streamUrl,
      coverUrl:res.track.coverUrl||res.track.artworkUrl,
      duration:res.track.duration,
      format:res.stream.mimeType||'audio/mp4',
      created:Date.now()
     };
     await select(track,true);
     report('Playing: '+res.track.title);
    }catch(err){
     report(describeStreamError(err));
    }
   };

   const queueAllDirect=async()=>{
    const raw=directUrlInput.trim();
    if(!raw){report('Please paste a playlist or stream link first.');return;}
    report('Resolving tracks for queue...');
    try{
     const batch=await resolveBatchUrl(raw);
     if(batch&&batch.tracks.length>0){
      const audioTracks:AudioTrack[]=batch.tracks.map(t=>({
       id:'stream:'+t.id,
       title:t.title,
       artist:t.artist,
       name:t.title,
       album:t.album||batch.title,
       kind:t.source==='audiobook'?'audiobook':'music',
       blob:new Blob([],{type:'audio/mp4'}),
       streamUrl:t.streamUrl,
       coverUrl:t.coverUrl||t.artworkUrl||batch.artworkUrl,
       duration:t.duration,
       format:'audio/mp4',
       created:Date.now()
      }));
      for(const at of audioTracks){
       if(!tracks.some(x=>x.id===at.id))tracks.push(at);
       if(!queue.includes(at.id))queue.push(at.id);
      }
      save();
      renderQueue();
      paint();
      if(!current&&audioTracks.length>0){
       await select(audioTracks[0],true);
      }
      report(`Queued ${batch.tracks.length} tracks from ${batch.title}`);
      return;
     }

     const res=await resolveDirectUrl(raw);
     if(!res)throw Error('Could not resolve stream URL.');
     if(res.track.source==='custom')await verifyAudioUrl(res.stream.streamUrl);
     const track:AudioTrack={
      id:'stream:'+res.track.id,
      title:res.track.title,
      artist:res.track.artist,
      name:res.track.title,
      album:res.track.album||'Direct Stream',
      kind:res.track.source==='audiobook'?'audiobook':'music',
      blob:new Blob([],{type:res.stream.mimeType||'audio/mp4'}),
      streamUrl:res.stream.streamUrl,
      coverUrl:res.track.coverUrl||res.track.artworkUrl,
      duration:res.track.duration,
      format:res.stream.mimeType||'audio/mp4',
      created:Date.now()
     };
     if(!tracks.some(x=>x.id===track.id))tracks.push(track);
     if(!queue.includes(track.id))queue.push(track.id);
     save();
     renderQueue();
     paint();
     if(!current)await select(track,true);
     report('Queued: '+res.track.title);
    }catch(err){
     report(describeStreamError(err));
    }
   };

   const downloadAllDirect=async()=>{
    const raw=directUrlInput.trim();
    if(!raw){report('Please paste a playlist or stream link first.');return;}
    report('Resolving batch collection for offline download...');
    try{
     const batch=await resolveBatchUrl(raw);
     if(batch&&batch.tracks.length>0){
      report(`Found ${batch.tracks.length} tracks in ${batch.title}. Caching offline...`);
      let successCount=0;
      for(let i=0;i<batch.tracks.length;i++){
       const trk=batch.tracks[i];
       report(`Caching [${i+1}/${batch.tracks.length}]: ${trk.title}...`);
       try{
        const stream=await streamService.resolveStream(trk);
        if(stream?.streamUrl){
         await cacheStreamTrack(library,trk,stream.streamUrl);
         successCount++;
        }
       }catch{}
      }
      await refresh();
      report(`Downloaded ${successCount}/${batch.tracks.length} tracks from ${batch.title} offline.`);
      return;
     }

     const res=await resolveDirectUrl(raw);
     if(!res)throw Error('Could not resolve stream URL.');
     if(res.track.source==='custom')await verifyAudioUrl(res.stream.streamUrl);
     report('Caching stream offline: '+res.track.title);
     await cacheStreamTrack(library,res.track,res.stream.streamUrl);
     await refresh();
     report('Saved to library: '+res.track.title);
    }catch(err){
     report(describeStreamError(err));
    }
   };

   const saveDirect=async()=>{
    return downloadAllDirect();
   };
   directBox.append(
    directInput,
    button('Play URL',()=>void run(playDirect)),
    button('Queue All',()=>void run(queueAllDirect)),
    button('Download All Offline',()=>void run(downloadAllDirect)),
    button('Save Offline',()=>void run(saveDirect))
   );

   const doSearch=async()=>{
    if(!streamingQuery.trim())return;
    if(streamingServiceTab==='cached'){render();return;}
    streamingBusy=true;
    report(`Searching ${streamingServiceTab==='all'?'all providers':streamingServiceTab}...`);
    render();
    try{
     streamingResults=await searchMultiSource(streamingQuery.trim(),{service:streamingServiceTab,limit:30});
     render();
     report(streamingResults.length?`Found ${streamingResults.length} tracks.`:onlineLookupsEnabled()?'No streaming tracks found.':ONLINE_LOOKUPS_OFF);
    }catch(err){
     streamingResults=[];
     report(describeStreamError(err));
    }finally{
     streamingBusy=false;
     render();
    }
   };

   const searchBox=h('div',{class:'music-stream-search'},
    h('input',{
     type:'search',
     placeholder:streamingServiceTab==='cached'?'Filter cached streams...':`Search ${streamingServiceTab==='all'?'YouTube, Spotify & Audiobooks':streamingServiceTab}...`,
     value:streamingQuery,
     oninput:(e:Event)=>{
      streamingQuery=(e.target as HTMLInputElement).value;
      if(streamingServiceTab==='cached')render();
     },
     onkeydown:(e:Event)=>{if((e as KeyboardEvent).key==='Enter')void doSearch();}
    }),
    button('Search',()=>void run(doSearch))
   );

   const cachedStreamTracks=tracks.filter(t=>t.id.startsWith('stream:'));
   const resultsGrid=h('div',{class:'music-grid'});

   if(streamingServiceTab==='cached'){
    const term=streamingQuery.trim().toLowerCase();
    const visibleCached=cachedStreamTracks.filter(t=>!term||[t.title,t.artist,t.album].some(s=>s?.toLowerCase().includes(term)));
    for(const t of visibleCached){
     resultsGrid.append(card(t,visibleCached));
    }
   }else{
    for(const item of streamingResults){
     const playBtn=button('Stream '+item.title,async()=>{
      report('Resolving stream for '+item.title+'...');
      const resolved=await streamService.resolveStream(item);
      if(!resolved?.streamUrl)throw unresolvedStreamError(item);
      const track:AudioTrack={
       id:'stream:'+item.id,
       title:item.title,
       artist:item.artist,
       name:item.title,
       album:item.album||(item.source==='audiobook'?'Audiobook':'Streaming'),
       kind:item.source==='audiobook'?'audiobook':'music',
       blob:new Blob([],{type:resolved.mimeType||'audio/mp4'}),
       streamUrl:resolved.streamUrl,
       coverUrl:item.coverUrl||item.artworkUrl,
       duration:resolved.duration??item.duration,
       format:resolved.mimeType||'audio/mp4',
       created:Date.now(),
       preview:!!resolved.preview,
       chapters:item.chapters?.map(c=>({title:c.title,start:c.start}))
      };
      const follow=(resolved.parts??[]).slice(1).map((part,index):AudioTrack=>({
       id:track.id+':'+(index+2),
       title:part.title,
       artist:item.artist,
       name:part.title,
       album:item.title,
       kind:'audiobook',
       blob:new Blob([],{type:'audio/mpeg'}),
       streamUrl:part.streamUrl,
       coverUrl:item.coverUrl||item.artworkUrl,
       format:'audio/mpeg',
       created:Date.now()
      }));
      for(const part of [track,...follow]){
       const at=tracks.findIndex(t=>t.id===part.id);
       if(at>=0)tracks[at]=part;else tracks.push(part);
      }
      queue=queueWithArchiveParts(queue,track.id,follow.map(part=>part.id));
      save();
      await select(track,true);
     });
     playBtn.className='music-card-play';
     const coverWrap=h('div',{class:'music-cover'});
     if(safeHttpsUrl(item.coverUrl)||safeHttpsUrl(item.artworkUrl)){
      coverWrap.append(coverImg(safeHttpsUrl(item.coverUrl)||safeHttpsUrl(item.artworkUrl)));
     }else{
      coverWrap.append(svg(icons.music,40,{stroke:1.2}));
     }
     const badge=trackBadge(item);
     coverWrap.append(h('span',{class:`music-card-badge music-badge-${badge.kind}`,text:badge.label}));

     playBtn.replaceChildren(
      coverWrap,
      h('strong',{text:item.title}),
      h('span',{text:item.artist+(item.album?' · '+item.album:'')+(item.duration?' · '+durationText(item.duration):'')})
     );

     const cardEl=h('article',{class:'music-card'},
      playBtn,
      button('Save offline',()=>void run(async()=>{
       report('Resolving stream for offline caching...');
       const resolved=item.streamUrl?{streamUrl:item.streamUrl}:await streamService.resolveStream(item);
       if(!resolved?.streamUrl){report('No stream URL available to download.');return;}
       report('Saving streaming track offline...');
       await cacheStreamTrack(library,item,resolved.streamUrl);
       await refresh();
       report('Track saved to local library.');
      }))
     );
     resultsGrid.append(cardEl);
    }
   }

   const streamPanel=h('div',{class:'music-stream-panel'});
   streamPanel.append(
    switcher,
    directBox,
    searchBox,
    ...(streamingBusy?[h('p',{class:'music-notice',text:'Searching streaming providers...'})]:[]),
    ...(streamingServiceTab==='cached'
     ?[h('div',{},
       h('h3',{text:'Offline cached streams ('+cachedStreamTracks.length+')'}),
       cachedStreamTracks.length?resultsGrid:h('p',{class:'music-empty',text:'No cached offline streams yet. Click "Save offline" on any track.'})
      )]
     :(streamingResults.length?[h('div',{},h('h3',{text:'Search results ('+streamingResults.length+')'}),resultsGrid)]:[])),
    ...(!streamingResults.length&&streamingServiceTab!=='cached'&&!streamingBusy
     ?[h('p',{class:'music-empty',text:'Search across YouTube, Spotify, and Audiobooks, or paste any direct media link above.'})]
     :[])
   );

   content.replaceChildren(streamPanel);
   return;
  }

  // --- TAB: PLAYLISTS ---
  if(tab==='playlists'){
   content.replaceChildren(
    button('Import playlist file',()=>playlistFile.click()),
    h('p',{class:'music-muted',text:'Playlist files contain track names, not audio. Each device needs its own files.'}),
    h('div',{class:'music-playlists'},
     button('New playlist',()=>void run(async()=>{const name=await askText('Playlist name');if(!name?.trim())return;await library.savePlaylist({id:crypto.randomUUID(),name:name.trim(),order:[]});await refresh();})),
     ...playlists.map(p=>h('article',{class:'music-card'},h('strong',{text:p.name}),h('span',{text:p.order.length+' tracks'}),button('Play playlist',()=>{const list=p.order.map(id=>tracks.find(t=>t.id===id)).filter((t):t is AudioTrack=>!!t);if(!list.length){report('Empty playlist.');return;}prefs.originalQueue=list.map((item:AudioTrack)=>item.id);queue=[...prefs.originalQueue];void select(list[0]);}),button('View playlist',()=>showPlaylist(p)),button('Export playlist file',()=>exportPlaylist(p)),button('Delete playlist',()=>void run(async()=>{if(!await askConfirm('Delete '+p.name+'?'))return;await library.removePlaylist(p.id);await refresh();}))))
    )
   );
   return;
  }

  // --- TABS: MUSIC, AUDIOBOOKS, FAVORITES ---
  const list=sorted(visible()).slice(0,libraryLimit);
  const more=visible().length>libraryLimit;
  const albums=new Map<string,AudioTrack[]>();
  const artists=new Map<string,AudioTrack[]>();
  for(const t of tracks){
   if(t.album)albums.set(t.album,(albums.get(t.album)||[]).concat(t));
   if(t.artist)artists.set(t.artist,(artists.get(t.artist)||[]).concat(t));
  }

  content.replaceChildren(
   ...(tab==='audiobooks'?[
    h('div',{class:'music-audiobook-toolbar'},
     button('Rewind 15s',()=>{audio.currentTime=Math.max(0,audio.currentTime-15);save();paint();}),
     button('Forward 30s',()=>{audio.currentTime=Math.min(duration(),audio.currentTime+30);save();paint();}),
     h('div',{class:'music-toolbar-group'},h('span',{class:'music-label',text:'Speed'}),speedChips),
     h('div',{class:'music-toolbar-group'},h('span',{class:'music-label',text:'Sleep'}),sleepChips)
    )
   ]:[]),
   h('div',{class:'music-toolbar'},
    button('Import files',()=>files.click()),
    button('Import folder',()=>folder.click()),
    h('details',{class:'music-listening-options',open:optionsOpen},
     h('summary',{text:'Listening options'}),
     h('label',{},'New files',importKind),
     h('label',{},'Mix',mixes),
     button('Listening recap',showRecap)
    ),
    h('label',{class:'music-sort'},'Sort',
     h('select',{'aria-label':'Sort library',onchange:(e)=>{prefs.sort=(e.target as HTMLSelectElement).value as Preferences['sort'];save();render();}},
      ...[['newest','Newest'],['title','A–Z'],['artist','Artist'],['longest','Longest'],['shortest','Shortest'],['year','Year']].map(([v,t])=>h('option',{value:v,text:t,selected:prefs.sort===v}))
     )
    ),
    tab==='favorites'
     ?button('Play all favorites',()=>{
       const liked=tracks.filter((t:AudioTrack)=>prefs.favorites.includes(t.id));
       if(!liked.length){report('No favorites yet.');return;}
       prefs.originalQueue=liked.map((t:AudioTrack)=>t.id);
       queue=prefs.shuffle?shuffled(prefs.originalQueue):[...prefs.originalQueue];
       void select(liked[0]);
      })
     :null,
    tab==='music'
     ?button('Play all',()=>{
       const vis=visible();
       if(!vis.length){report('Nothing to play.');return;}
       prefs.originalQueue=vis.map((t:AudioTrack)=>t.id);
       queue=prefs.shuffle?shuffled(prefs.originalQueue):[...prefs.originalQueue];
       void select(vis[0]);
      })
     :null,
    tab==='music'
     ?button('Shuffle all',()=>{
       const vis=visible();
       if(!vis.length){report('Nothing to play.');return;}
       prefs.originalQueue=vis.map((t:AudioTrack)=>t.id);
       queue=shuffled(prefs.originalQueue);
       const first=tracks.find(t=>t.id===queue[0]);
       if(first)void select(first);
       report('Shuffled '+vis.length+' tracks.');
      })
     :null
   ),
   h('p',{class:'music-count',text:visible().length+' track'+(visible().length===1?'':'s')+' · '+durationText(visible().reduce((n:number,t:AudioTrack)=>n+(t.duration||0),0))+(tab==='favorites'?' liked':'')+(more?' (showing '+libraryLimit+')':'')})
  );

  if(tab==='music'&&albums.size){
   const row=h('div',{class:'music-row'});
   row.append(h('h3',{text:'Albums'}));
   for(const [name,ts] of albums){
    row.append(button(name+' ('+ts.length+')',()=>{prefs.originalQueue=ts.map((t:AudioTrack)=>t.id);queue=prefs.shuffle?shuffled(prefs.originalQueue):[...prefs.originalQueue];void select(ts[0]);}));
   }
   content.append(row);
  }

  if(artists.size){
   const row=h('div',{class:'music-row'});
   row.append(h('h3',{text:'Artists'}));
   for(const [name,ts] of artists){
    row.append(button(name+' ('+ts.length+')',()=>{prefs.originalQueue=ts.map((t:AudioTrack)=>t.id);queue=prefs.shuffle?shuffled(prefs.originalQueue):[...prefs.originalQueue];void select(ts[0]);}));
   }
   content.append(row);
  }

  const recentTracks=prefs.recent.map(id=>tracks.find(t=>t.id===id)).filter((t):t is AudioTrack=>!!t).slice(0,12);
  if(tab==='music'&&recentTracks.length){
   const row=h('div',{class:'music-row'});
   row.append(h('h3',{text:'Recently played'}));
   for(const t of recentTracks){
    row.append(button(t.title+(t.artist?' · '+t.artist:''),()=>{prefs.originalQueue=visible().map((x:AudioTrack)=>x.id);queue=prefs.shuffle?shuffled(prefs.originalQueue):[...prefs.originalQueue];void select(t);}));
   }
   content.append(row);
  }

  const broken=tab==='music'?findBrokenStreamEntries(tracks):[];
  if(broken.length)content.append(button('Remove broken stream entries ('+broken.length+')',()=>void run(async()=>{
   if(!await askConfirm('Remove '+broken.length+' broken stream '+(broken.length===1?'entry':'entries')+' ("Web Audio Stream" web pages that cannot play)? Nothing else is deleted.'))return;
   const ids=new Set(broken.map(t=>t.id));
   for(const id of ids)await library.remove(id);
   const keep=(list:string[])=>list.filter(id=>!ids.has(id));
   prefs.recent=keep(prefs.recent);prefs.favorites=keep(prefs.favorites);queue=keep(queue);prefs.originalQueue=keep(prefs.originalQueue||[]);
   for(const p of pruneIdsFromPlaylistOrders(playlists,ids))await library.savePlaylist(p);
   if(current&&ids.has(current.id)){current=undefined;audio.pause();}
   save();await refresh();report('Removed '+ids.size+' broken stream '+(ids.size===1?'entry':'entries')+'.');
  })));

  const grid=h('div',{class:'music-grid'});
  grid.append(...list.map(t=>card(t,list)));
  content.append(grid);
  if(more)content.append(button('Show more',()=>{libraryLimit+=80;render();}));
  if(!list.length)content.append(h('p',{class:'music-empty',text:tab==='favorites'?'No liked tracks yet. Heart a track to add it here.':'No tracks here. Import audio files or add a podcast feed.'}));
  markPlaying();
 }

 async function importFiles(list:File[]){
  const isLrc=(f:File)=>/\.lrc$/i.test(f.name),added:AudioTrack[]=[];let skipped=0,matched=0;
  for(const file of list.filter(f=>!isLrc(f))){
   let meta;try{meta=await readAudioMetadata(file);}catch{skipped++;continue;}
   const track:AudioTrack={
    id:crypto.randomUUID(),
    title:meta.title||file.name.replace(/\.[^.]+$/,''),
    name:file.name,
    importPath:file.webkitRelativePath||undefined,
    artist:meta.artist||'',
    album:meta.album||'',
    year:meta.year,
    genre:meta.genre,
    format:meta.format,
    trackNo:meta.trackNo,
    trackOf:meta.trackOf,
    duration:meta.duration||0,
    kind:importKind.value==='auto'?kindFromFile(file.name,meta.duration):importKind.value as 'music'|'podcast'|'audiobook',
    cover:meta.cover,
    lyrics:meta.lyrics,
    blob:file,
    created:Date.now()
   };
   await library.put(track);
   added.push(track);
  }
  const lrcs=list.filter(isLrc);
  if(lrcs.length){
   const stored=await library.tracks(),importedIds=new Set(added.map(t=>t.id));
   for(const file of lrcs){
    const t=matchLyricsTrack(file,stored,importedIds);
    if(!t||file.size>1_000_000)continue;
    const text=await file.text();
    if(!parseLyrics(text).lines.length)continue;
    t.lyrics=text;
    await library.put(t);
    matched++;
    if(t.id===current?.id){current.lyrics=text;renderLyrics();}
   }
  }
  await refresh();
  const parts=[added.length?'Imported '+added.length+' track'+(added.length>1?'s':''):'',matched?'added lyrics to '+matched+' track'+(matched>1?'s':''):'',lrcs.length>matched?(lrcs.length-matched)+' lyrics file'+(lrcs.length-matched>1?'s':'')+' had no matching track':'',skipped?'skipped '+(skipped>1?skipped+' files that are':'1 file that is')+' not audio':''].filter(Boolean);
  if(parts.length)report(parts.join('; ').replace(/^./,c=>c.toUpperCase())+'.');
 }

 async function refresh(){
  tracks=await library.tracks();
  playlists=await library.playlists();
  const trackIds=tracks.map(t=>t.id);
  queue=reconcileQueue(queue,trackIds,false);
  prefs.originalQueue=reconcileQueue(prefs.originalQueue,trackIds,false);
  render();
 }

 async function addFeed(){const url=await askText('Podcast RSS URL');if(!url?.trim())return;const normalized=substackFeedUrl(url.trim())||url.trim();const feed=await fetchFeed(normalized);feeds=[...feeds.filter(f=>f.url!==feed.url),feed];saveFeeds(feeds);await refresh();report('Feed added.');}
 async function refreshFeed(f:PodcastFeed){const updated=await fetchFeed(f.url);feeds=feeds.map(x=>x.url===f.url?updated:x);saveFeeds(feeds);await refresh();report('Feed refreshed.');}
 async function refreshFeeds(){for(const f of feeds){try{await refreshFeed(f);}catch(e){report('Could not refresh '+f.url+': '+String(e));}}}
 async function removeFeed(f:PodcastFeed){if(!await askConfirm('Remove '+(f.title||f.url)+'?'))return;feeds=feeds.filter(x=>x.url!==f.url);saveFeeds(feeds);await refresh();report('Feed removed.');}

 files.addEventListener('change',()=>{const selected=Array.from(files.files||[]);files.value='';if(selected.length)void run(()=>importFiles(selected));});
 search.addEventListener('input',()=>{libraryLimit=80;render();});
 folder.addEventListener('change',()=>{const selected=Array.from(folder.files||[]);folder.value='';if(selected.length)void run(()=>importFiles(selected));});
 seek.addEventListener('input',()=>{audio.currentTime=Number(seek.value);paint();});
 volume.addEventListener('input',()=>{audio.volume=prefs.volume=Number(volume.value);save();});
 speed.addEventListener('change',()=>{sample();audio.playbackRate=prefs.speed=Number(speed.value);ensurePreservesPitch(audio, true);resetClock();save();});
 sleep.addEventListener('change',()=>{if(sleep.value==='chapter'){armChapterSleep();return;}if(sleep.value==='end'){clearChapterSleep();if(sleepTimer){clearTimeout(sleepTimer);sleepTimer=undefined;}report('Sleep timer will stop at end of track.');return;}armSleep(Number(sleep.value));});

 audio.addEventListener('loadstart',()=>setPlaybackState('buffering'));
 audio.addEventListener('waiting',()=>setPlaybackState('buffering'));
 audio.addEventListener('canplay',()=>{
  if(playbackState==='idle')return;
  setPlaybackState(audio.paused?'ready':'playing');
 });
 audio.addEventListener('playing',()=>{
  if(playbackState==='idle'||suspended||audio.paused)return;
  resetClock();
  setPlaybackState('playing');
  if('mediaSession' in navigator)navigator.mediaSession.playbackState='playing';
  paint();
 });
 audio.addEventListener('pause',()=>{
  if(playbackState!=='ended'&&playbackState!=='error'&&playbackState!=='idle'){
   setPlaybackState('paused');
  }
  if('mediaSession' in navigator)navigator.mediaSession.playbackState='paused';
  paint();
 });
 audio.addEventListener('ended',()=>{
  setPlaybackState('ended');
  if(sleep.value==='end'){
   armSleep(0);
   sleep.value='0';
   report('Sleep timer ended playback at end of track.');
   pause();
   return;
  }
  void step(1,true);
 });
 audio.addEventListener('error',()=>{
  const err=audio.error;
  let msg='Playback error.';
  if(err){
   if(typeof MediaError!=='undefined'){
    if(err.code===MediaError.MEDIA_ERR_DECODE)msg='Audio decoding failed. The file may be corrupt.';
    else if(err.code===MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED)msg='Audio format not supported on this device.';
    else if(err.code===MediaError.MEDIA_ERR_NETWORK)msg='Network error loading audio stream.';
   }else{
    if(err.code===3)msg='Audio decoding failed. The file may be corrupt.';
    else if(err.code===4)msg='Audio format not supported on this device.';
    else if(err.code===2)msg='Network error loading audio stream.';
   }
  }
  if(current&&current.streamUrl&&!(current.blob&&current.blob.size>0)){
   prefs.recent=prefs.recent.filter(id=>id!==current!.id);
   msg=msg.replace(/\.$/,'')+'. This link did not return playable audio; try again, use a direct audio link, or import files.';
  }
  setPlaybackState('error',msg);
  report(msg);
  save();
 });
 audio.addEventListener('loadedmetadata',()=>{
  audio.defaultPlaybackRate=audio.playbackRate=prefs.speed;
  ensurePreservesPitch(audio, true);
  if(pending>0&&Number.isFinite(audio.duration)&&audio.duration>0){
   audio.currentTime=Math.min(Math.max(0,pending),audio.duration);
   pending=0;
  }
  setPlaybackState(audio.paused?'ready':'playing');
  paint();
 });
 audio.addEventListener('timeupdate',()=>{
  if(chapterStopAt!==null){
   const step=chapterSleepStep(chapterStopAt,current?.chapters,audio.currentTime||0,duration());
   chapterStopAt=step.at;
   if(step.stop){
    clearChapterSleep();
    sleep.value='0';
    pause();
    report('Sleep timer ended playback at the end of the chapter.');
    updateChips();
   }
  }
  sample();
  if(audio.currentTime){
   pending=audio.currentTime;
   if(Date.now()-lastSave>5000){lastSave=Date.now();save();}
  }
  paint();
  saveEpisode();
 });
 audio.addEventListener('seeking',()=>{lastWall=0;});
 audio.addEventListener('seeked',resetClock);

 const ready=refresh().then(async()=>{
  const t=tracks.find(t=>t.id===prefs.current);
  queue=reconcileQueue(prefs.queue,tracks.map(t=>t.id),prefs.queue.length===0);
  prefs.originalQueue=reconcileQueue(prefs.originalQueue.length?prefs.originalQueue:queue,tracks.map(t=>t.id),false);
  if(t)await select(t,false,prefs.position);
 });
 void ready.catch(e=>report('Music library unavailable: '+String(e)));

 return {
  root,
  play:resume,
  resume,
  pause,
  stop,
  suspend:()=>{
   pause();
   if(sleepTimer){clearTimeout(sleepTimer);sleepTimer=undefined;sleep.value='0';}
   clearChapterSleep();
   suspended=true;
   if(fullPlayer.open)fullPlayer.close();
   dock.hidden=true;
   document.body.classList.remove('has-music-player');
   clearMediaSession();
  },
  refresh,
  ready,
  getState:()=>playbackState,
  getError:()=>playbackError,
  step
 };
}



