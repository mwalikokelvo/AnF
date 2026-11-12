import {h} from '../views/dom';
export function sentences(text:string){return(text.match(/[^.!?]+(?:[.!?]+["”’']*|$)/gu)||[text]).flatMap(s=>{const parts:string[]=[];for(let start=0;start<s.length;){let end=Math.min(s.length,start+1800);if(end<s.length&&/[\uD800-\uDBFF]/.test(s[end-1]))end--;parts.push(s.slice(start,end));start=end;}return parts;}).filter(s=>s.trim());}
export interface SpeechVoiceProvider {id:string;label:string;available:()=>boolean;unavailableReason?:string;speak:(text:string,rate:number,callbacks:{onBoundary:(start:number,end:number)=>void;onEnd:()=>void;onError:(reason:string)=>void})=>{stop:()=>void;pause?:()=>void;resume?:()=>void}}
export function createSpeechPlayer(onPosition?:(start:number,end:number,word?:{start:number;end:number})=>void,beforeRead?:()=>Promise<void>){
 let parts:string[]=[],offsets:number[]=[],index=0,state:'stopped'|'preparing'|'playing'|'paused'='stopped',token=0,startEpoch=0,providers:SpeechVoiceProvider[]=[],session:ReturnType<SpeechVoiceProvider['speak']>|undefined;
 const bridge=window as unknown as {AnFAndroid?:{speakPart?:(text:string,rate:number,id:string)=>void;stopSpeaking?:()=>void;stopSpeakingConfirmed?:(id:string)=>void};AnFSpeechPauseResult?:((id:string,paused:boolean)=>void)};
 const native=bridge.AnFAndroid;
 let pauseReceipt:Promise<void>|undefined;
 function confirmNativePause(){
  if(pauseReceipt)return pauseReceipt;
  if(!native?.stopSpeakingConfirmed)return Promise.reject(Error('This Android build cannot confirm read-aloud stopped. Update the app before switching audio.'));
  const id=crypto.randomUUID(),previous=bridge.AnFSpeechPauseResult;
  pauseReceipt=new Promise<void>((resolve,reject)=>{
   let timer:ReturnType<typeof setTimeout>;
   const finish=(paused:boolean)=>{clearTimeout(timer);if(bridge.AnFSpeechPauseResult===receive)bridge.AnFSpeechPauseResult=previous;paused?resolve():reject(Error('Android read-aloud did not confirm stopping. Switching audio was stopped.'));};
   const receive=(receipt:string,paused:boolean)=>{if(receipt===id)finish(paused===true);else previous?.(receipt,paused);};
   bridge.AnFSpeechPauseResult=receive;timer=setTimeout(()=>finish(false),2500);
   try{native.stopSpeakingConfirmed!(id);}catch{finish(false);}
  }).finally(()=>{pauseReceipt=undefined;});
  return pauseReceipt;
 }
 const progress=h('input',{type:'range',min:0,max:0,value:0,'aria-label':'Read-aloud sentence'}),info=h('span',{role:'status',text:'Read aloud'}),rate=h('select',{'aria-label':'Reading speed'},...[.75,1,1.25,1.5,1.75,2,2.5].map(n=>h('option',{value:n,text:n+'×'})));rate.value='1';
 const voice=h('select',{'aria-label':'Offline reading voice'});let voices:SpeechSynthesisVoice[]=[];
 function loadVoices(){const selected=voice.value;voices=(window.speechSynthesis?.getVoices()||[]).filter(v=>v.localService);voice.replaceChildren(...(native?.speakPart?[h('option',{value:'native',text:'Installed Android voice · local'})]:voices.map((v,i)=>h('option',{value:'system:'+i,text:v.name+' · '+v.lang+' · local'}))),...providers.map(v=>h('option',{value:'provider:'+v.id,text:v.label+(v.available()?' · local':' · unavailable'),disabled:!v.available(),title:v.unavailableReason||''})));if([...voice.options].some(o=>o.value===selected))voice.value=selected;}
 loadVoices();window.speechSynthesis?.addEventListener('voiceschanged',loadVoices);
 const button=(text:string,fn:()=>void)=>h('button',{text,type:'button',onclick:fn});
 function paint(){play.textContent=state==='preparing'?'Cancel start':state==='playing'?'Pause':state==='paused'?'Resume':'Start';root.dataset.state=state;root.setAttribute('aria-busy',String(state==='preparing'));progress.value=String(index);}
 function cancel(){startEpoch++;token++;session?.stop();session=undefined;native?.stopSpeaking?.();window.speechSynthesis?.cancel();}
 function stop(){cancel();state='stopped';paint();info.textContent='Stopped · position saved.';root.dispatchEvent(new Event('speech-stop'));}
 function update(){if(parts.length)onPosition?.(offsets[index],offsets[index]+parts[index].length);progress.value=String(index);info.textContent=parts.length?`Sentence ${index+1} of ${parts.length}`:'No text to read';}
 function speak(){if(!parts.length)return;cancel();state='playing';paint();const request=token;update();
 const fail=(reason:string)=>{if(request!==token)return;stop();info.textContent=reason;};
 const done=()=>{if(request!==token||state!=='playing')return;if(index+1<parts.length){index++;speak();}else{stop();info.textContent='Reading complete.';}};
 const boundary=(start:number,end:number)=>{if(request!==token||state!=='playing')return;const text=parts[index];if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>text.length)return;onPosition?.(offsets[index],offsets[index]+text.length,{start:offsets[index]+start,end:offsets[index]+end});};
 if(voice.value.startsWith('provider:')){const provider=providers.find(v=>v.id===voice.value.slice(9));if(!provider?.available()){fail(provider?.unavailableReason||'This local voice is unavailable. Choose an installed voice explicitly.');return;}try{session=provider.speak(parts[index],Number(rate.value),{onBoundary:boundary,onEnd:done,onError:fail});}catch(e){fail(String(e));}}
 else if(native?.speakPart){(window as unknown as {AnFSpeechError:(id:string)=>void}).AnFSpeechError=id=>{if(id===String(request))fail('Voice unavailable. Check installed speech data.');};(window as unknown as {AnFSpeechDone:(id:string)=>void}).AnFSpeechDone=id=>{if(id===String(request))done();};(window as unknown as {AnFSpeechBoundary:(id:string,start:number,end:number)=>void}).AnFSpeechBoundary=(id,start,end)=>{if(id===String(request))boundary(start,end);};native.speakPart(parts[index],Number(rate.value),String(request));}
 else if(window.speechSynthesis){const available=voices[Number(voice.value.slice(7))];if(!available){fail('No offline voice is installed. Install device speech data or configure a local voice.');return;}const utterance=new SpeechSynthesisUtterance(parts[index]);utterance.voice=available;utterance.lang=available.lang;utterance.rate=Number(rate.value);utterance.onend=done;utterance.onerror=()=>fail('Voice unavailable. Check installed speech data.');utterance.onboundary=e=>{if(e.name!=='word')return;const tail=parts[index].slice(e.charIndex),length=e.charLength||tail.match(/^\S+/u)?.[0].length||0;boundary(e.charIndex,e.charIndex+length);};window.speechSynthesis.speak(utterance);}
 else fail('Read-aloud is unavailable on this device.');}
 function pause(){if(state==='preparing'){cancel();state='paused';}else if(state!=='playing')return;else if(session?.pause&&session.resume){session.pause();state='paused';}else if(!native?.speakPart&& !session &&window.speechSynthesis?.pause){window.speechSynthesis.pause();state='paused';}else{cancel();state='paused';}paint();info.textContent='Paused · resume from this sentence.';}
 async function resume(){
  if(!parts.length)return;
  const request=++startEpoch,wasPaused=state==='paused';state='preparing';paint();info.textContent='Pausing other audio…';
  try{await beforeRead?.();if(request!==startEpoch||state!=='preparing')return;
   if(wasPaused&&session?.resume){state='playing';session.resume();paint();}
   else if(wasPaused&&window.speechSynthesis?.paused&&!native?.speakPart){state='playing';window.speechSynthesis.resume();paint();}
   else speak();
  }catch{if(request===startEpoch){stop();info.textContent='Other audio could not be paused. Retry read aloud when the player responds.';}}
 }
 async function pauseForOtherAudio(){
  startEpoch++;pause();
  // Writing and the reader share the system speech queue. Revoke old callbacks
  // before clearing it, so a delayed cancellation cannot stop a new writer.
  const synth=window.speechSynthesis;
  if(synth&&(synth.speaking||synth.paused||synth.pending)){const keepPaused=state==='paused';cancel();if(keepPaused){state='paused';paint();}if(synth.speaking||synth.pending)throw Error('Read-aloud did not stop. Switching audio was stopped.');}
  const request=token;
  if(native?.speakPart){await confirmNativePause();if(request!==token)throw Error('Read-aloud changed while audio was switching. Try again.');}
 }
 async function readExternal(read:()=>void){
  stop();const request=++startEpoch;
  try{await beforeRead?.();}catch{throw Error('Other audio could not be paused. Retry read aloud when the player responds.');}
  if(request!==startEpoch)return false;
  read();return true;
 }
 const play=button('Start',()=>state==='playing'||state==='preparing'?pause():void resume());
 const root=h('div',{class:'speech-player',hidden:true,'aria-label':'Document read aloud'},info,button('Previous sentence',()=>{index=Math.max(0,index-1);if(state==='playing')speak();else{cancel();state='stopped';update();paint();}}),play,button('Stop',stop),button('Next sentence',()=>{index=Math.min(parts.length-1,index+1);if(state==='playing')speak();else{cancel();state='stopped';update();paint();}}),progress,rate,voice,button('Close audio',()=>{stop();root.hidden=true;}));
 progress.addEventListener('input',()=>{index=Number(progress.value);if(state==='playing')speak();else{cancel();state='stopped';update();paint();}});for(const control of[rate,voice])control.addEventListener('change',()=>{if(state==='playing')speak();else if(state==='paused'){cancel();state='stopped';paint();}});
 return{root,stop,pause,pauseForOtherAudio,readExternal,configureVoices(value:SpeechVoiceProvider[]){stop();providers=value;loadVoices();},load(text:string,start=0,autoplay=true){stop();parts=sentences(text);let cursor=0;offsets=parts.map(part=>{const offset=text.indexOf(part,cursor);cursor=offset+part.length;return offset;});index=Math.max(0,offsets.findIndex((n,i)=>n+parts[i].length>start));progress.max=String(Math.max(0,parts.length-1));root.hidden=false;update();if(parts.length&&autoplay)void resume();}};
}
