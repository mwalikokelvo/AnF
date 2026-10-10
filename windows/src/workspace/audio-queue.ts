export type RepeatMode='off'|'track'|'all';
export function reconcileQueue(saved:string[],available:string[],includeNew=true):string[]{
 const valid=new Set(available),seen=new Set<string>();return (includeNew?[...saved,...available]:saved).filter(id=>valid.has(id)&&!seen.has(id)&&!!seen.add(id));
}
export function moveTrack(ids:string[],id:string,target:number):string[]{const next=ids.filter(x=>x!==id);if(!ids.includes(id))return [...ids];next.splice(Math.max(0,Math.min(next.length,target)),0,id);return next;}
export function shuffled(ids:string[],random:()=>number=Math.random):string[]{const next=[...ids];for(let i=next.length-1;i>0;i--){const j=Math.min(i,Math.max(0,Math.floor(random()*(i+1))));[next[i],next[j]]=[next[j],next[i]];}return next;}
export function nextTrack(ids:string[],current:string|undefined,repeat:RepeatMode,automatic:boolean):string|undefined{
 if(!ids.length)return;if(automatic&&repeat==='track'&&current&&ids.includes(current))return current;
 const i=current?ids.indexOf(current):-1;return ids[i+1]||(repeat==='all'?ids[0]:undefined);
}
