// Shared browser fixture for the Windows/Linux workspace: serves windows/dist with the REAL Tauri CSP from
// tauri.conf.json (so violations surface), stubs Tauri IPC with inert answers, and collects problems.
// Browser fixture only: not the installed app. Run `npm run build` in windows/ first.
// Env: CHROMIUM_BIN=<path> picks a browser (default: Playwright's own); DIST_DIR=<dir> serves another build.
import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const types={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml'};
// Follow the person's path: hover the rail, pick the section's mode, then the section.
export async function go(page,view){
  await page.locator('.history-sidebar').hover();
  const mode=await page.locator(`[data-view="${view}"]`).getAttribute('data-mode');
  if(mode&&mode!=='keep'){const tab=page.locator(`.mode-rail [data-mode="${mode}"]`);if(await tab.count())await tab.click();}
  await page.locator(`[data-view="${view}"]`).click();
  await page.locator(`#panel-${view}`).waitFor({state:'visible'});
}
export async function start(){
  const conf=JSON.parse(await readFile(path.join(root,'windows/src-tauri/tauri.conf.json'),'utf8'));
  const csp=conf.app.security.csp;
  const base=path.resolve(process.env.DIST_DIR||path.join(root,'windows/dist'));
  const server=createServer(async(req,res)=>{try{const file=path.resolve(base,decodeURIComponent(new URL(req.url,'http://x').pathname.slice(1)));if(!file.startsWith(base+path.sep))throw Error('Path');res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');if(file.endsWith('.html'))res.setHeader('Content-Security-Policy',csp);res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({...(process.env.CHROMIUM_BIN?{executablePath:process.env.CHROMIUM_BIN}:{}),args:['--no-sandbox','--autoplay-policy=no-user-gesture-required'],headless:true});
  const problems=[];
  async function open({width=1280,height=800}={}){
    const context=await browser.newContext({viewport:{width,height},colorScheme:'dark'});
    await context.addInitScript(()=>{
      window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI));
      let current={id:'fixture',name:'QA',title:'Saved work',draft:'Existing writing',question:'',history:[],sources:[],memory:'',model:'fast'};
      const text='Quiet harbours keep small boats safe.\n\nA second paragraph about lighthouses and tides.\n';
      window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(command,args={})=>{switch(command){
        case 'workspace_list_projects':return[{id:'fixture',name:'QA',updated:Date.now()}];
        case 'workspace_load_project':return current;
        case 'workspace_save_project':current=args.project;return current;
        case 'workspace_diagnostics':return{runtime:true,fast:true,balanced:true,ocr:true,documents:'Local',log:'Fixture',version:'0.0.0'};
        case 'link_address':return'';case 'link_status':return false;case 'music_available':return false;
        case 'ingest_bytes':return{path:'/tmp/qa-note.txt'};
        case 'workspace_read_file':return{name:'qa-note.txt',text,pages:[{number:1,text,ocr:false}],path:'/tmp/qa-note.txt',reading:null};
        default:return null;}}};
    });
    const page=await context.newPage();
    page.on('console',m=>{if(m.type()==='error')problems.push('console.error: '+m.text())});
    page.on('pageerror',e=>problems.push('pageerror: '+e.message));
    page.on('requestfailed',r=>problems.push('requestfailed: '+r.url()));
    await page.goto(`http://127.0.0.1:${server.address().port}/workspace.html`);
    await page.locator('[data-view="home"]').waitFor({state:'attached'});
    return{context,page};
  }
  return{open,problems,close:async()=>{await browser.close();await new Promise(r=>server.close(r));}};
}
