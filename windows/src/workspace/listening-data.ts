export type MediaKind='music'|'podcast'|'audiobook';
export type ListeningState={positions:Record<string,number>;seconds:Record<string,number>;rate:number};
export function listeningState(value:unknown):ListeningState{
 const raw=value&&typeof value==='object'?value as Partial<ListeningState>:{};
 const numbers=(input:unknown,max:number)=>Object.fromEntries(input&&typeof input==='object'?Object.entries(input).filter(([key,n])=>key.length<180&&typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=max).slice(-10000):[]);
 return {positions:numbers(raw.positions,604800),seconds:numbers(raw.seconds,31622400),rate:[.75,1,1.25,1.5,2].includes(raw.rate!)?raw.rate!:1};
}
// Count time heard, not seek distance. Wall and media clocks must agree within
// normal timeupdate jitter; long gaps are deliberately undercounted.
export function heardSeconds(wall:number,media:number,rate:number){
 return wall>0&&wall<=3&&media>0&&Math.abs(media-wall*rate)<.5?Math.min(wall,media/rate):0;
}
export function recordListening(state:ListeningState,id:string,seconds:number,date=new Date()){
 if(!id||id.length>100||!Number.isFinite(seconds)||seconds<=0||seconds>3)return;
 const key=date.getFullYear()+'|'+id;
 state.seconds[key]=(state.seconds[key]||0)+seconds;
 const keys=Object.keys(state.seconds);if(keys.length>10000)delete state.seconds[keys[0]];
}
export function localMix<T extends {id:string}>(tracks:T[],mode:string,favorites:string[],recent:string[]){
 if(mode==='liked')return tracks.filter(t=>favorites.includes(t.id));
 if(mode==='fresh')return tracks.filter(t=>!recent.includes(t.id));
 if(mode==='recent')return recent.map(id=>tracks.find(t=>t.id===id)).filter((t):t is T=>!!t);
 return tracks;
}
export function timedLyrics(text:string){
 const result:{time:number;text:string}[]=[];
 for(const line of text.slice(0,200000).split(/\r?\n/)){
  const words=line.replace(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g,'').trim().slice(0,500);
  for(const tag of line.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)){
   if(Number(tag[2])>=60)continue;
   result.push({time:Number(tag[1])*60+Number(tag[2])+Number('0.'+(tag[3]||'0')),text:words});
   if(result.length>=5000)return result.sort((a,b)=>a.time-b.time);
  }
 }
 return result.sort((a,b)=>a.time-b.time);
}
export type PlaylistRecipe={format:'anf-playlist-1';name:string;tracks:{title:string;artist:string;name:string}[]};
export function playlistRecipe(value:unknown):PlaylistRecipe{
 if(!value||typeof value!=='object')throw Error('Invalid playlist file.');
 const v=value as PlaylistRecipe;
 if(v.format!=='anf-playlist-1'||typeof v.name!=='string'||!v.name.trim()||v.name.length>80||!Array.isArray(v.tracks)||v.tracks.length>10000)throw Error('Unsupported playlist file.');
 const tracks=v.tracks.map(t=>{if(!t||[t.title,t.artist,t.name].some(s=>typeof s!=='string'||s.length>500))throw Error('Invalid playlist item.');return {title:t.title,artist:t.artist,name:t.name};});
 return {format:'anf-playlist-1',name:v.name,tracks};
}
export function matchPlaylist<T extends {id:string;title:string;artist:string;name:string}>(recipe:PlaylistRecipe,tracks:T[]){
 const key=(t:{title:string;artist:string;name:string})=>JSON.stringify([t.title,t.artist,t.name]);
 const index=new Map<string,string|null>();for(const t of tracks){const k=key(t);index.set(k,index.has(k)?null:t.id);}
 const order:string[]=[],seen=new Set<string>();let missing=0;
 for(const item of recipe.tracks){const id=index.get(key(item));if(id){if(!seen.has(id)){order.push(id);seen.add(id);}}else missing++;}
 return {order,missing};
}
