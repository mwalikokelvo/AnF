import {h} from '../views/dom';
import {
  createNeuralUtterancePlayer,
  getNeuralSpeechRegistration,
  neuralSpeechEnabled,
  type NeuralSpeechRegistration,
} from './neural-speech';
export function sentences(text:string){return(text.match(/[^.!?\n]+(?:[.!?]+["”’']*|\n|$)/gu)||[text]).flatMap(s=>{const parts:string[]=[];for(let start=0;start<s.length;){let end=Math.min(s.length,start+1800);if(end<s.length&&/[\uD800-\uDBFF]/.test(s[end-1]))end--;parts.push(s.slice(start,end));start=end;}return parts;}).filter(s=>s.trim());}
export type SpeechPlayerNeuralOptions = Pick<NeuralSpeechRegistration, 'disk' | 'provider' | 'config'>;
export function createSpeechPlayer(neural?: SpeechPlayerNeuralOptions){
 let parts:string[]=[],index=0,playing=false,token=0;
 let neuralPlayer:ReturnType<typeof createNeuralUtterancePlayer>|undefined;
 const native=(window as unknown as {AnFAndroid?:{speakPart?:(text:string,rate:number,id:string)=>void;stopSpeaking?:()=>void}}).AnFAndroid;
 const progress=h('input',{type:'range',min:0,max:0,value:0,'aria-label':'Read-aloud sentence'}),info=h('span',{role:'status',text:'Read aloud'}),rate=h('select',{'aria-label':'Reading speed'},...[.75,1,1.25,1.5,1.75,2,2.5].map(n=>h('option',{value:n,text:n+'×'})));rate.value='1';
 const button=(text:string,fn:()=>void)=>h('button',{text,type:'button',onclick:fn});
 function resolveNeuralRegistration():NeuralSpeechRegistration|null{
   if(!neuralSpeechEnabled())return null;
   if(neural?.provider&&neural.disk&&neural.config)return neural as NeuralSpeechRegistration;
   return getNeuralSpeechRegistration();
 }
 function neuralEngine(){const reg=resolveNeuralRegistration();if(!reg)return undefined;neuralPlayer??=createNeuralUtterancePlayer(reg);return neuralPlayer;}
 function stop(){playing=false;token++;neuralPlayer?.stop();native?.stopSpeaking?.();window.speechSynthesis?.cancel();play.textContent='Play';}
 function next(){index=Math.min(parts.length-1,index+1);if(playing)speak();else update();}
 function update(){progress.value=String(index);info.textContent=parts.length?`Sentence ${index+1} of ${parts.length}`:'No text to read';}
 function speakSystem(request:number,done:()=>void){
   if(native?.speakPart){(window as unknown as {coucouSpeechError:(id:string)=>void}).coucouSpeechError=id=>{if(id===String(request)){stop();info.textContent='Voice unavailable. Check installed speech data.';}};(window as unknown as {coucouSpeechDone:(id:string)=>void}).coucouSpeechDone=id=>{if(id===String(request))done();};native.speakPart(parts[index],Number(rate.value),String(request));}
   else if(window.speechSynthesis){const utterance=new SpeechSynthesisUtterance(parts[index]);utterance.rate=Number(rate.value);utterance.onend=done;utterance.onerror=()=>{if(request===token){stop();info.textContent='Voice unavailable. Check installed speech data.';}};window.speechSynthesis.speak(utterance);}
   else{stop();info.textContent='Read-aloud is unavailable on this device.';}}
 function speak(){if(!parts.length)return;playing=true;play.textContent='Pause';const request=++token;neuralPlayer?.stop();native?.stopSpeaking?.();window.speechSynthesis?.cancel();update();const done=()=>{if(request!==token||!playing)return;if(index+1<parts.length){index++;speak();}else{stop();info.textContent='Reading complete.';}};
   void (async()=>{const engine=neuralEngine();if(engine){const outcome=await engine.speak(parts[index],Number(rate.value),request,()=>token);if(outcome==='ok'){done();return;}if(outcome==='cancelled')return;}speakSystem(request,done);})();}
 const play=button('Play',()=>playing?stop():speak());
 const root=h('div',{class:'speech-player',hidden:true},info,button('Previous sentence',()=>{index=Math.max(0,index-1);if(playing)speak();else update();}),play,button('Next sentence',next),progress,rate,button('Close audio',()=>{stop();root.hidden=true;}));
 progress.addEventListener('input',()=>{index=Number(progress.value);if(playing)speak();else update();});rate.addEventListener('change',()=>{if(playing)speak();});
 return{root,stop,index:()=>index,load(text:string,start=0){stop();parts=sentences(text);index=Math.max(0,Math.min(parts.length-1,start|0));progress.max=String(Math.max(0,parts.length-1));root.hidden=false;update();if(parts.length)speak();}};
}
