import type {MkrCommand,MkrTransport} from './mkr-player';

/** One trusted Android page's native port. No global JavascriptInterface/fallback.
 * Native bootstrap must post only to the exact AnF origin and revoke on navigation.
 */
export function createMkrPortClient(target:Window,changed:(connected:boolean)=>void=()=>{},pauseOthers?:()=>Promise<void>){
 let port:MessagePort|undefined,closed=false,sequence=0,sawNativePort=false;
 const pending=new Map<string,{resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:number}>();
 const unavailable=()=>Error('Native MKR connection is unavailable. Reopen Music Hub.');
 let handoff:{token:string;cancel:()=>void}|undefined;
 function disconnect(error:Error){
  const previous=port;port=undefined;
  handoff?.cancel();handoff=undefined;
  if(previous){previous.onmessage=null;previous.onmessageerror=null;previous.close();}
  for(const request of pending.values()){target.clearTimeout(request.timer);request.reject(error);}pending.clear();
  if(previous)changed(false);
 }
 function receive(event:MessageEvent){
  if(typeof event.data!=='string'||event.data.length>512_000){disconnect(unavailable());return;}
  let reply:Record<string,unknown>;
  try{reply=JSON.parse(event.data) as Record<string,unknown>;}catch{disconnect(unavailable());return;}
  if(reply&&reply.event==='closed'&&Object.keys(reply).length===1){disconnect(unavailable());return;}
  if(reply&&reply.event==='pause-others'){
   if(Object.keys(reply).length!==2||typeof reply.token!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(reply.token)){disconnect(unavailable());return;}
   void acknowledgeAudio(reply.token);return;
  }
  if(!reply||Array.isArray(reply)||typeof reply.id!=='string'||!/^\d{1,12}$/u.test(reply.id)||
    !Object.prototype.hasOwnProperty.call(reply,'value')||!Object.prototype.hasOwnProperty.call(reply,'error')||Object.keys(reply).some(key=>!['id','value','error'].includes(key))||
    (reply.error!==null&&typeof reply.error!=='string')){disconnect(unavailable());return;}
  const request=pending.get(reply.id);if(!request)return;
  pending.delete(reply.id);target.clearTimeout(request.timer);
  if(reply.error!==null){request.reject(Error(reply.error==='Music is busy. Try again.'?reply.error:'Music request unavailable.'));return;}
  request.resolve(reply.value);
 }
 function announcement(event:MessageEvent){
  // A normal frame's postMessage has a Window source. Null origin alone is
  // never trusted: require the native sender and our own exact page origin.
  if(closed||event.source!==null||event.data!=='anf-mkr-port-v1'||event.ports.length!==1||
    !['https://anf.local','https://coucou.local'].includes(target.location.origin))return;
  disconnect(Error('Native MKR connection changed. Try again.'));
  port=event.ports[0];sawNativePort=true;port.onmessage=receive;port.onmessageerror=()=>disconnect(unavailable());port.start();changed(true);
 }
 const request=async(command:string,payload?:Record<string,unknown>)=>{
  if(closed||!port)throw unavailable();
  if(pending.size>=8)throw Error('Music is busy. Try again.');
  if(sequence>=999_999_999_999){disconnect(unavailable());throw unavailable();}
  const id=String(++sequence),data=JSON.stringify({id,command,payload:payload??{}});
  if(data.length>8192)throw Error('Music request exceeds the limit.');
  const result=await new Promise<unknown>((resolve,reject)=>{
   const timer=target.setTimeout(()=>disconnect(Error('Native MKR did not respond. Reopen Music Hub.')),
    ['search','play','previous','next'].includes(command)?30_000:8_000);
   pending.set(id,{resolve,reject,timer});
   try{port!.postMessage(data);}catch{disconnect(unavailable());}
  });
  return result;
 };
 const transport:MkrTransport=(command:MkrCommand,payload?:Record<string,unknown>)=>request(command,payload);
 async function acknowledgeAudio(token:string){
  const endpoint=port;if(!endpoint)return;
  handoff?.cancel();const current={token,cancel:()=>{}};handoff=current;
  let timer:number|undefined;
  try{
   const cancelled=new Promise<boolean>(resolve=>{current.cancel=()=>resolve(false);});
   const deadline=new Promise<boolean>(resolve=>{timer=target.setTimeout(()=>resolve(false),3500);});
   const paused=pauseOthers?Promise.resolve().then(pauseOthers).then(()=>true,()=>false):Promise.resolve(false);
   const allowed=await Promise.race([paused,cancelled,deadline]);
   if(!closed&&port===endpoint&&handoff===current)await request('audio-ack',{token,paused:allowed});
  }catch{/* Missing/stale acknowledgement never grants native playback. */}
  finally{if(timer!==undefined)target.clearTimeout(timer);if(handoff===current)handoff=undefined;}
 }
 target.addEventListener('message',announcement);
 const close=()=>{if(closed)return;closed=true;target.removeEventListener('message',announcement);target.removeEventListener('pagehide',close);disconnect(unavailable());};
 target.addEventListener('pagehide',close);
 return{transport,close,
  /** A lost approved channel cannot prove silence; block another engine then. */
  async pauseForOtherAudio(){if(sawNativePort){const state=await transport('pause') as {playing?:boolean}|null;
   if(!state||state.playing!==false)throw Error('Native MKR did not confirm pause.');}},
 };
}
