import {h} from '../views/dom';
export function sentences(text:string){return(text.match(/[^.!?\n]+(?:[.!?]+["”’']*|\n|$)/gu)||[text]).flatMap(s=>{const parts:string[]=[];for(let start=0;start<s.length;){let end=Math.min(s.length,start+1800);if(end<s.length&&/[\uD800-\uDBFF]/.test(s[end-1]))end--;parts.push(s.slice(start,end));start=end;}return parts;}).filter(s=>s.trim());}
let utteranceSequence=0;
const speechSession=Math.random().toString(36).slice(2,10);
let activeSpeech:(()=>void)|undefined;
export function createSpeechPlayer(beforePlay?:()=>Promise<void>){
 let parts:string[]=[],index=0,playing=false,token=0;
 const native=(window as unknown as {CoucouAndroid?:{speakPart?:(text:string,rate:number,id:string)=>void;stopSpeaking?:()=>void}}).CoucouAndroid;
 const progress=h('input',{type:'range',min:0,max:0,value:0,'aria-label':'Read-aloud sentence'}),info=h('span',{role:'status',text:'Read aloud'}),rate=h('select',{'aria-label':'Reading speed'},...[.75,1,1.25,1.5,1.75,2,2.5].map(n=>h('option',{value:n,text:n+'×'})));rate.value='1';
 const button=(text:string,fn:()=>void)=>h('button',{text,type:'button',onclick:fn});
 function stop(){
   playing=false;token++;if(activeSpeech===stop)activeSpeech=undefined;
   if(!activeSpeech){native?.stopSpeaking?.();window.speechSynthesis?.cancel();}
   play.textContent='Play';
 }
 function next(){index=Math.min(parts.length-1,index+1);if(playing)speak();else update();}
 function update(){progress.value=String(index);info.textContent=parts.length?'Sentence '+(index+1)+' of '+parts.length:'No text to read';}
 function speak(prepare=true){
   if(!parts.length)return;
   if(activeSpeech&&activeSpeech!==stop)activeSpeech();activeSpeech=stop;
   playing=true;play.textContent='Pause';const request=++token;
   native?.stopSpeaking?.();window.speechSynthesis?.cancel();update();
   const current=()=>request===token&&playing&&activeSpeech===stop;
   const failed=(message:string)=>{if(current()){stop();info.textContent=message;}};
   const done=()=>{if(!current())return;if(index+1<parts.length){index++;speak(false);}else{stop();info.textContent='Reading complete.';}};
   const start=()=>{
     if(!current())return;update();
     try{
       if(native?.speakPart){
         const id='s'+speechSession+'-'+(++utteranceSequence);
         (window as unknown as {coucouSpeechError:(id:string)=>void}).coucouSpeechError=reply=>{if(reply===id)failed('Voice unavailable. Check installed speech data.');};
         (window as unknown as {coucouSpeechDone:(id:string)=>void}).coucouSpeechDone=reply=>{if(reply===id)done();};
         native.speakPart(parts[index],Number(rate.value),id);
       }else if(window.speechSynthesis){
         const utterance=new SpeechSynthesisUtterance(parts[index]);utterance.rate=Number(rate.value);utterance.onend=done;
         utterance.onerror=()=>failed('Voice unavailable. Check installed speech data.');window.speechSynthesis.speak(utterance);
       }else failed('Read-aloud is unavailable on this device.');
     }catch{failed('Read-aloud could not start. Check installed speech data.');}
   };
   if(prepare&&beforePlay){
     info.textContent='Preparing read-aloud…';
     void Promise.resolve().then(()=>{if(current())return beforePlay();}).then(start).catch(e=>failed(String(e).replace(/^Error: /,'')));
   }else start();
 }
 const play=button('Play',()=>playing?stop():speak());
 const root=h('div',{class:'speech-player',hidden:true},info,button('Previous sentence',()=>{index=Math.max(0,index-1);if(playing)speak();else update();}),play,button('Next sentence',next),progress,rate,button('Close audio',()=>{stop();root.hidden=true;}));
 progress.addEventListener('input',()=>{index=Number(progress.value);if(playing)speak();else update();});rate.addEventListener('change',()=>{if(playing)speak();});
 return{root,stop,load(text:string){stop();parts=sentences(text);index=0;progress.max=String(Math.max(0,parts.length-1));root.hidden=false;update();if(parts.length)speak();}};
}
