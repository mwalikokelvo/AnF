// Actual assembled Audio Studio / Tauri / WinRT; generated media, muted output.
(() => {
 if(window.__anfNativeSelftest)return;window.__anfNativeSelftest=true;
 const report={engineeringOnly:true,providerBacked:false,readyForPublication:false,scope:'native-studio-handoff',checks:[]};
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
   assert(await playing(),'Native playback ended before Studio handoff');
   report.phase='native-to-studio';studioPlay.click();
   await wait(()=>[...audios].some(audio=>!audio.paused&&audio.currentTime>=.2),'Actual Studio audio did not advance');
   assert(!(await request('status')).playing,'Studio did not pause native music');
   report.checks.push('Actual imported Audio Studio playback advances and pauses the real native music engine.');
   report.phase='studio-to-native';
   await wait(()=>document.querySelector('.mkr-dock button[aria-label="Play MKR Music"]:not(:disabled)'),'Native dock did not acknowledge pause',10000);
   assert([...audios].some(audio=>!audio.paused),'Studio stopped before native handoff');
   document.querySelector('.mkr-dock button[aria-label="Play MKR Music"]').click();await wait(playing,'Native playback did not resume');
   assert([...audios].every(audio=>audio.paused),'Native music did not pause actual Studio audio');
   assert(document.querySelector('.audio-dock').hidden,'Studio dock was not retired');
   assert(document.body.dataset.view==='audio','Navigation masked the Studio handoff');
   report.checks.push('Actual native dock playback pauses active Studio audio and hides its dock without leaving Audio Studio.');
   report.actualHtmlMediaPlayed=audios.size;report.passed=true;
  }catch(error){report.passed=false;report.failure=String(error).replace(/https?:\/\/[^\s]+/g,'<redacted-uri>').slice(0,1500);report.studioStatus=document.querySelector('.audio-studio > p[role="status"]')?.textContent?.slice(0,400);}
  finally{
   for(const audio of audios)audio.pause();HTMLMediaElement.prototype.play=originalPlay;
   try{await request('pause');}catch{}
   await invoke('qa_native_result',{payload:report});
  }
 })();
})();
