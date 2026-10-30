import {h,svg} from '../views/dom';
import {audioLibrary,type AudioTrack,type AudioPlaylist} from './audio-library';
import {readAudioMetadata,formatBadge} from './audio-metadata';
import {durationText} from './audio-data';
import {nextTrack,shuffled,reconcileQueue,type RepeatMode} from './audio-queue';
import {kindFromFile,kindLabel} from './media-kinds';
import {fetchFeed,loadFeeds,saveFeeds,substackFeedUrl,type PodcastFeed} from './podcast-feeds';
import {parseLyrics,activeLine,type Lyrics} from './lyrics';
import './music-hub.css';

const icons={play:'m8 5 11 7-11 7Z',pause:'M8 5v14M16 5v14',previous:'M5 5v14M19 5 8 12l11 7Z',next:'M19 5v14M5 5l11 7L5 19Z',heart:'M12 20 3 11C-2 3 8-1 12 6c4-7 14-3 9 5Z',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6',music:'M9 18V5l12-2v13M9 7l12-2M9 18c0 4-7 4-7 0s7-4 7 0Zm12-2c0 4-7 4-7 0s7-4 7 0Z',queue:'M3 5h18M3 11h18M3 17h12',shuffle:'M3 5h3l12 14h3M18 16l3 3-3 3M3 19h3l4-5M14 9l4-4h3M18 2l3 3-3 3',repeat:'M20 8V5H7a4 4 0 0 0-4 4M4 16v3h13a4 4 0 0 0 4-4M17 5l3 3 3-3M7 19l-3-3-3 3'};
type Preferences={current?:string;position:number;volume:number;speed:number;recent:string[];favorites:string[];queue:string[];originalQueue:string[];shuffle:boolean;repeat:RepeatMode;sort:'newest'|'title'|'artist'|'longest'};
export function createMusicHub(options:{notify:(text:string)=>void;beforePlay:()=>void|Promise<void>}){
 const library=audioLibrary(),audio=new Audio();audio.preload='metadata';
 const root=h('div',{class:'music-hub'}),content=h('div',{class:'music-content'}),notice=h('p',{class:'music-notice',role:'status'});
 const search=h('input',{type:'search',placeholder:'Search songs, artists, albums or playlists…','aria-label':'Search music'});
 const files=h('input',{type:'file',multiple:true,accept:'audio/*,.flac,.mp3,.m4a,.m4b,.ogg,.opus,.wav,.lrc','aria-label':'Import local music',hidden:true});
 const folder=h('input',{type:'file',multiple:true,webkitdirectory:'','aria-label':'Import music folder',hidden:true});
 let tracks:AudioTrack[]=[],playlists:AudioPlaylist[]=[],tab='music',feeds:PodcastFeed[]=loadFeeds(),current:AudioTrack|undefined,queue:string[]=[],epoch=0,source='',cover='',pending=0,busy=false,lastSave=0,suspended=false,libraryLimit=80;
 let prefs:Preferences={position:0,volume:.7,speed:1,recent:[],favorites:[],queue:[],originalQueue:[],shuffle:false,repeat:'off',sort:'newest'};
 try{const value=JSON.parse(localStorage.getItem('anf-music-player')||'null');if(value){prefs={current:typeof value.current==='string'?value.current:undefined,position:Number.isFinite(value.position)?Math.max(0,value.position):0,volume:Number.isFinite(value.volume)?Math.min(1,Math.max(0,value.volume)):.7,speed:[.75,1,1.25,1.5,1.75,2].includes(value.speed)?value.speed:1,recent:Array.isArray(value.recent)?value.recent.filter((s:unknown)=>typeof s==='string').slice(0,40):[],favorites:Array.isArray(value.favorites)?value.favorites.filter((s:unknown)=>typeof s==='string').slice(0,5000):[],queue:Array.isArray(value.queue)?value.queue.filter((s:unknown)=>typeof s==='string').slice(0,10000):[],originalQueue:Array.isArray(value.originalQueue)?value.originalQueue.filter((s:unknown)=>typeof s==='string').slice(0,10000):[],shuffle:value.shuffle===true,repeat:['off','track','all'].includes(value.repeat)?value.repeat:'off',sort:['newest','title','artist','longest'].includes(value.sort)?value.sort:'newest'};}}catch{/* Start with a valid empty preference record. */}
 audio.volume=prefs.volume;
 function report(text:string){notice.textContent=text;options.notify(text);}
 async function run(fn:()=>void|Promise<void>){if(busy)return;busy=true;root.setAttribute('aria-busy','true');try{await fn();}catch(e){report(String(e).replace(/^Error: /,''));}finally{busy=false;root.removeAttribute('aria-busy');}}
 const button=(label:string,fn:()=>void|Promise<void>,icon?:keyof typeof icons)=>{const b=h('button',{type:'button','aria-label':label,title:label,onclick:()=>void run(fn)});b.append(icon?svg(icons[icon],20,{stroke:1.6}):h('span',{text:label}));return b;};
 const tabs=h('div',{class:'music-tabs',role:'tablist','aria-label':'Music views'});
 const tabButtons=['Music','Audiobooks','Podcasts','Favorites','Playlists'].map(label=>{const b=button(label,()=>{tab=label.toLowerCase();libraryLimit=80;render();});b.setAttribute('role','tab');b.id='music-tab-'+label.toLowerCase();b.setAttribute('aria-controls','music-content');tabs.append(b);return b;});
 tabs.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const index=tabButtons.indexOf(document.activeElement as HTMLButtonElement);const next=event.key==='Home'?0:event.key==='End'?tabButtons.length-1:(index+(event.key==='ArrowRight'?1:tabButtons.length-1))%tabButtons.length;tabButtons[next].focus();tabButtons[next].click();});
 content.id='music-content';content.setAttribute('role','tabpanel');
 // ... (truncated for this example; in real call full content would be here)
}