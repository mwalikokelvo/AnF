import {h} from '../views/dom';
import {createMkrPlayer,type MkrState,type MkrTrack,type MkrTransport} from './mkr-player';
import {durationText} from './audio-data';
import './mkr-browser.css';

/** In-app UI adapter, not an availability claim. The caller must attach the dock
 * outside its navigable panel and supply a real packaged native transport. */
export function createMkrBrowser(options:{transport:MkrTransport|undefined;beforePlay:()=>Promise<void>;notify:(message:string)=>void}){
  const api=createMkrPlayer(options.transport,options.beforePlay);
  const root=h('section',{class:'mkr-browser',hidden:true,'aria-label':'Embedded MKR Music'});
  const dock=h('aside',{class:'music-player mkr-dock',hidden:true,'aria-label':'MKR Music player'});
  const input=h('input',{type:'search',maxlength:500,placeholder:'Find a song or artist','aria-label':'Search MKR Music'});
  const search=h('button',{type:'submit',text:'Search'});
  const form=h('form',{class:'mkr-search'},input,search);
  const feedback=h('p',{class:'hint',role:'status'});
  const results=h('div',{class:'mkr-results','aria-label':'MKR search results'});
  const title=h('strong'),artist=h('span'),elapsed=h('span'),total=h('span');
  const seek=h('input',{type:'range',min:0,max:1,value:0,step:1000,'aria-label':'MKR playback position'});
  const toggle=h('button',{type:'button',text:'Play','aria-label':'Play MKR Music'});
  const previous=h('button',{type:'button',text:'Previous','aria-label':'Previous MKR track'});
  const next=h('button',{type:'button',text:'Next','aria-label':'Next MKR track'});
  const check=h('button',{type:'button',text:'Check player',hidden:true});
  const doc=root.ownerDocument;
  let ready=false,disposed=false,closing=false,searching=false,controlling=false,polling=false,epoch=0,revision=0;
  let commandDone:Promise<void>=Promise.resolve(),disposal:Promise<void>|undefined;
  let dockSuppressed=false;
  let state:MkrState={playing:false,positionMs:0,durationMs:0,track:null};
  let timer:ReturnType<typeof setTimeout>|undefined;
  const dockSize=new ResizeObserver(()=>{doc.body.style.setProperty('--mkr-player-height',Math.ceil(dock.getBoundingClientRect().height)+'px');});
  dockSize.observe(dock);
  function stopTimer(){if(timer!==undefined)clearTimeout(timer);timer=undefined;}
  function paint(){
    doc.body.classList.toggle('has-mkr-player',!dock.hidden&&!disposed);
    title.textContent=state.track?.title||'MKR Music';artist.textContent=state.track?.artist||'';
    toggle.textContent=state.playing?'Pause':'Play';toggle.setAttribute('aria-label',state.playing?'Pause MKR Music':'Play MKR Music');
    for(const button of [toggle,previous,next])button.disabled=closing||controlling||!ready||!state.track||!check.hidden;
    seek.disabled=closing||controlling||!ready||!state.track||state.durationMs===0||!check.hidden;
    check.disabled=closing||controlling||!ready;
    seek.max=String(Math.max(1,state.durationMs));seek.value=String(Math.min(state.positionMs,state.durationMs));
    elapsed.textContent=durationText(state.positionMs/1000);total.textContent=durationText(state.durationMs/1000);
    seek.setAttribute('aria-valuetext',elapsed.textContent+' of '+total.textContent);
  }
  function failed(message:string){stopTimer();check.hidden=false;feedback.textContent=message;options.notify(message);}
  function schedule(){
    stopTimer();if(disposed||closing||!ready||!state.track||doc.hidden||check.hidden===false)return;
    timer=setTimeout(()=>void refresh(),state.playing?1000:5000);
  }
  async function refresh(recover=false){
    if(disposed||closing||!ready||polling)return;
    if(controlling){schedule();return;}
    polling=true;const request=revision;
    try{const next=await api.status();if(disposed||closing||request!==revision)return;state=next;if(recover){check.hidden=true;feedback.textContent=state.playing?'Playing inside AnF.':'Paused.';}dock.hidden=!state.track||dockSuppressed;paint();schedule();}
    catch{if(!disposed&&!closing&&request===revision)failed('MKR player status is unavailable. Check the player before continuing.');}
    finally{polling=false;}
  }
  async function control(action:()=>Promise<MkrState>){
    if(disposed||closing||!ready||controlling)return;
    let finished!:()=>void;commandDone=new Promise<void>(resolve=>{finished=resolve;});
    controlling=true;revision++;stopTimer();paint();
    try{const next=await action();if(disposed)return;state=next;check.hidden=true;dockSuppressed=false;dock.hidden=!state.track;feedback.textContent=state.playing?'Playing inside AnF.':'Paused.';}
    catch{if(!disposed)failed('MKR playback could not start. No external player was opened.');}
    finally{controlling=false;finished();if(!disposed){paint();schedule();}}
  }
  async function available(){
    if(disposed)return false;
    ready=await api.available();
    if(disposed)return false;
    if(!ready){root.hidden=true;dock.hidden=true;stopTimer();}
    paint();return ready;
  }
  async function open(){
    if(disposed||(!ready&&!await available()))return false;
    try{await api.open();if(disposed||closing)return false;root.hidden=false;dockSuppressed=false;input.focus();void refresh();return true;}
    catch{failed('Embedded MKR Music is unavailable in this build.');return false;}
  }
  async function hide(){
    epoch++;root.hidden=true;
    if(ready&&!disposed)try{await api.hide();}catch{failed('The MKR view could not be hidden.');}
    // Hiding navigation keeps native audio and its dock available.
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();if(!ready||disposed||closing||searching)return;
    const query=input.value.trim();if(!query){feedback.textContent='Enter a song or artist.';input.focus();return;}
    const request=++epoch;searching=true;search.disabled=true;results.replaceChildren();feedback.textContent='Searching MKR Music…';
    void api.search(query).then(tracks=>{
      if(disposed||request!==epoch)return;
      if(input.value.trim()!==query){feedback.textContent='Your search changed. Press Search for the new words.';return;}
      feedback.textContent=tracks.length?tracks.length+' results':'No tracks found. Try another song or artist.';
      results.replaceChildren(...tracks.map((track:MkrTrack)=>{
        const button=h('button',{type:'button',class:'mkr-result','aria-label':'Play '+track.title},h('strong',{text:track.title}),h('span',{text:track.artist}));
        button.addEventListener('click',()=>void control(()=>api.play(track.id)));return button;
      }));
    }).catch(()=>{if(!disposed&&request===epoch)feedback.textContent='MKR search is unavailable. No alternate service was used.';})
      .finally(()=>{searching=false;if(!disposed)search.disabled=false;});
  });
  toggle.addEventListener('click',()=>void control(()=>state.playing?api.pause():api.play()));
  previous.addEventListener('click',()=>void control(()=>api.previous()));next.addEventListener('click',()=>void control(()=>api.next()));
  seek.addEventListener('change',()=>{const position=Number(seek.value);void control(()=>api.seek(position));});
  check.addEventListener('click',()=>{void available().then(found=>{if(found)void refresh(true);});});
  const visibility=()=>{if(doc.hidden)stopTimer();else if(check.hidden)void refresh();};doc.addEventListener('visibilitychange',visibility);
  const back=h('button',{type:'button',text:'Back to library',onclick:()=>void hide()});
  root.append(h('header',{},h('div',{},h('p',{class:'eyebrow',text:'LISTEN INSIDE ANF'}),h('h2',{text:'MKR Music'})),back),form,feedback,results);
  dock.append(h('div',{class:'mkr-now'},title,artist),h('div',{class:'mkr-controls'},previous,toggle,next),h('div',{class:'mkr-progress'},elapsed,seek,total),check);
  paint();
  return{root,dock,available,open,hide,
    async suspend(){
      if(disposed||!ready)return;
      await commandDone;controlling=true;revision++;stopTimer();
      try{state=await api.pause();dockSuppressed=true;dock.hidden=true;check.hidden=true;feedback.textContent='Paused.';}
      catch{failed('MKR Music could not be paused. Switching audio was stopped.');throw Error('MKR audio handoff was not acknowledged.');}
      finally{controlling=false;paint();}
    },
    dispose(){
      if(disposed)return Promise.resolve();if(disposal)return disposal;
      closing=true;epoch++;revision++;stopTimer();paint();
      disposal=(async()=>{
        try{await commandDone;if(ready)await api.pause();disposed=true;dockSize.disconnect();doc.body.classList.remove('has-mkr-player');doc.body.style.removeProperty('--mkr-player-height');doc.removeEventListener('visibilitychange',visibility);root.remove();dock.remove();}
        catch{closing=false;failed('MKR Music could not be stopped. Player controls remain available.');paint();throw Error('MKR disposal was not acknowledged.');}
      })();
      void disposal.then(()=>{disposal=undefined;},()=>{disposal=undefined;});
      return disposal;
    },
  };
}
