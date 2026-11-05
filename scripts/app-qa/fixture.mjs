// Shared browser fixture for the Windows/Linux workspace: serves windows/dist with the REAL Tauri CSP from
// tauri.conf.json (so violations surface), stubs Tauri IPC with inert answers, and collects problems.
// Browser fixture only: not the installed app. Run `npm run build` in windows/ first.
// Tests add IPC answers with context.addInitScript(()=>{window.__ipc={command:args=>...}}).
// Env: CHROMIUM_BIN=<path> picks a browser (default: the msedge channel, like the other app-qa scripts); DIST_DIR=<dir> serves another build.
import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const types={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml'};
// Follow the person's path: hover the rail, pick the section's mode, then the section.
export async function go(page,view){
  await page.locator('.history-sidebar').hover({force:true});
  const mode=await page.locator(`[data-view="${view}"]`).getAttribute('data-mode');
  if(mode&&mode!=='keep'){const tab=page.locator(`.mode-rail [data-mode="${mode}"]`);if(await tab.count()&&await tab.isVisible())await tab.click();}
  // (below 767px the rail is a bottom bar of icons without mode tabs, so only click a visible tab)
  await page.locator(`[data-view="${view}"]`).click();
  await page.locator(`#panel-${view}`).waitFor({state:'visible'});
}
// Test-only fictional tracks with a synthetic 10 s WAV, written to the library database. Reload afterwards.
export async function seedTracks(page){
  await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('coucou-audio',2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const titles=['Quiet Hours','City Signals','Morning Light'],artists=['Lina Vale','Theo Marks','Elise Monroe'];
    const bytes=new ArrayBuffer(44+16000*10),view=new DataView(bytes),text=(at,s)=>Array.from(s).forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
    text(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,bytes.byteLength-44,true);
    const tx=db.transaction('tracks','readwrite');
    for(let i=0;i<3;i++)tx.objectStore('tracks').put({id:'qa-'+i,name:titles[i]+'.wav',title:titles[i],artist:artists[i],album:'QA',created:100-i,blob:new Blob([bytes],{type:'audio/wav'}),duration:10});
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  });
}
// Test-only: give a seeded track a longer title/artist (to check truncation). Reload afterwards.
export async function retitleTrack(page,id,fields){
  await page.evaluate(async({id,fields})=>{
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('coucou-audio',2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const tx=db.transaction('tracks','readwrite'),store=tx.objectStore('tracks');
    const track=await new Promise((resolve,reject)=>{const q=store.get(id);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
    store.put({...track,...fields});
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  },{id,fields});
}
export async function start(){
  const conf=JSON.parse(await readFile(path.join(root,'windows/src-tauri/tauri.conf.json'),'utf8'));
  const csp=conf.app.security.csp;
  const base=path.resolve(process.env.DIST_DIR||path.join(root,'windows/dist'));
  const server=createServer(async(req,res)=>{if(req.url==='/favicon.ico'){res.statusCode=204;return res.end();}try{const file=path.resolve(base,decodeURIComponent(new URL(req.url,'http://x').pathname.slice(1)));if(!file.startsWith(base+path.sep))throw Error('Path');res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');if(file.endsWith('.html'))res.setHeader('Content-Security-Policy',csp);res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({...(process.env.CHROMIUM_BIN?{executablePath:process.env.CHROMIUM_BIN}:{channel:'msedge'}),args:['--no-sandbox','--autoplay-policy=no-user-gesture-required'],headless:true});
  const problems=[];
  async function open({width=1280,height=800}={}){
    const context=await browser.newContext({viewport:{width,height},colorScheme:'dark'});
    await context.addInitScript(()=>{
      window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI));
      let current={id:'fixture',name:'QA',title:'Saved work',draft:'Existing writing',question:'',history:[],sources:[],memory:'',model:'fast'};
      const text='Quiet harbours keep small boats safe.\n\nA second paragraph about lighthouses and tides.\n';
      window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
      window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(command,args={})=>{switch(command){
        case 'workspace_list_projects':return[{id:'fixture',name:'QA',updated:Date.now()}];
        case 'workspace_load_project':return current;
        case 'workspace_save_project':current=args.project;return current;
        case 'workspace_diagnostics':return{runtime:true,fast:true,balanced:true,ocr:true,documents:'Local',log:'Fixture',version:'0.0.0'};
        case 'link_address':return'';case 'link_status':return false;case 'music_available':return false;
        case 'workspace_begin':return 1;
        case 'workspace_ask':return{text:'Fixture answer.',notice:'Fixture notice.',evidence:[]};
        case 'ingest_bytes':return{path:'/tmp/qa-note.txt'};
        case 'workspace_read_file':return{name:'qa-note.txt',text,pages:[{number:1,text,ocr:false}],path:'/tmp/qa-note.txt',reading:null};
        default:if(window.__ipc&&window.__ipc[command])return window.__ipc[command](args);return null;}}};
    });
    const page=await context.newPage();
    page.on('console',m=>{if(m.type()==='error')problems.push('console.error: '+m.text())});
    page.on('pageerror',e=>problems.push('pageerror: '+e.message));
    page.on('response',r=>{if(r.status()>=400)problems.push(`http ${r.status()}: ${r.url()}`)});
    page.on('requestfailed',r=>problems.push('requestfailed: '+r.url()));
    await page.goto(`http://127.0.0.1:${server.address().port}/workspace.html`);
    await page.locator('[data-view="home"]').waitFor({state:'attached'});
    return{context,page};
  }
  return{open,problems,close:async()=>{await browser.close();await new Promise(r=>server.close(r));}};
}
