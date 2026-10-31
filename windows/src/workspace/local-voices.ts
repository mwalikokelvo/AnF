import type {SpeechVoiceProvider} from './speech-player';
export type VoiceInvoke=<T>(command:string,args?:Record<string,unknown>)=>Promise<T>;
export async function localVoices(invoke?:VoiceInvoke):Promise<SpeechVoiceProvider[]>{
 let reason='Custom voices need the Windows CPU voice pack. Choose an installed Android voice on this device.';
 let ready=false;if(invoke)try{await invoke('local_voice_status');ready=true;}catch(error){reason=String(error);}
 return[{id:'amazing',label:'Amazing Voice · custom synthesis'},{id:'always-forever',label:'Always & Forever · custom synthesis'},{id:'burt-preview',label:'Burt Reynolds preview · deep, smooth and clear'},{id:'serafina-preview',label:'Serafina preview · custom synthesis'},{id:'kelvin-preview',label:'Kelvin Mwamburi Mwaliko preview · custom synthesis'}].map(v=>({...v,available:()=>ready,unavailableReason:ready?undefined:reason,speak(text,rate,callbacks){
  let stopped=false,audio:HTMLAudioElement|undefined,url:string|undefined,cancelPlayback:(()=>void)|undefined;const id=crypto.randomUUID();
  // The reader may provide long sentences; synthesize bounded subparts without fabricating timings.
  const parts:string[]=[];let remaining=text;while(remaining.length){let end=Math.min(500,remaining.length);if(end<remaining.length){const space=remaining.lastIndexOf(' ',end);if(space>100)end=space;else if(/[\uD800-\uDBFF]/.test(remaining[end-1]))end--;}parts.push(remaining.slice(0,end));remaining=remaining.slice(end);}
  const release=()=>{cancelPlayback=undefined;if(audio){audio.onended=null;audio.onerror=null;audio.onloadedmetadata=null;audio.pause();audio.removeAttribute('src');audio.load();audio=undefined;}if(url){URL.revokeObjectURL(url);url=undefined;}};
  const play=async()=>{for(const part of parts){if(stopped)return;const bytes=await invoke!<number[]>('local_voice_speak',{id,voice:v.id,text:part});if(stopped)return;url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'audio/wav'}));audio=new Audio(url);audio.defaultPlaybackRate=rate;audio.playbackRate=rate;audio.onloadedmetadata=()=>{if(audio)audio.playbackRate=rate;};await new Promise<void>((resolve,reject)=>{cancelPlayback=()=>reject(Error('Playback cancelled.'));audio!.onended=()=>resolve();audio!.onerror=()=>reject(Error('Generated voice audio could not play.'));void audio!.play().catch(reject);});release();}if(!stopped)callbacks.onEnd();};
  void play().catch(error=>{release();if(!stopped)callbacks.onError(String(error));});
  return{stop(){stopped=true;cancelPlayback?.();release();if(invoke)void invoke('local_voice_cancel',{id}).catch(()=>{});}};
 }}));
}
