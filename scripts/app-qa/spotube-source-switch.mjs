// Real workspace buttons with held IPC; not native-window/playback acceptance.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {start,go} from './fixture.mjs';
const result={browserFixture:true,nativeChildVerified:false,physicalAudioVerified:false};
const fx=await start();
try{
 const {context,page}=await fx.open({width:1024,height:768});
 await context.addInitScript(()=>{
  window.__musicCalls=[];
  window.__ipc={music_available:()=>true,
   music_open:async()=>{
    window.__musicCalls.push('open');
    if(window.__holdMusicOpen)await new Promise(resolve=>{window.__releaseMusicOpen=resolve;});
    window.__musicCalls.push('opened');
   },music_hide:()=>{window.__musicCalls.push('hide');},
   music_control:({operation})=>{window.__musicCalls.push(operation);return{hasTrack:false,playing:false,title:'',artist:'',position:0,duration:0};}};
 });
 await fx.reload(page);await go(page,'music');
 const local=page.getByRole('button',{name:'Local library',exact:true});
 assert.equal(await local.count(),1,'Music needs an in-app return to the local library');
 const open=page.getByRole('button',{name:'Open Spotube',exact:true});
 await page.evaluate(()=>{window.__holdMusicOpen=true;window.__musicCalls=[];});
 await open.click();await page.waitForFunction(()=>typeof window.__releaseMusicOpen==='function');
 await local.click();
 await page.evaluate(()=>{window.__holdMusicOpen=false;window.__releaseMusicOpen();});
 await page.waitForFunction(()=>window.__musicCalls.at(-1)==='pause');
 result.callsAfterLocal=await page.evaluate(()=>window.__musicCalls);
 const acknowledged=result.callsAfterLocal.lastIndexOf('opened');
 assert(acknowledged>=0&&result.callsAfterLocal.indexOf('hide',acknowledged)>acknowledged,'Late open must be followed by hide');
 assert.equal(await local.getAttribute('aria-pressed'),'true');
 assert.equal(await open.getAttribute('aria-pressed'),'false');
 const previous=await page.evaluate(()=>window.__musicCalls.filter(c=>c==='opened').length);
 await open.click();await page.waitForFunction(n=>window.__musicCalls.filter(c=>c==='opened').length>n,previous);
 assert.equal(await open.getAttribute('aria-pressed'),'true');
 await local.click();await page.waitForFunction(()=>window.__musicCalls.at(-1)==='pause');
 assert.deepEqual(fx.problems,[]);
 result.passed=true;console.log('PASS: local source wins a late Spotube open; fresh reopen works. Browser/held IPC fixture only.');
}catch(error){result.error=String(error);throw error;}
finally{
 if(process.env.ANF_SPOTUBE_SOURCE_REPORT)await writeFile(process.env.ANF_SPOTUBE_SOURCE_REPORT,JSON.stringify(result,null,2));
 await fx.close();
}
