// AnF-owned IPC contract, not copied from MKR Music. No browser/URL launcher.
export type MkrCommand='capabilities'|'open'|'hide'|'status'|'search'|'play'|'pause'|'previous'|'next'|'seek';
export type MkrTransport=(command:MkrCommand,payload?:Record<string,unknown>)=>Promise<unknown>;
export type MkrTrack={id:string;title:string;artist:string};
export type MkrState={playing:boolean;positionMs:number;durationMs:number;track:MkrTrack|null};
const unavailable=()=>Error('Embedded MKR Music is not installed in this AnF build.');
function text(value:unknown,max:number):value is string{return typeof value==='string'&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);}
function track(value:unknown):MkrTrack{
 const t=value as MkrTrack;
 if(!t||!text(t.id,256)||!t.id||!text(t.title,1000)||!text(t.artist,1000))throw Error('Invalid MKR track response.');
 return{id:t.id,title:t.title,artist:t.artist};
}
function state(value:unknown):MkrState{
 const s=value as MkrState;
 if(!s||typeof s.playing!=='boolean'||!Number.isSafeInteger(s.positionMs)||s.positionMs<0||!Number.isSafeInteger(s.durationMs)||s.durationMs<0)throw Error('Invalid MKR playback response.');
 return{playing:s.playing,positionMs:s.positionMs,durationMs:s.durationMs,track:s.track===null?null:track(s.track)};
}
export function createMkrPlayer(transport:MkrTransport|undefined,beforePlay:()=>Promise<void>){
 let ready=false;
 async function available(){
  ready=false;if(!transport)return false;
  try{const c=await transport('capabilities') as {protocol?:number;embedded?:boolean;platform?:string};ready=!!c&&c.protocol===1&&c.embedded===true&&['android-native','windows-native'].includes(c.platform||'');}catch{/* Missing host stays unavailable; no website fallback. */}
  return ready;
 }
 async function request(command:MkrCommand,payload?:Record<string,unknown>){if(!ready||!transport)throw unavailable();return transport(command,payload);}
 async function control(command:'play'|'pause'|'previous'|'next',id?:string){
  if(!ready)throw unavailable();
  if(id!==undefined&&(!text(id,256)||!id))throw Error('Choose a valid MKR track.');
  // A pause failure must stop the handoff; two engines must not play together.
  if(command!=='pause')await beforePlay();
  return state(await request(command,id===undefined?undefined:{id}));
 }
 return{available,open:()=>request('open'),hide:()=>request('hide'),status:async()=>state(await request('status')),
  play:(id?:string)=>control('play',id),pause:()=>control('pause'),previous:()=>control('previous'),next:()=>control('next'),
  async seek(positionMs:number){if(!Number.isSafeInteger(positionMs)||positionMs<0)throw Error('Choose a valid playback position.');return state(await request('seek',{positionMs}));},
  async search(query:string){if(!text(query,500)||!query.trim())throw Error('Enter a music search of 1–500 characters.');const value=await request('search',{query:query.trim()});if(!Array.isArray(value)||value.length>100)throw Error('Invalid MKR search response.');return value.map(track);},
 };
}
