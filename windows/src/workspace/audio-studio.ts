import {h} from '../views/dom';

import {peaks,level,wav,durationText} from './audio-data';

import {audioLibrary,orderedTracks,type AudioTrack,type AudioState} from './audio-library';

import {moveTrack,nextTrack,shuffled,type RepeatMode} from './audio-queue';

import {readAudioMetadata,formatBadge} from './audio-metadata';

import {spectralClean} from './audio-denoise';

import './audio-studio.css';



export function createAudioStudio(notify:(s:string)=>void,exportAudio?:(name:string,blob:Blob)=>Promise<void>,nativeConvert?:{convert:(id:string,blob:Blob,format:string,preset:string)=>Promise<string>;cancel:(id:string)=>Promise<void>},beforePlay?:()=>Promise<void>){

 const library=audioLibrary(),audio=new Audio();audio.preload='metadata';

 const root=h('div',{class:'audio-studio'}),message=h('p',{role:'status'}),list=h('div',{class:'audio-playlist'}),available=h('div',{class:'audio-library-tracks'});

 const file=h('input',{type:'file',multiple:true,accept:'audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg,.opus,.wma,.aiff,.alac','aria-label':'Add audio tracks'});

 const folder=h('input',{type:'file',multiple:true,webkitdirectory:'','aria-label':'Import audio folder'});

 const artwork=h('img',{class:'audio-artwork',alt:'Album artwork',hidden:true});

 const title=h('input',{'aria-label':'Audio title',maxlength:160}),artist=h('input',{'aria-label':'Audio artist',maxlength:160,placeholder:'Artist or speaker'});

 const canvas=h('canvas',{width:1000,height:160,'aria-label':'Waveform; use the position slider for keyboard seeking',role:'img'});

 const seek=h('input',{type:'range',min:0,max:1,step:.01,value:0,'aria-label':'Audio position'}),time=h('output',{text:'0:00 / 0:00'});

 const mode=h('select',{'aria-label':'Compare audio'},h('option',{value:'original',text:'Original'}),h('option',{value:'cleaned',text:'Cleaned'}));

 const hum=h('select',{'aria-label':'Hum filter'},...['Off','50 Hz','60 Hz'].map(text=>h('option',{text,value:text})));

 const rate=h('select',{'aria-label':'Export sample rate'},...[16000,22050,32000,44100,48000].map(n=>h('option',{value:n,text:n+' Hz',selected:n===32000})));

 const channels=h('select',{'aria-label':'Export channels'},h('option',{value:1,text:'Mono'}),h('option',{value:2,text:'Stereo'}));

 const repeat=h('select',{'aria-label':'Repeat mode'},...(['off','track','all'] as const).map(value=>h('option',{value,text:{off:'Repeat off',track:'Repeat track',all:'Repeat all'}[value]})));

 const meter=h('p',{class:'audio-meter',text:'Open a track to listen.'});

 const profile=h('input',{type:'checkbox','aria-label':'Use noise profile'}),noiseStart=h('input',{type:'number',min:0,step:.1,value:0,'aria-label':'Noise profile start in seconds'}),noiseLength=h('select',{'aria-label':'Noise profile duration'},h('option',{value:1,text:'1 second'}),h('option',{value:2,text:'2 seconds'}));

 const playlistName=h('input',{maxlength:80,placeholder:'Playlist name','aria-label':'Playlist name'}),playlists=h('div',{class:'audio-saved-playlists'});

 const dockTitle=h('span',{class:'audio-dock-title'}),dockTime=h('span',{class:'audio-dock-time'}),dock=h('aside',{class:'audio-dock',hidden:true,'aria-label':'Companion audio player'});

 let state:AudioState={id:'queue',order:[],repeat:'off',position:0},all:AudioTrack[]=[],track:AudioTrack|undefined,input:AudioBuffer|undefined,cleaned:AudioBuffer|undefined,context:AudioContext|undefined;

 let conversionId:string|undefined;

 let coverUrl='',originalUrl='',cleanedUrl='',frame=0,working=false,cancelled=false,epoch=0,paintAt=0,lastSave=0,wave:Float32Array=new Float32Array(0),matchGain=1,originalGain=1,pendingPosition=0,resumeAfterLoad=false,persist=Promise.resolve();

 const report=(s:string)=>{message.textContent=s;notify(s);};

 function saveState(){const snapshot={...state,order:[...state.order],current:track?.id||state.current,position:audio.readyState===0?pendingPosition:Number.isFinite(audio.currentTime)?audio.currentTime:0};persist=persist.catch(()=>{}).then(()=>library.save(snapshot));void persist.catch(()=>report('Could not save the audio queue. Check available storage.'));}

 const action=(label:string,fn:()=>void|Promise<void>)=>h('button',{text:label,type:'button',onclick:()=>void perform(fn)});

 async function perform(fn:()=>void|Promise<void>){if(working)return;working=true;cancelled=false;root.setAttribute('aria-busy','true');const controls=Array.from(root.querySelectorAll<HTMLInputElement>('button,input,select')).map(el=>({el,disabled:el.disabled}));controls.forEach(x=>x.el.disabled=true);cancel.disabled=false;try{await fn();}catch(e){report(String(e).replace(/^Error: /,''));}finally{working=false;root.removeAttribute('aria-busy');controls.forEach(x=>{if(x.el.isConnected)x.el.disabled=x.disabled;});cancel.disabled=true;}}

 const cancel=h('button',{text:'Cancel processing',disabled:true,onclick:()=>{cancelled=true;if(conversionId)void nativeConvert?.cancel(conversionId).catch(e=>report(String(e)));}});

 function duration(){return Number.isFinite(audio.duration)?audio.duration:track?.duration||0;}

 function clearPlayer(){++epoch;pendingPosition=0;resumeAfterLoad=false;audio.pause();audio.removeAttribute('src');audio.load();URL.revokeObjectURL(originalUrl);URL.revokeObjectURL(cleanedUrl);track=undefined;input=cleaned=undefined;if(coverUrl)URL.revokeObjectURL(coverUrl);coverUrl='';artwork.hidden=true;artwork.removeAttribute('src');if('mediaSession' in navigator)navigator.mediaSession.metadata=null;state.current=undefined;wave=new Float32Array(0);dock.hidden=true;document.body.classList.remove('has-audio-dock');title.value=artist.value='';originalUrl=cleanedUrl='';state.position=0;levels();paint();}
 function stop(){audio.pause();saveState();}

 function paint(){const ctx=canvas.getContext('2d');if(!ctx)return;ctx.clearRect(0,0,canvas.width,canvas.height);const ratio=duration()?audio.currentTime/duration():0;for(let i=0;i<wave.length;i++){ctx.fillStyle=i/wave.length<=ratio?'#c4a078':'#52565c';const height=Math.max(1,wave[i]*144);ctx.fillRect(i*canvas.width/wave.length,(160-height)/2,Math.max(1,canvas.width/wave.length-1),height);}seek.max=String(duration()||1);seek.value=String(audio.currentTime||0);time.textContent=durationText(audio.currentTime)+' / '+durationText(duration());dockTime.textContent=time.textContent;play.textContent=dockPlay.textContent=audio.paused?'Play':'Pause';}

 function tick(stamp:number){if(stamp-paintAt>80){paint();paintAt=stamp;}if(!audio.paused)frame=requestAnimationFrame(tick);}

 async function resume(){await beforePlay?.();mediaSession();dock.hidden=false;document.body.classList.add('has-audio-dock');await audio.play();}
 async function playAudio(){if(!track)throw Error('Open an audio track first.');if(!audio.paused){stop();return;}await resume();}

 const play=action('Play',playAudio),dockPlay=action('Play',playAudio);

 async function advance(automatic=false){const id=nextTrack(state.order,track?.id,state.repeat,automatic);if(!id){audio.currentTime=0;stop();return;}const t=all.find(t=>t.id===id);if(t){await open(t);await resume();}}

 async function previous(){if(audio.currentTime>3){audio.currentTime=0;return;}const i=state.order.indexOf(track?.id||'');const id=state.order[i-1]||(state.repeat==='all'?state.order.at(-1):state.order[0]);const t=all.find(t=>t.id===id);if(t){await open(t);await resume();}}

 function mediaSession(){if(!('mediaSession' in navigator)||!track)return;navigator.mediaSession.metadata=new MediaMetadata({title:track.title,artist:track.artist,album:track.album||'AnF local library',artwork:coverUrl?[{src:coverUrl,type:track.cover!.type}]:[]});for(const [name,fn] of Object.entries({play:()=>void resume().catch(e=>report(String(e))),pause:()=>stop(),previoustrack:()=>void perform(previous),nexttrack:()=>void perform(()=>advance()),seekbackward:()=>jump(-15),seekforward:()=>jump(15),seekto:(details:MediaSessionActionDetails)=>{if(details.seekTime!==undefined)jump(details.seekTime-audio.currentTime);}}))try{navigator.mediaSession.setActionHandler(name as MediaSessionAction,fn);}catch{/* Device does not support this action. */}}

 function levels(){const b=mode.value==='cleaned'?cleaned:input;if(!b){meter.textContent='Local playback · '+(track?[track.album,track.year,formatBadge(track)||track.blob.type||'format detected by device'].filter(Boolean).join(' · '):'')+' · '+((track?.blob.size||0)/1e6).toFixed(1)+' MB';return;}const stats=level(Array.from({length:b.numberOfChannels},(_,i)=>b.getChannelData(i)));meter.textContent=b.sampleRate+' Hz decoded · '+b.numberOfChannels+' channels · Peak '+(stats.peak?20*Math.log10(stats.peak):-Infinity).toFixed(1)+' dBFS · RMS '+(stats.rms?20*Math.log10(stats.rms):-Infinity).toFixed(1)+' dBFS';}

 async function open(t:AudioTrack,position=0){++epoch;audio.pause();if(originalUrl)URL.revokeObjectURL(originalUrl);if(cleanedUrl)URL.revokeObjectURL(cleanedUrl);originalUrl=URL.createObjectURL(t.blob);cleanedUrl='';input=cleaned=undefined;track=t;if(coverUrl)URL.revokeObjectURL(coverUrl);coverUrl=t.cover?URL.createObjectURL(t.cover):'';artwork.hidden=!coverUrl;artwork.src=coverUrl;mode.value='original';audio.volume=1;matchGain=originalGain=1;pendingPosition=position;resumeAfterLoad=false;title.value=t.title;artist.value=t.artist;wave=Float32Array.from(t.wave||[]);audio.src=originalUrl;audio.load();state.current=t.id;dock.hidden=false;document.body.classList.add('has-audio-dock');dockTitle.textContent=t.title;levels();paint();saveState();renderQueue();report('Opened '+t.title+'. Local files stay on this device.');}

 async function decode(){if(input)return input;if(!track)throw Error('Open a track first.');if(duration()>300||track.blob.size>16_000_000)throw Error('Playback supports longer tracks; waveform and speech editing require clips up to 5 minutes and 16 MB.');const token=epoch;context??=new AudioContext({sampleRate:32000});const b=await context.decodeAudioData(await track.blob.arrayBuffer());if(token!==epoch)throw Error('The selected track changed.');if(b.duration>300||b.numberOfChannels>2||b.length*b.numberOfChannels>24_000_000)throw Error('Speech editing requires mono/stereo clips up to 5 minutes.');input=b;wave=peaks(Array.from({length:b.numberOfChannels},(_,i)=>b.getChannelData(i)));track={...track,wave:Array.from(wave),duration:b.duration,sampleRate:b.sampleRate};await library.put(track);all=all.map(t=>t.id===track!.id?track!:t);levels();paint();return b;}

 function queueTracks(){return orderedTracks(all,state.order,false);}
 function renderQueue(){available.replaceChildren(...all.filter(t=>!state.order.includes(t.id)).map(t=>action('Add '+t.title+' to queue',()=>{state.order.push(t.id);saveState();renderQueue();})));if(!available.childNodes.length)available.append(h('p',{text:'All library tracks are in this queue.'}));list.replaceChildren(...queueTracks().map((t,i)=>{const row=h('div',{class:'audio-queue-row',draggable:true,'data-track-id':t.id});const openButton=action((t.id===track?.id?'▶ ':'')+t.title+(t.artist?' · '+t.artist:''),()=>open(t));openButton.setAttribute('aria-current',String(t.id===track?.id));row.append(openButton,action('↑',()=>reorder(t.id,i-1)),action('↓',()=>reorder(t.id,i+1)),action('Remove from queue',()=>{state.custom=true;state.order=state.order.filter(id=>id!==t.id);if(track?.id===t.id)clearPlayer();saveState();renderQueue();}));row.children[3].setAttribute('aria-label','Remove '+t.title+' from queue');row.children[1].setAttribute('aria-label','Move '+t.title+' up');row.children[2].setAttribute('aria-label','Move '+t.title+' down');row.addEventListener('dragstart',e=>{if(working){e.preventDefault();return;}e.dataTransfer?.setData('text/coucou-track',t.id);});row.addEventListener('dragover',e=>e.preventDefault());row.addEventListener('drop',e=>{e.preventDefault();if(!working)reorder(e.dataTransfer?.getData('text/coucou-track')||'',i);});return row;}));if(!state.order.length)list.append(h('p',{text:all.length?'Your queue is empty. Add tracks from your library below.':'Your local queue is empty. Add songs, lectures or voice notes.'}));}

 function reorder(id:string,index:number){state.order=moveTrack(state.order,id,index);saveState();renderQueue();}

 async function refresh(){all=await library.tracks();all.sort((a,b)=>a.created-b.created);state.order=orderedTracks(all,state.order,!state.custom).map(t=>t.id);renderQueue();await renderPlaylists();}

 async function renderPlaylists(){const saved=await library.playlists();playlists.replaceChildren(...saved.map(p=>h('div',{class:'audio-controls'},action(p.name+' · '+orderedTracks(all,p.order,false).length+' tracks',async()=>{state.custom=true;state.order=orderedTracks(all,p.order,false).map(t=>t.id);clearPlayer();const first=queueTracks()[0];if(first)await open(first);saveState();renderQueue();report('Loaded '+p.name+'. Only saved tracks still in your library are queued.');}),action('Delete '+p.name,async()=>{if(confirm('Delete this playlist? Files stay in the library.')){await library.removePlaylist(p.id);await renderPlaylists();}}))));}

 async function importFiles(files:File[]){await refresh();let added=0,skipped=0,skippedTags=0;for(const f of files){if(cancelled)break;if(!/\.(wav|mp3|m4a|aac|flac|ogg|opus|wma|aiff?|alac|amr)$/i.test(f.name)&&!f.type.startsWith('audio/')){skipped++;continue;}if(f.size>96_000_000||all.length>=100||all.reduce((n,t)=>n+t.blob.size,0)+f.size>384_000_000){skipped++;continue;}let metadata:Awaited<ReturnType<typeof readAudioMetadata>>={};try{metadata=await readAudioMetadata(f);}catch{skippedTags++;}const t:AudioTrack={...metadata,id:crypto.randomUUID(),title:metadata.title||f.name.replace(/\.[^.]+$/,''),artist:metadata.artist||'',name:f.name,blob:f,created:Date.now()};if(f.size<=16_000_000&&t.duration&&t.duration<=300){try{message.textContent='Caching waveform · '+t.title;context??=new AudioContext({sampleRate:32000});const b=await context.decodeAudioData(await f.arrayBuffer());if(b.duration<=300&&b.numberOfChannels<=2&&b.length*b.numberOfChannels<=24_000_000)t.wave=Array.from(peaks(Array.from({length:b.numberOfChannels},(_,i)=>b.getChannelData(i))));}catch{/* Playback may still be supported when waveform decoding is not. */}}if(cancelled)break;await library.put(t);all.push(t);state.order.push(t.id);added++;if(!track)await open(t);}saveState();renderQueue();report('Added '+added+' tracks'+(skipped?'; skipped '+skipped+' unsupported or oversized files':'')+(skippedTags?'; metadata unavailable for '+skippedTags+' files':'')+(cancelled?'; import stopped':'')+'. Keep original files as backups.');}

 for(const picker of [file,folder])picker.addEventListener('change',()=>void perform(async()=>{try{await importFiles(Array.from(picker.files||[]));}finally{picker.value='';}}));

 function swap(){if(mode.value==='cleaned'&&!cleanedUrl){mode.value='original';report('Clean this track first.');return;}if(!track)return;const p=audio.currentTime,playing=!audio.paused;audio.src=mode.value==='cleaned'?cleanedUrl:originalUrl;audio.volume=mode.value==='cleaned'?matchGain:originalGain;pendingPosition=p;resumeAfterLoad=playing;wave=mode.value==='cleaned'&&cleaned?peaks(Array.from({length:cleaned.numberOfChannels},(_,i)=>cleaned!.getChannelData(i))):Float32Array.from(track?.wave||[]);levels();paint();}

 mode.addEventListener('change',swap);seek.addEventListener('input',()=>{audio.currentTime=Math.min(duration(),Number(seek.value));paint();});seek.addEventListener('change',saveState);

 canvas.style.touchAction='none';function scrub(e:PointerEvent){if(working||!track||!audio.readyState)return;const rect=canvas.getBoundingClientRect();audio.currentTime=Math.max(0,Math.min(duration(),(e.clientX-rect.left)/rect.width*duration()));paint();}canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);scrub(e);});canvas.addEventListener('pointermove',e=>{if(canvas.hasPointerCapture(e.pointerId))scrub(e);});canvas.addEventListener('pointerup',saveState);

 function jump(delta:number){if(!track||!audio.readyState)return;audio.currentTime=Math.max(0,Math.min(duration(),audio.currentTime+delta));paint();saveState();}

 repeat.addEventListener('change',()=>{state.repeat=repeat.value as RepeatMode;saveState();});

 async function render(clean:boolean){const b=await decode();if(!clean&&mode.value==='cleaned'&&!cleaned)throw Error('Clean this track first.');audio.pause();const hz=Number(rate.value),count=Number(channels.value),length=Math.ceil(b.duration*hz);if(44+length*count*2>32_000_000)throw Error('Export exceeds 32 MB. Choose mono or a lower sample rate.');const ctx=new OfflineAudioContext(count,length,hz),src=ctx.createBufferSource();src.buffer=clean?b:mode.value==='cleaned'?cleaned!:b;

  if(clean&&profile.checked){const copy=ctx.createBuffer(b.numberOfChannels,b.length,b.sampleRate);for(let i=0;i<b.numberOfChannels;i++){const data=await spectralClean(b.getChannelData(i),b.sampleRate,Number(noiseStart.value),Number(noiseLength.value),p=>{message.textContent='Reducing steady noise · '+Math.round((i+p)/b.numberOfChannels*100)+'%';},()=>cancelled);copy.copyToChannel(new Float32Array(data),i);}src.buffer=copy;}

  let tail:AudioNode=src;if(clean){const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=80;hp.Q.value=.707;tail.connect(hp);tail=hp;if(hum.value!=='Off')for(const multiple of[1,2,3]){const notch=ctx.createBiquadFilter();notch.type='notch';notch.frequency.value=parseInt(hum.value)*multiple;notch.Q.value=25;tail.connect(notch);tail=notch;}const comp=ctx.createDynamicsCompressor();comp.threshold.value=-24;comp.knee.value=18;comp.ratio.value=3;comp.attack.value=.01;comp.release.value=.2;tail.connect(comp);tail=comp;}

  tail.connect(ctx.destination);src.start();const out=await ctx.startRendering();if(cancelled)throw Error('Audio processing cancelled.');if(clean){const data=Array.from({length:out.numberOfChannels},(_,i)=>out.getChannelData(i)),stats=level(data),gain=stats.peak>0?Math.min(2,Math.pow(10,-1/20)/stats.peak):1;for(const c of data)for(let i=0;i<c.length;i++)c[i]*=gain;}return out;

 }

 function waveBlob(b:AudioBuffer){return new Blob([wav(Array.from({length:b.numberOfChannels},(_,i)=>b.getChannelData(i)),b.sampleRate)],{type:'audio/wav'});}

 const cleanButton=action('Clean speech',async()=>{report('Processing on this device…');cleaned=await render(true);if(cleanedUrl)URL.revokeObjectURL(cleanedUrl);cleanedUrl=URL.createObjectURL(waveBlob(cleaned));const before=level(Array.from({length:input!.numberOfChannels},(_,i)=>input!.getChannelData(i))),after=level(Array.from({length:cleaned.numberOfChannels},(_,i)=>cleaned!.getChannelData(i)));matchGain=after.rms?Math.min(1,before.rms/after.rms):1;originalGain=before.rms?Math.min(1,after.rms/before.rms):1;mode.value='cleaned';swap();report('Cleaned comparison ready. Playback level is matched by attenuation; compare speech quality before exporting.');});

 const exportButton=action('Export WAV',async()=>{const b=await render(false),blob=waveBlob(b),name=(title.value.trim()||'AnF-audio').replace(/[^\p{L}\p{N}._ -]/gu,'_')+'-'+mode.value+'.wav';if(exportAudio){await exportAudio(name,blob);report('Choose a destination to save the WAV.');}else{const url=URL.createObjectURL(blob);h('a',{href:url,download:name}).click();setTimeout(()=>URL.revokeObjectURL(url),30000);report('WAV export prepared.');}});

 root.append(h('header',{},h('p',{class:'audio-eyebrow',text:'LOCAL SOUND · YOUR LIBRARY'}),h('h2',{text:'Audio Studio'})),h('div',{class:'audio-controls'},h('label',{},'Add tracks ',file),h('details',{},h('summary',{text:'Import a folder'}),folder)),h('div',{class:'audio-track-fields'},artwork,title,artist,action('Save details',async()=>{if(!track)throw Error('Open a track first.');track={...track,title:title.value.trim()||track.name,artist:artist.value.trim()};await library.put(track);dockTitle.textContent=track.title;mediaSession();await refresh();report('Saved AnF details. Embedded source tags are unchanged.');}),action('Remove',async()=>{if(!track||!confirm('Remove this track from AnF? Your original file stays unchanged.'))return;await library.remove(track.id);clearPlayer();await refresh();saveState();paint();})),canvas,seek,time,h('div',{class:'audio-controls'},action('Previous',previous),play,action('Next',()=>advance()),action('−15 seconds',()=>jump(-15)),action('+15 seconds',()=>jump(15)),mode),meter,h('details',{class:'audio-processing'},h('summary',{text:'Restore speech & export'}),h('p',{text:'Choose a noise-only section without speech. Gentle spectral subtraction reduces steady noise; strong or changing noise can leave artifacts.'}),h('div',{class:'audio-controls'},h('label',{},profile,'Use noise profile'),h('label',{},'Start (seconds) ',noiseStart),noiseLength,action('Use current position',()=>{noiseStart.value=audio.currentTime.toFixed(1);})),h('div',{class:'audio-controls'},h('label',{},'Hum ',hum),h('label',{},'Sample rate ',rate),h('label',{},'Channels ',channels),action('Cache waveform',async()=>{await decode();report('Waveform cached for this track.');}),cleanButton,exportButton)),message,cancel,h('div',{class:'audio-controls'},h('h3',{text:'Play queue'}),action('Shuffle queue',()=>{state.order=shuffled(state.order);saveState();renderQueue();}),repeat,action('Queue all library tracks',()=>{state.custom=false;state.order=orderedTracks(all,state.order).map(t=>t.id);saveState();renderQueue();})),list,h('details',{},h('summary',{text:'Add from your library'}),available),h('details',{},h('summary',{text:'Saved playlists'}),h('div',{class:'audio-controls'},playlistName,action('Save current queue',async()=>{const name=playlistName.value.trim();if(!name)throw Error('Name this playlist first.');if(!state.order.length)throw Error('Add tracks to the queue before saving a playlist.');const saved=await library.playlists();if(saved.length>=50&&!saved.some(p=>p.name===name))throw Error('Keep up to 50 saved playlists.');const existing=saved.find(p=>p.name===name);await library.savePlaylist({id:existing?.id||crypto.randomUUID(),name,order:[...state.order]});await renderPlaylists();report('Saved '+state.order.length+' tracks in '+name+'.');})),playlists),h('details',{},h('summary',{text:'Current capabilities & storage'}),h('p',{text:'Playback streams local files using your device’s codecs. Up to 100 tracks / 384 MB total; 96 MB per file. Waveform and speech editing: 5 minutes / 16 MB, mono or stereo. WAV export: 32 MB. Audio, playlists and waveform caches stay in this device’s unencrypted audio library, outside conversation backup/sync. Browser media controls and background playback depend on your device; native media services and universal codecs are not installed by this screen. Keep original files.'})));

 if(nativeConvert){

  const target=h('select',{'aria-label':'Convert format'},...['mp3','m4a','opus','ogg','flac','wav'].map(value=>h('option',{value,text:value.toUpperCase()}))),preset=h('select',{'aria-label':'Compression preset'},h('option',{value:'quality',text:'High quality'}),h('option',{value:'voice',text:'Voice / speech'}),h('option',{value:'compact',text:'Compact (Opus 32 kbps)'}));

  async function convertBatch(batch:AudioTrack[]){if(!batch.length)throw Error('Open a track first.');let completed=0;const paths:string[]=[];for(const t of batch){if(cancelled)break;if(t.blob.size>16_000_000)throw Error('Native conversion currently accepts files up to 16 MB. Completed exports were retained: '+paths.join(' · '));conversionId=crypto.randomUUID();report('Converting '+t.title+' locally…');try{paths.push(await nativeConvert!.convert(conversionId,t.blob,target.value,preset.value));completed++;}catch(e){throw Error(String(e)+' Completed exports retained: '+(paths.join(' · ')||'none'));}finally{conversionId=undefined;}}report('Exported '+completed+' files: '+paths.join(' · '));}

  root.append(h('details',{},h('summary',{text:'Native audio conversion'}),h('p',{text:'Windows FFmpeg · local-only · original files retained. Converts original audio; use Export WAV for the cleaned comparison. 16 MB input and 64 MB output per job. Exports go to AnF’s documents/audio-exports folder. MP3 voice: 128 kbps mono at 16 kHz; Opus voice: 64 kbps; compact: Opus 32 kbps. Other formats use their supported settings.'}),h('div',{class:'audio-controls'},target,preset,action('Convert current track',()=>convertBatch(track?[track]:[])),action('Convert queue',()=>convertBatch(queueTracks())))));

 }

 dock.append(dockTitle,action('Previous',previous),dockPlay,action('Next',()=>advance()),dockTime);document.body.append(dock);

 audio.addEventListener('play',()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(tick);if('mediaSession' in navigator)navigator.mediaSession.playbackState='playing';paint();});audio.addEventListener('pause',()=>{cancelAnimationFrame(frame);if('mediaSession' in navigator)navigator.mediaSession.playbackState='paused';paint();});audio.addEventListener('ended',()=>void perform(()=>advance(true)));audio.addEventListener('error',()=>report('This device cannot play this file. Try WAV, MP3 or AAC; native universal decoding is still pending.'));audio.addEventListener('loadedmetadata',()=>{audio.currentTime=Math.min(pendingPosition,duration());pendingPosition=0;if(resumeAfterLoad){resumeAfterLoad=false;void resume().catch(e=>report(String(e)));}saveState();paint();if(track&&Number.isFinite(audio.duration)&&mode.value==='original'){track={...track,duration:audio.duration};void library.put(track).catch(e=>report(String(e)));}});audio.addEventListener('timeupdate',()=>{paint();if(Date.now()-lastSave>5000){lastSave=Date.now();saveState();}});

 void (async()=>{state=await library.state();repeat.value=state.repeat;await refresh();const resume=queueTracks().find(t=>t.id===state.current);if(resume){await open(resume,state.position);dock.hidden=true;document.body.classList.remove('has-audio-dock');}})().catch(e=>report('Audio library unavailable: '+String(e)));

 document.addEventListener('anf-audio-library-changed',()=>void refresh().catch(e=>report(String(e))));
 document.addEventListener('visibilitychange',()=>{if(document.hidden)saveState();});window.addEventListener('pagehide',()=>{saveState();audio.pause();URL.revokeObjectURL(originalUrl);URL.revokeObjectURL(cleanedUrl);URL.revokeObjectURL(coverUrl);void context?.close();});

 return {root,stop,tracks:()=>queueTracks(),repeat:()=>state.repeat,hideDock:()=>{dock.hidden=true;if('mediaSession' in navigator){navigator.mediaSession.metadata=null;navigator.mediaSession.playbackState='none';}}};

}



