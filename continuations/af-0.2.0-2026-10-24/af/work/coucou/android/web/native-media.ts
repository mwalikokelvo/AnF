import {h} from '../../windows/src/views/dom';
import {durationText} from '../../windows/src/workspace/audio-data';
import type {AudioTrack} from '../../windows/src/workspace/audio-library';
type State={title:string;position:number;duration:number;playing:boolean;count:number;error:boolean};
function playbackState(value:unknown):State{
 const s=value as State;
 if(!s||typeof s.title!=='string'||typeof s.playing!=='boolean'||typeof s.error!=='boolean'||!Number.isFinite(s.position)||s.position<0||!Number.isFinite(s.duration)||s.duration<0||!Number.isInteger(s.count)||s.count<0||s.count>100)throw Error('Invalid native playback state.');
 return {title:s.title,position:s.position,duration:s.duration,playing:s.playing,count:s.count,error:s.error};
}
const pending=new Map<string,{resolve:(s:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();let sequence=0;
declare global{interface Window{coucouMediaResult:(id:string,value:string,error:string)=>void;}}
window.coucouMediaResult=(id,value,error)=>{const p=pending.get(id);if(!p)return;pending.delete(id);clearTimeout(p.timer);if(error)p.reject(Error(error));else try{p.resolve(JSON.parse(value));}catch{p.reject(Error('Invalid native audio response.'));}};
function call<T>(operation:string,data:unknown={}):Promise<T>{const native=window.CoucouAndroid;if(!native?.mediaRequest)return Promise.reject(Error('Native playback needs the updated Android app.'));const id=String(++sequence);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Native audio did not respond.'));},60000);pending.set(id,{resolve,reject,timer});try{native.mediaRequest!(id,operation,JSON.stringify(data));}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});}
function extension(t:AudioTrack){const ext=t.name.split('.').at(-1)?.toLowerCase()||'';if(!['mp3','m4a','aac','wav','flac','ogg','opus','wma','aif','aiff','amr','alac'].includes(ext))throw Error('Native playback cannot identify '+t.name);return ext;}
async function importTrack(track:AudioTrack,cancelled:()=>boolean){
 if(track.blob.size>16_000_000)throw Error('Background playback currently accepts files up to 16 MB: '+track.title);
 const bytes=new Uint8Array(await track.blob.arrayBuffer()),sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const begin=await call<{existing:boolean}>('import_begin',{track:track.id,ext:extension(track),size:bytes.length,sha256});if(begin.existing)return;
 try{for(let offset=0;offset<bytes.length;offset+=524288){if(cancelled())throw Error('Audio transfer cancelled.');const chunk=bytes.subarray(offset,offset+524288);let text='';for(let i=0;i<chunk.length;i+=8192)text+=String.fromCharCode(...chunk.subarray(i,i+8192));await call('import_chunk',{track:track.id,base64:btoa(text)});}await call('import_finish',{track:track.id});}catch(e){await call('import_abort',{track:track.id}).catch(()=>{});throw e;}
}
export function nativeMediaPanel(getTracks:()=>AudioTrack[],repeat:()=>string,stopBrowser:()=>void,notify:(s:string)=>void,beforePlay?:()=>Promise<void>){
 const root=h('details'),message=h('p',{role:'status'}),title=h('span',{class:'audio-dock-title'}),time=h('span',{class:'audio-dock-time'}),dock=h('aside',{class:'audio-dock',hidden:true,'aria-label':'Android background player'});
 let state:State={title:'',position:0,duration:0,playing:false,count:0,error:false},busy=false,cancelled=false,active=false,polling=false,generation=0,suspending=0,playIntent=0;
 const report=(s:string)=>{message.textContent=s;notify(s);};
 function render(){dock.hidden=!active||!state.count;title.textContent=state.title;time.textContent=durationText(state.position/1000)+' / '+durationText(state.duration/1000);toggle.textContent=state.playing?'Pause':'Play';if(!dock.hidden)document.body.classList.add('has-audio-dock');}
 async function command(op:string,data:unknown={}){const requested=++generation;try{const next=playbackState(await call<unknown>(op,data));const current=requested===generation;if(current){state=next;render();}return {state:next,current};}catch(e){report(String(e));throw e;}}
 function cancelPendingPlay(){playIntent++;cancelled=true;}
 const button=(text:string,op:string)=>h('button',{text,onclick:()=>{cancelPendingPlay();void command(op).catch(()=>{});}}),toggle=h('button',{text:'Play',onclick:()=>void (async()=>{
   const requested=++playIntent,op=state.playing?'pause':'play';cancelled=true;
   try{if(op==='play')await beforePlay?.();if(requested!==playIntent)return;active=true;stopBrowser();await command(op);}catch(e){if(requested===playIntent)report(String(e));}
 })()});
 const start=h('button',{text:'Play queue in background',onclick:()=>void (async()=>{if(busy)return;busy=true;cancelled=false;const requested=++playIntent;start.disabled=true;cancel.disabled=false;try{const tracks=getTracks();if(!tracks.length)throw Error('Add audio tracks first.');for(let i=0;i<tracks.length;i++){if(cancelled)throw Error('Audio transfer cancelled.');report('Preparing native playback · '+(i+1)+' / '+tracks.length);await importTrack(tracks[i],()=>cancelled||requested!==playIntent);}if(cancelled||requested!==playIntent)return;await beforePlay?.();if(cancelled||requested!==playIntent)return;cancel.disabled=true;stopBrowser();active=true;const reply=await command('queue',{items:tracks.map(t=>({track:t.id,ext:extension(t),title:t.title,artist:t.artist,album:t.album||''})),repeat:repeat()});if(requested!==playIntent||!reply.current)return;report(state.error?'This device cannot decode the selected audio.':'Native queue ready. Playback can continue while reading, writing or locking the screen.');}catch(e){if(requested===playIntent)report(String(e).replace(/^Error: /,''));}finally{busy=false;start.disabled=false;cancel.disabled=true;}})()});
 const cancel=h('button',{text:'Cancel transfer',disabled:true,onclick:()=>{cancelPendingPlay();report('Audio transfer cancelled.');}});
 root.append(h('summary',{text:'Android background playback'}),h('p',{text:'Prepare this queue for the native Android player and lock-screen controls. Native copies remain on this device, unencrypted and outside conversation backups/sync. 16 MB per track, 100 tracks / 384 MB total. Formats depend on the installed native decoders.'}),start,cancel,h('button',{text:'Clear background copies',onclick:()=>{if(busy)return;if(confirm('Stop native playback and remove its cached copies? Your Audio library and original files will remain.')){cancelPendingPlay();active=false;void command('clear').then(()=>report('Background copies cleared. Your Audio library is unchanged.')).catch(()=>{});}}}),message);
 dock.append(title,button('Previous','previous'),toggle,button('Next','next'),time,button('Stop','stop'));document.body.append(dock);
 const timer=setInterval(()=>{if(document.hidden||polling||busy||suspending)return;polling=true;const requested=generation;void call<unknown>('status').then(value=>{if(requested!==generation||suspending)return;const s=playbackState(value);state=s;if(s.playing&&!active){active=true;stopBrowser();}render();}).catch(()=>{}).finally(()=>polling=false);},1000);
 window.addEventListener('pagehide',()=>clearInterval(timer));
 return{root,suspend:async()=>{cancelPendingPlay();suspending++;try{const reply=await command('pause');if(!reply.current||reply.state.playing!==false)throw Error('Native audio did not confirm pause. Playback was not started.');active=false;}finally{suspending--;render();}}};
}
