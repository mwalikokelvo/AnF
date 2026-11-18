// Actual AnF appearance controls + recorded IPC, not native pixel acceptance.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {start,go} from './fixture.mjs';
const result={browserFixture:true,nativeThemePixelsVerified:false,physicalAudioVerified:false};
const fx=await start();
try{
 const {context,page}=await fx.open({width:1024,height:768});
 await context.addInitScript(()=>{
  window.__themeCalls=[];
  window.__ipc={music_available:()=>true,music_control:({operation})=>{
   window.__themeCalls.push(operation);return{hasTrack:false,playing:false,title:'',artist:'',position:0,duration:0};
  }};
 });
 await page.reload();await go(page,'music');
 await page.getByRole('button',{name:'Open Spotube',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.spotube-connection-status')?.textContent==='Spotube ready.');
 await go(page,'settings');await page.getByLabel('Appearance',{exact:true}).selectOption('light');
 await page.waitForFunction(()=>window.__themeCalls.includes('light'),null,{timeout:2500});
 await page.emulateMedia({colorScheme:'dark'});
 await page.getByLabel('Appearance',{exact:true}).selectOption('system');
 await page.waitForFunction(()=>window.__themeCalls.filter(s=>s==='light'||s==='dark').at(-1)==='dark',null,{timeout:2500});
 await page.emulateMedia({colorScheme:'light'});
 await page.waitForFunction(()=>window.__themeCalls.filter(s=>s==='light'||s==='dark').at(-1)==='light',null,{timeout:2500});
 result.operations=await page.evaluate(()=>window.__themeCalls);
 assert.deepEqual(fx.problems,[]);result.passed=true;
 console.log('PASS: manual AnF light and Follow Windows appearance reach the embedded protocol. Browser/IPC fixture only.');
}catch(error){result.error=String(error);throw error;}
finally{
 if(process.env.ANF_SPOTUBE_THEME_REPORT)await writeFile(process.env.ANF_SPOTUBE_THEME_REPORT,JSON.stringify(result,null,2));
 await fx.close();
}
