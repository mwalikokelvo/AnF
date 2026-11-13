// Actual assembled Audio Studio / Tauri / WinRT; generated media, muted output.
(() => {
 if(window.__anfNativeSelftest)return;window.__anfNativeSelftest=true;
 const report={engineeringOnly:true,providerBacked:false,readyForPublication:false,scope:'native-studio-cancel',checks:[]};
 const assert=(condition,message)=>{if(!condition)throw Error(message);};
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(test,message,timeout=15000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await test())return;await sleep(70);}throw Error(message);};
 const invoke=(command,args={})=>window.__TAURI_INTERNALS__.invoke(command,args);
 const request=(command,payload)=>invoke('mkr_request',{command,payload});
 const byText=(selector,text)=>[...document.querySelectorAll(selector)].find(el=>el.textContent.trim()===text);
 const navigate=async id=>{
  const button=document.querySelector('.workspace-navigation [data-view="'+id+'"]');assert(button,'Missing view '+id);
  if(button.dataset.mode&&button.dataset.mode!=='keep')document.querySelector('.mode-rail [data-mode="'+button.dataset.mode+'"]')?.click();
  button.click();await wait(()=>!document.querySelector('#panel-'+id)?.hidden,'View did not open '+id);
 };
 const playing=async()=>{const state=await request('status');return state.playing&&state.positionMs>=200;};
 const audios=new Set(),originalPlay=HTMLMediaElement.prototype.play;
 (async()=>{
  try{
   await wait(()=>window.__TAURI_INTERNALS__&&document.querySelector('#panel-music'),'Workspace not ready',45000);
   report.embeddedSpotubeRuntimePresent=await invoke('music_available');
   HTMLMediaElement.prototype.play=function(...args){this.muted=true;audios.add(this);return originalPlay.apply(this,args);};
   await wait(()=>{const button=byText('.music-heading button','MKR Music');return button&&!button.hidden;},'Real engineering native source unavailable',45000);
   await navigate('music');byText('.music-heading button','MKR Music').click();
   await wait(()=>!document.querySelector('.mkr-browser').hidden,'Native browser did not open');
   const search=document.querySelector('.mkr-search input');search.value='fixture';search.dispatchEvent(new Event('input',{bubbles:true}));
   document.querySelector('.mkr-search').requestSubmit();await wait(()=>document.querySelectorAll('.mkr-result').length===2,'Generated catalog unavailable');
   document.querySelector('.mkr-result').click();await wait(playing,'Native decoder did not advance');
   await navigate('audio');
   const bytes=new ArrayBuffer(44+16000*12),view=new DataView(bytes);
   const text=(at,s)=>[...s].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
   text(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);text(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,bytes.byteLength-44,true);
   const transfer=new DataTransfer();transfer.items.add(new File([bytes],'Generated Studio QA.wav',{type:'audio/wav'}));
   const file=document.querySelector('.audio-studio input[aria-label="Add audio tracks"]');assert(file,'Studio import control missing');
   file.files=transfer.files;file.dispatchEvent(new Event('change',{bubbles:true}));
   await wait(()=>document.querySelector('.audio-studio input[aria-label="Audio title"]').value==='Generated Studio QA'&&document.querySelector('.audio-studio').getAttribute('aria-busy')!=='true','Studio import did not finish');
   const studioPlay=byText('.audio-studio .audio-controls button','Play');assert(studioPlay&&!studioPlay.disabled,'Studio playback unavailable');
   report.phase='cancel-pending-start';
   await invoke('qa_native_pause_reply_arm');
   studioPlay.click();
   await wait(()=>invoke('qa_native_pause_reply_waiting'),'Real native pause reply was not held');
   assert(!(await request('status')).playing,'Actual native pause did not complete before held reply');
   assert(audios.size===0,'Studio started before native pause acknowledgement');
   const cancel=byText('.audio-studio button','Cancel processing');assert(cancel&&!cancel.disabled,'Cancel start control unavailable');
   cancel.click();await invoke('qa_native_pause_reply_release');
   await wait(()=>document.querySelector('.audio-studio').getAttribute('aria-busy')!=='true','Cancelled Studio start did not settle');
   await sleep(200);
   assert(audios.size===0,'Cancelled Studio start reached real audio.play after the late acknowledgement');
   assert([...audios].every(audio=>audio.paused),'Cancelled Studio audio became active');
   report.checks.push('Cancelling pending Studio start prevents playback after the real native pause reply arrives.');
   report.phase='fresh-start-after-cancel';
   const retry=byText('.audio-studio .audio-controls button','Play');assert(retry&&!retry.disabled,'Fresh Studio retry unavailable');
   retry.click();await wait(()=>[...audios].some(audio=>!audio.paused&&audio.currentTime>=.2),'Fresh Studio start did not recover after cancellation');
   await wait(()=>document.querySelector('.audio-studio').getAttribute('aria-busy')!=='true','Fresh Studio start did not settle');
   byText('.audio-studio .audio-controls button','Pause').click();
   await wait(()=>[...audios].every(audio=>audio.paused),'Fresh Studio retry could not pause');
   report.checks.push('A fresh Studio start still plays real audio and pauses normally after cancellation.');
   report.actualHtmlMediaPlayed=audios.size;report.passed=true;
  }catch(error){report.passed=false;report.failure=String(error).replace(/https?:\/\/[^\s]+/g,'<redacted-uri>').slice(0,1500);report.studioStatus=document.querySelector('.audio-studio > p[role="status"]')?.textContent?.slice(0,400);}
  finally{
   try{await invoke('qa_native_pause_reply_release');}catch{}
   for(const audio of audios)audio.pause();HTMLMediaElement.prototype.play=originalPlay;
   try{await request('pause');}catch{}
   await invoke('qa_native_result',{payload:report});
  }
 })();
})();
