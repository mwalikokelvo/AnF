type MusicState={available?:boolean;opened?:boolean;playing?:boolean};
const pending=new Map<string,{resolve:(s:MusicState)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
let sequence=Math.floor(Math.random()*90_000_000_000)+10_000_000_000;
declare global {interface Window {coucouMusicResult:(id:string,value:string,error:string)=>void;}}
window.coucouMusicResult=(id,value,error)=>{
 const request=pending.get(id);if(!request)return;
 pending.delete(id);clearTimeout(request.timer);
 if(error){request.reject(Error(error));return;}
 try{const state=JSON.parse(value);if(!state||typeof state!=='object')throw Error();request.resolve(state);}
 catch{request.reject(Error('Invalid Music Hub response.'));}
};
function request(operation:'available'|'open'|'pause'):Promise<MusicState>{
 const api=(window as unknown as {CoucouAndroid?:{musicRequest?:(id:string,operation:string)=>void}}).CoucouAndroid;
 if(!api?.musicRequest)return Promise.resolve({available:false,playing:false});
 if(pending.size>=8)return Promise.reject(Error('Music Hub is busy. Try again.'));
 const id=String(++sequence);
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(Error('Music Hub did not respond.'));},12000);
  pending.set(id,{resolve,reject,timer});
  try{api.musicRequest!(id,operation);}catch(error){pending.delete(id);clearTimeout(timer);reject(error);}
 });
}
export function nativeMusic(){
 let available:boolean|undefined;
 return {
  async available(){const state=await request('available');available=state.available===true;return available;},
  async open(){if(!available)throw Error('Embedded music is not included in this package.');const state=await request('open');if(state.opened!==true)throw Error('Music Hub could not open.');},
  async suspend(){if(available===undefined)available=(await request('available')).available===true;if(!available)return;const state=await request('pause');if(state.playing!==false)throw Error('Music could not be paused. Playback was not started.');}
 };
}
