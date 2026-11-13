// QA-only actual WebView local speech / Tauri / WinRT acceptance. Generated text
// and media only. Volume is zero; no voice, event, clock or IPC result is mocked.
(() => {
 if(window.__anfNativeSelftest)return;window.__anfNativeSelftest=true;
 const report={engineeringOnly:true,providerBacked:false,readyForPublication:false,scope:'native-speech-handoff',checks:[]};
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
 const sample=Array(16).fill('This is generated local speech for an isolated audio handoff test with no personal information').join(', ')+'.';
 let synth,originalSpeak,wrapper,starts=0;
 const playing=async()=>{const state=await request('status');return state.playing&&state.positionMs>=200;};
 const speechActive=()=>starts>0&&synth.speaking&&!synth.paused;
 const playDock=async()=>{
  await wait(()=>document.querySelector('.mkr-dock button[aria-label="Play MKR Music"]:not(:disabled)'),'Native dock did not acknowledge paused state',10000);
  document.querySelector('.mkr-dock button[aria-label="Play MKR Music"]').click();
  await wait(playing,'Actual native playback did not start');
 };
 (async()=>{
  try{
   await wait(()=>window.__TAURI_INTERNALS__&&document.querySelector('#panel-music'),'Workspace not ready',45000);
   synth=window.speechSynthesis;assert(synth,'WebView speech synthesis unavailable');
   await wait(()=>synth.getVoices().some(v=>v.localService),'No installed local WebView speech voice',12000);
   const localIndex=synth.getVoices().findIndex(v=>v.localService);
   report.installedLocalVoiceCount=synth.getVoices().filter(v=>v.localService).length;
   originalSpeak=synth.speak;
   wrapper=function(utterance){utterance.volume=0;utterance.addEventListener('start',()=>{starts++;},{once:true});return originalSpeak.call(synth,utterance);};
   synth.speak=wrapper;assert(synth.speak===wrapper,'Cannot safely mute QA speech');
   report.phase='native-source-ready';
   await wait(()=>{const button=byText('.music-heading button','MKR Music');return button&&!button.hidden;},'Engineering native source unavailable',45000);
   await navigate('music');byText('.music-heading button','MKR Music').click();
   await wait(()=>!document.querySelector('.mkr-browser').hidden,'Native browser did not open');
   const input=document.querySelector('.mkr-search input');input.value='fixture';input.dispatchEvent(new Event('input',{bubbles:true}));
   document.querySelector('.mkr-search').requestSubmit();await wait(()=>document.querySelectorAll('.mkr-result').length===2,'Generated catalog unavailable');
   document.querySelector('.mkr-result').click();await wait(playing,'Native playback did not advance');
   await navigate('writing');
   const draft=document.querySelector('textarea[aria-label="Editable reply or document"]');assert(draft,'Draft control missing');
   draft.value=sample;draft.dispatchEvent(new Event('input',{bubbles:true}));
   const read=byText('#panel-writing button','Read aloud');assert(read,'Writing read-aloud missing');
   read.closest('details').open=true;document.querySelector('select[aria-label="Read-aloud voice"]').value=String(localIndex);
   report.phase='native-to-writing';assert(await playing(),'Native playback ended before Writing handoff');read.click();
   await wait(speechActive,'Actual installed writing voice did not start');
   assert(!(await request('status')).playing,'Writing speech did not pause native music');
   report.checks.push('Actual installed local Writing voice starts only after real native music pauses.');
   report.phase='writing-to-native';assert(speechActive(),'Writing speech ended before native handoff');await playDock();
   assert(!synth.speaking&&!synth.pending,'Native music did not stop the actual writing speech queue');
   assert(document.body.dataset.view==='writing','Navigation masked the writing handoff');
   report.checks.push('Actual native dock playback stops Writing speech without changing the open view.');
   report.phase='reader-import';await navigate('documents');
   const transfer=new DataTransfer();transfer.items.add(new File([sample],'Generated speech QA.txt',{type:'text/plain'}));
   const files=document.querySelector('input[aria-label="Choose up to four documents"]');assert(files,'Document import missing');
   files.files=transfer.files;files.dispatchEvent(new Event('change',{bubbles:true}));
   await wait(()=>{const button=byText('.document-shelf button','Open reader');return button&&!button.disabled;},'Generated document import did not finish');
   byText('.document-shelf button','Open reader').click();
   await wait(()=>{const reader=document.querySelector('.reader-overlay');return reader&&!reader.hidden;},'Reader did not open');
   const reader=document.querySelector('.reader-overlay');
   const before=starts;assert(await playing(),'Native playback ended before Reader handoff');byText('.reader-header button','Read aloud').click();
   await wait(()=>starts>before&&speechActive(),'Actual reader voice did not start');
   assert(!(await request('status')).playing,'Reader did not pause native music');
   report.phase='reader-to-native';assert(speechActive(),'Reader speech ended before native handoff');await playDock();
   assert(!synth.speaking&&!synth.pending,'Native music did not stop actual Reader speech');
   assert(!reader.hidden,'Navigation masked the Reader handoff');
   assert(reader.querySelector('.speech-player').dataset.state==='paused','Reader position was not retained as paused');
   report.checks.push('Actual Reader local speech and native music pause each other while the reader stays open.');
   report.actualSpeechStartEvents=starts;report.passed=true;
  }catch(error){report.passed=false;report.failure=String(error).replace(/https?:\/\/[^\s]+/g,'<redacted-uri>').slice(0,1500);}
  finally{
   report.actualSpeechStartEvents=starts;
   try{synth?.cancel();if(synth&&originalSpeak)synth.speak=originalSpeak;}catch{}
   try{await request('pause');}catch{}
   await invoke('qa_native_result',{payload:report});
  }
 })();
})();
