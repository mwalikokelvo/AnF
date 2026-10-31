// Test-only app-owned runner injected by the disposable Tauri host's page-load
// hook. Actual native IPC, listener, supervisor and WinRT decode; generated media.
// No production path override, debugger or mock capability/playback responses.
(() => {
 if(window.__anfNativeSelftest)return;window.__anfNativeSelftest=true;
 const report={engineeringOnly:true,providerBacked:false,readyForPublication:false,checks:[]};
 const assert=(condition,message)=>{if(!condition)throw Error(message);};
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(test,message,timeout=15000)=>{const until=Date.now()+timeout;while(Date.now()<until){if(await test())return;await sleep(80);}throw Error(message);};
 const pass=message=>report.checks.push(message);
 const invoke=(command,args={})=>window.__TAURI_INTERNALS__.invoke(command,args);
 const request=(command,payload)=>invoke('mkr_request',{command,payload});
 const byText=(selector,text)=>[...document.querySelectorAll(selector)].find(el=>el.textContent.trim()===text);
 const navigate=async(id)=>{
  const button=document.querySelector('.workspace-navigation [data-view="'+id+'"]');assert(button,'Missing navigation '+id);
  const mode=button.dataset.mode;
  if(mode&&mode!=='keep')document.querySelector('.mode-rail [data-mode="'+mode+'"]')?.click();
  button.click();await wait(()=>!document.querySelector('#panel-'+id)?.hidden,'Navigation did not open '+id);
 };
 (async()=>{
  try{
   await wait(()=>window.__TAURI_INTERNALS__&&document.querySelector('#panel-music'),'Workspace did not initialize',45000);
   report.runtime=await invoke('qa_native_info');
   await wait(()=>{const button=byText('.music-heading button','MKR Music');return button&&!button.hidden;},'No real engineering capability/source button',45000);
   assert((await request('capabilities')).embedded===true,'Native capability is unavailable');
   pass('Actual Tauri host verified the compiled engineering inventory and owned Java child.');
   await navigate('music');byText('.music-heading button','MKR Music').click();
   await wait(()=>!document.querySelector('.mkr-browser').hidden,'MKR panel did not open');
   const input=document.querySelector('.mkr-search input');input.value='fixture';input.dispatchEvent(new Event('input',{bubbles:true}));
   document.querySelector('.mkr-search').requestSubmit();
   await wait(()=>document.querySelectorAll('.mkr-result').length===2,'Generated catalog search failed');
   document.querySelector('.mkr-result').click();
   await wait(()=>!document.querySelector('.mkr-controls button:nth-child(2)').disabled,'Initial in-app playback control failed');
   await wait(async()=>{const s=await request('status');return s.playing&&s.positionMs>=200&&s.durationMs>=4000;},'Native decoder did not advance');
   pass('In-app search/result control started real muted WinRT playback with advancing position and decoded duration.');
   const slow=request('search',{query:'slow'});await sleep(200);
   const started=performance.now();assert((await request('pause')).playing===false,'Native pause failed');
   assert(performance.now()-started<1000,'Native pause blocked behind slow catalog');assert((await slow).length===2,'Slow catalog failed');
   await request('seek',{positionMs:2000});await request('play');
   await wait(async()=>{const s=await request('status');return s.playing&&s.positionMs>=2200;},'Seek/resume did not advance');
   await request('next');assert((await request('status')).track.id==='lmnopqrstuv','Next failed');
   await request('previous');assert((await request('status')).track.id==='abcdefghijk','Previous failed');
   pass('Responsive native pause during slow search, seek/resume and retained queue next/previous.');
   await navigate('chat');assert(!document.querySelector('.mkr-dock').hidden,'Dock disappeared on navigation');
   await navigate('music');await request('pause');
   // Tauri protects its JS invoke property. Fault injection lives only in the
   // disposable native snapshot, immediately before the real ack validator.
   await invoke('qa_native_ack_mode',{mode:1});
   let rejected=false;try{await request('play');}catch{rejected=true;}
   await invoke('qa_native_ack_mode',{mode:0});assert(rejected,'False pause acknowledgement started playback');
   assert(!(await request('status')).playing,'Audio started after failed acknowledgement');
   pass('Real native handoff refuses an explicitly injected failed pause acknowledgement.');
   await invoke('qa_native_ack_mode',{mode:2});
   const pending=request('play').then(()=>true,()=>false);await wait(()=>invoke('qa_native_ack_waiting'),'No actual handoff event');
   await request('pause');await invoke('qa_native_release_ack');
   assert(!(await pending),'Late acknowledgement restarted cancelled playback');
   assert(!(await request('status')).playing,'Cancelled audio advanced');
   pass('Pause invalidates an actual native command waiting for a late workspace acknowledgement.');
   report.phase='local-import';
   const audios=new Set(),realPlay=HTMLMediaElement.prototype.play;
   HTMLMediaElement.prototype.play=function(...args){this.muted=true;audios.add(this);return realPlay.apply(this,args);};
   const bytes=new ArrayBuffer(44+16000*12),v=new DataView(bytes);
   const text=(at,s)=>[...s].forEach((c,i)=>v.setUint8(at+i,c.charCodeAt(0)));
   text(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);text(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,bytes.byteLength-44,true);
   const transfer=new DataTransfer();transfer.items.add(new File([bytes],'Generated local.wav',{type:'audio/wav'}));
   const local=document.querySelector('input[aria-label="Import local music"]');local.files=transfer.files;local.dispatchEvent(new Event('change',{bubbles:true}));
   await wait(()=>document.querySelector('.music-grid .music-card button[aria-label^="Play "]'),'Local WAV import failed');
   report.phase='native-before-local';
   await request('play',{id:'abcdefghijk'});
   await wait(async()=>{const s=await request('status');return s.playing&&s.positionMs>=200;},'MKR did not advance before local handoff');
   report.phase='local-playback';
   document.querySelector('.music-grid .music-card button[aria-label^="Play "]').click();
   await wait(()=>[...audios].some(a=>!a.paused&&a.currentTime>0),'Real local WAV did not advance');
   assert(!(await request('status')).playing,'Local WAV did not pause MKR');
   report.phase='native-after-local';
   document.querySelector('.mkr-result').click();
   // Wait for the real UI command to finish. Polling native status while its
   // old lease is being replaced can legitimately report the retired source.
   await wait(()=>!document.querySelector('.mkr-controls button:nth-child(2)').disabled,'In-app MKR playback did not acknowledge replacing local audio');
   await wait(async()=>{const s=await request('status');return s.playing&&s.positionMs>=200;},'MKR did not resume after local WAV');
   assert([...audios].every(a=>a.paused),'MKR did not pause actual local WAV');
   HTMLMediaElement.prototype.play=realPlay;
   pass('Actual local WAV and actual native MKR pause each other through production handoff callbacks.');
   await request('pause');report.passed=true;
  }catch(error){report.passed=false;report.failure=String(error).replace(/https?:\/\/[^\s]+/g,'<redacted-uri>').slice(0,1500);try{await request('open');}catch(cause){report.nativeOpenFailure=String(cause).slice(0,500);}}
  finally{
   try{await invoke('qa_native_ack_mode',{mode:0});}catch{}
   try{await request('pause');}catch{}
   await invoke('qa_native_result',{payload:report});
  }
 })();
})();
