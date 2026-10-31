import {h} from '../views/dom';
import {invoke} from '@tauri-apps/api/core';

export function createAbout() {
  const version=h('strong',{text:'Loading installed version…'});
  const readiness=h('p',{class:'hint'}),state=h('p',{role:'status',class:'hint'});
  const release=h('button',{text:'Open releases',type:'button',onclick:()=>void invoke('open_url',{url:'https://github.com/mwalikokelvo/AnF/releases'}).catch(error=>state.textContent=String(error))});
  const check=h('button',{text:'Check for updates',type:'button',onclick:async()=>{
    check.disabled=true;state.textContent='Checking public releases…';
    try{const result=await invoke<{message:string;available:boolean}>('app_check_updates');state.textContent=result.message;release.textContent=result.available?'Review update':'Open releases';}
    catch(error){state.textContent=String(error).replace(/^Error: /,'');}
    finally{check.disabled=false;}
  }});
  const report=h('button',{text:'Export support report',type:'button',onclick:async()=>{
    report.disabled=true;
    try{state.textContent='Support report saved: '+await invoke<string>('app_export_diagnostics');}
    catch(error){state.textContent=String(error).replace(/^Error: /,'');}
    finally{report.disabled=false;}
  }});
  const root=h('section',{class:'about-card','aria-label':'About AnF'},h('h2',{text:'About AnF'}),version,readiness,
    h('div',{class:'row'},check,release),h('p',{class:'hint',text:'Update checks contact GitHub only when you choose Check for updates.'}),
    h('h3',{text:'Help troubleshoot a problem'}),h('p',{text:'Export the app version, platform and component readiness. The report contains no conversations, documents, account credentials, file paths or raw logs.'}),report,state);
  async function refresh(){try{const info=await invoke<{version:string;runtime:boolean;fast:boolean;ocr:boolean}>('workspace_diagnostics');version.textContent='Version '+info.version;readiness.textContent=`Offline AI ${info.runtime&&info.fast?'ready':'needs attention'} · Document recognition ${info.ocr?'ready':'needs attention'}`;}catch{version.textContent='Version information unavailable';}}
  return{root,refresh};
}
