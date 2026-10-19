import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../',import.meta.url));
const server = createServer(async(req,res)=>{
  try {
    const url = new URL(req.url,'http://localhost'), mobile = url.pathname.startsWith('/android/');
    const base = path.join(root,mobile ? 'android/build/assets/web' : 'windows/dist');
    const file = path.resolve(base,decodeURIComponent(mobile ? url.pathname.slice(9) : url.pathname.slice(1)));
    if (!file.startsWith(base+path.sep)) throw Error('Path');
    res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');
    res.end(await readFile(file));
  } catch {res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(4182,'127.0.0.1',resolve));
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_BIN||'/usr/bin/chromium',args:['--no-sandbox'],headless:true});
const errors = [];
try {
  for (const platform of ['windows','android']) {
    const context = await browser.newContext({viewport:{width:platform==='windows'?1440:390,height:900}});
    await context.addInitScript(({platform})=>{
      const qa = window.qaSpotube = {
        opened:false, operations:[], failPause:false, failStart:false, invalid:false, held:null, holdStatus:false,
        state:{hasTrack:true,playing:true,title:'Native fixture track',artist:'Test artist',position:1500,duration:20000},
      };
      const request = async operation=>{
        qa.operations.push(operation);
        if (operation==='open') {qa.opened=true;return null;}
        if (operation==='status' && qa.failStart) throw Error('Fixture startup failed');
        if (operation==='status' && qa.holdStatus) {
          qa.holdStatus=false;
          const old={...qa.state};
          return new Promise(resolve=>{qa.held=()=>resolve(old);});
        }
        if (!qa.opened) return null;
        if (operation==='pause' && qa.failPause) throw Error('Fixture pause failed');
        if (operation==='play') qa.state.playing=true;
        if (operation==='pause') qa.state.playing=false;
        if (operation==='next') qa.state.title='Next native track';
        if (operation==='previous') qa.state.title='Previous native track';
        if (operation==='retry') {qa.state.error=null;qa.state.playing=true;}
        return qa.invalid ? {...qa.state,position:-1} : {...qa.state};
      };
      if (platform==='android') {
        window.AnFAndroid={spotubeAvailable:()=>true,spotubeRequest:(id,op)=>{
          void request(op).then(value=>window.anfSpotubeResult(id,'',value ? JSON.stringify(value) : ''),error=>window.anfSpotubeResult(id,error.message,''));
        }};
      } else {
        let current={id:'fixture',name:'Music QA',title:'Saved work',draft:'Existing writing',question:'',history:[],sources:[],memory:'',model:'fast'};
        window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(command,args={})=>{
          switch(command) {
            case 'workspace_list_projects':return [{id:'fixture',name:'Music QA',updated:Date.now()}];
            case 'workspace_load_project':return current;
            case 'workspace_save_project':current=args.project;return current;
            case 'workspace_diagnostics':return {runtime:true,fast:true,balanced:true,ocr:true,documents:'Local',log:'Fixture',version:'0.1.21'};
            case 'link_address':return '';
            case 'link_status':return false;
            case 'music_available':return true;
            case 'music_open':qa.bounds=args.bounds;return request('open');
            case 'music_control':return request(args.operation);
            case 'music_pause':return request('pause');
            case 'music_hide':qa.operations.push('hide');return;
            case 'plugin:event|listen':return 1;
            case 'log_line':return;
            default:throw Error('Unexpected IPC '+command);
          }
        }};
      }
    },{platform});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(platform+': '+error.message));
    const go=async id=>{if(platform==='windows'){const group=id==='writing'?'documents':id==='audio'?'music':id;await page.locator('.workspace-navigation [data-view="'+group+'"]').click();if(group!==id)await page.locator('.context-tabs [data-view="'+id+'"]').click();}else await page.locator('[data-view="'+id+'"]').click();};
    await page.goto('http://127.0.0.1:4182/'+(platform==='android'?'android/index.html':'workspace.html'));
    await go('music');
    if(platform==='windows'){
      await page.evaluate(()=>{window.qaSpotube.failStart=true;});
      await page.getByRole('button',{name:'Open Spotube',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('.spotube-host').hidden);
      assert.equal(await page.getByRole('tab',{name:'Explore',exact:true}).isVisible(),true,'Failed startup must restore the local library');
      await page.evaluate(()=>{window.qaSpotube.failStart=false;});
    }
    await page.getByRole('button',{name:'Open Spotube',exact:true}).click();
    const dock = page.getByRole('complementary',{name:'Spotube player',exact:true});
    if(platform==='windows'){await page.waitForFunction(()=>document.body.classList.contains('spotube-visible'));assert.equal(await dock.isVisible(),false,'Only Spotube controls should appear inside the native view');await go('writing');}await dock.waitFor();await dock.getByText('Native fixture track',{exact:true}).waitFor();
    if(platform==='windows'){
      await go('music');
      await page.waitForFunction(()=>{
        const bounds=window.qaSpotube.bounds,dock=document.querySelector('.native-music-player').getBoundingClientRect();
        return bounds&&bounds.height>300&&document.body.classList.contains('spotube-visible');
      });
      const geometry=await page.evaluate(()=>({bounds:window.qaSpotube.bounds,heading:document.querySelector('.music-heading').getBoundingClientRect().bottom*devicePixelRatio}));
      assert(geometry.bounds.y>=geometry.heading,'Native child must not cover heading or source controls');
      await page.getByRole('button',{name:'Local library',exact:true}).click();
      await page.waitForFunction(()=>window.qaSpotube.operations.at(-1)==='hide');
      assert.equal(await page.getByLabel('Import local music',{exact:true}).isVisible(),false,'Hidden file inputs must stay hidden when returning to local music');
      assert.equal(await page.getByRole('tab',{name:'Explore',exact:true}).isVisible(),true);
      await page.getByRole('button',{name:'Open Spotube',exact:true}).click();
      await page.keyboard.press('Control+k');
      await page.getByRole('dialog',{name:'Search and knowledge tools'}).waitFor();
      await page.waitForFunction(()=>window.qaSpotube.operations.at(-1)==='hide');
      await page.getByRole('button',{name:'Close search',exact:true}).click();
      await page.waitForFunction(()=>window.qaSpotube.operations.at(-1)==='open');
      await go('settings');
      await page.waitForFunction(()=>window.qaSpotube.operations.at(-1)==='hide');
    }
    await go('writing');assert.equal(await dock.isVisible(),true);if(platform==='windows')await dock.getByRole('button',{name:'Play Spotube',exact:true}).click();
    await dock.getByRole('button',{name:'Pause Spotube',exact:true}).click();await dock.getByRole('button',{name:'Play Spotube',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.qaSpotube.state.playing),false);
    await dock.getByRole('button',{name:'Play Spotube',exact:true}).click();await dock.getByRole('button',{name:'Pause Spotube',exact:true}).waitFor();
    await dock.getByRole('button',{name:'Next Spotube track',exact:true}).click();await dock.getByText('Next native track',{exact:true}).waitFor();
    await dock.getByRole('button',{name:'Previous Spotube track',exact:true}).click();await dock.getByText('Previous native track',{exact:true}).waitFor();
    await page.evaluate(()=>{window.qaSpotube.failPause=true;});
    await dock.getByRole('button',{name:'Pause Spotube',exact:true}).click();await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>window.qaSpotube.state.playing),true,'Failed pause must not claim a paused native engine');
    assert.equal(await dock.getByRole('button',{name:'Pause Spotube',exact:true}).isVisible(),true);
    await page.evaluate(()=>{window.qaSpotube.failPause=false;});
    if(platform==='windows'){
      for(const theme of ['dark','light']){
        await go('settings');await page.getByLabel('Appearance',{exact:true}).selectOption(theme);await go('music');
        const selected=page.getByRole('button',{name:'Open Spotube',exact:true});await selected.hover();
        const contrast=await selected.evaluate(button=>{
          const style=getComputedStyle(button);
          const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
          const a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
        });assert(contrast>=4.5,theme+' selected source hover contrast: '+contrast);
      }
      await go('writing');
    }
    for (const width of platform==='windows'?[1440,760]:[390,320]) {
      await page.setViewportSize({width,height:900});
      const bounds=await dock.boundingBox();assert(bounds.x>=0 && bounds.x+bounds.width<=width+1,JSON.stringify(bounds));
      for (const label of ['Previous Spotube track','Pause Spotube','Next Spotube track']) assert.equal(await dock.getByRole('button',{name:label,exact:true}).isVisible(),true);
    }
    if(platform==='windows'){
      await page.evaluate(()=>{window.qaSpotube.state.buffering=true;document.dispatchEvent(new Event('anf-view-changed'));});
      await dock.getByText('Buffering…',{exact:true}).waitFor();
      await page.evaluate(()=>{window.qaSpotube.state.buffering=false;window.qaSpotube.state.playing=false;window.qaSpotube.state.error='Provider needs attention';document.dispatchEvent(new Event('anf-view-changed'));});
      await dock.getByRole('button',{name:'Retry playback',exact:true}).waitFor();
      await dock.getByRole('button',{name:'Retry playback',exact:true}).click();
      assert((await page.evaluate(()=>window.qaSpotube.operations)).includes('retry'));
      await page.evaluate(()=>{delete window.qaSpotube.state.error;document.dispatchEvent(new Event('anf-view-changed'));});
    }
    // A suspended dock must not reappear when an earlier status reply arrives late.
    await page.evaluate(()=>{window.qaSpotube.holdStatus=true;document.dispatchEvent(new Event('anf-view-changed'));});
    await page.waitForFunction(()=>typeof window.qaSpotube.held==='function');
    await go('audio');
    // Starting the studio's real synthetic track exercises its before-play handoff.
    await page.evaluate(async()=>{
      const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('anf-audio',2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      const bytes=new ArrayBuffer(44+16000);const view=new DataView(bytes);const text=(at,s)=>Array.from(s).forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
      text(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,bytes.byteLength-44,true);
      const tx=db.transaction('tracks','readwrite');tx.objectStore('tracks').put({id:'handoff',name:'handoff.wav',title:'Studio handoff',artist:'QA',blob:new Blob([bytes],{type:'audio/wav'}),created:1,duration:1});
      await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();document.dispatchEvent(new Event('anf-audio-library-changed'));
    });
    await page.locator('.audio-playlist button').filter({hasText:'Studio handoff'}).click();
    await page.waitForFunction(()=>!document.querySelector('.audio-studio').hasAttribute('aria-busy'));
    if(platform==='windows'){
      await page.evaluate(()=>{window.qaSpotube.failPause=true;});
      await page.locator('.audio-studio').getByRole('button',{name:'Play',exact:true}).click();
      await page.locator('.audio-studio [role="status"]').filter({hasText:'Fixture pause failed'}).waitFor();
      assert.equal(await dock.isVisible(),true,'A failed playback handoff must leave native controls available');
      assert.equal(await page.evaluate(()=>window.qaSpotube.state.playing),true);
      await page.waitForFunction(()=>!document.querySelector('.audio-studio').hasAttribute('aria-busy'));
      await page.evaluate(()=>{window.qaSpotube.failPause=false;});
    }
    await page.locator('.audio-studio').getByRole('button',{name:'Play',exact:true}).click();
    await page.waitForFunction(()=>!window.qaSpotube.state.playing);
    await page.evaluate(()=>window.qaSpotube.held());await page.waitForTimeout(100);
    assert.equal(await dock.isVisible(),false,'Late native status must not reopen a dock suspended by Audio Studio');
    // Malformed status closes the controls and never writes metadata into HTML.
    await go('music');await page.evaluate(()=>{window.qaSpotube.invalid=true;});
    await page.getByRole('button',{name:'Open Spotube',exact:true}).click();await page.waitForTimeout(200);
    assert.equal(await dock.isVisible(),false,'Invalid status must not produce a usable dock');
    assert((await page.evaluate(()=>window.qaSpotube.operations)).includes('pause'));
    await context.close();console.log('PASS: '+platform+' native-control bridge fixture, navigation, transport, failed pause, late status, studio handoff, malformed state and responsive dock.');
  }
  assert.deepEqual(errors,[]);
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
