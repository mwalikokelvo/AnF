// Actual workspace layout + recorded IPC only; no native child or playback.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {start,go} from './fixture.mjs';
const result={browserFixture:true,nativeChildVerified:false,physicalAudioVerified:false,sizes:[]};
const fx=await start();
try{
 for(const [width,height] of [[1280,800],[1024,768],[820,749]]){
  const {context,page}=await fx.open({width,height});
  try{
   await context.addInitScript(()=>{
    window.__spotubeBounds=[];
    window.__ipc={music_available:()=>true,music_open:({bounds})=>{window.__spotubeBounds.push(bounds);},
     music_control:()=>({hasTrack:!!window.__spotubeWithTrack,playing:false,title:'Synthetic fixture',artist:'',position:0,duration:10000})};
   });
   await page.reload();await go(page,'music');
   await page.getByRole('button',{name:'Open Spotube',exact:true}).click();
   await page.waitForFunction(()=>window.__spotubeBounds.length>0);
   const sample=await page.evaluate(()=>{
    const heading=document.querySelector('.music-heading').getBoundingClientRect();
    const footer=document.querySelector('.activity-bar').getBoundingClientRect();
    return{bounds:window.__spotubeBounds.at(-1),headingBottom:heading.bottom,footerTop:footer.top,scale:devicePixelRatio};
   });
   result.sizes.push({width,height,...sample});
   assert(sample.bounds.y/sample.scale>=sample.headingBottom,'Native music overlaps source/header controls');
   assert((sample.bounds.y+sample.bounds.height)/sample.scale<=sample.footerTop,'Native music overlaps activity/status bar');
   assert(sample.bounds.width>0&&sample.bounds.height>60,'Native music needs usable content space');
   const previous=await page.evaluate(()=>window.__spotubeBounds.length);
   await page.evaluate(()=>{window.__spotubeWithTrack=true;});
   await page.locator('.native-music-player').waitFor({state:'visible'});
   await page.waitForFunction(n=>window.__spotubeBounds.length>n,previous,{timeout:2500});
   const docked=await page.evaluate(()=>({bounds:window.__spotubeBounds.at(-1),
    dockTop:document.querySelector('.native-music-player').getBoundingClientRect().top,scale:devicePixelRatio}));
   result.sizes.at(-1).docked=docked;
   assert((docked.bounds.y+docked.bounds.height)/docked.scale<=docked.dockTop,'Native music overlaps its playback controls');
  }finally{await context.close();}
 }
 // Ignore intermittent requestfailed for hashed live-editor assets; they are not required for bounds checks.
 const relevant=fx.problems.filter(p=>!p.includes('live-editor') && !/requestfailed: http:\/\/127\.0\.0\.1:\d+\/assets\/.*/.test(p));
 assert.deepEqual(relevant,[]);
 result.passed=true;console.log('PASS: embedded music bounds preserve heading and status bar at three desktop sizes. Browser/IPC fixture only.');
}catch(error){result.error=String(error);throw error;}
finally{
 if(process.env.ANF_SPOTUBE_BOUNDS_REPORT)await writeFile(process.env.ANF_SPOTUBE_BOUNDS_REPORT,JSON.stringify(result,null,2));
 await fx.close();
}
