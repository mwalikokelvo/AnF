// Actual UI and IPC fixture only: no native window, decoder or provider.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {start,go} from './fixture.mjs';
const result={browserFixture:true,nativeChildVerified:false,physicalAudioVerified:false,cases:[]};
const only=process.argv.find(s=>s.startsWith('--case='))?.slice(7);
const fx=await start();
try{
 for(const kind of ['startup','dialogs','late-startup'].filter(s=>!only||s===only)){
  const {context,page}=await fx.open({width:1024,height:768});
  try{
   await context.addInitScript(kind=>{
    window.__musicCalls=[];window.__returnNull=kind==='startup';
    window.__ipc={music_available:()=>true,
     music_open:()=>{window.__musicCalls.push('open');},music_hide:()=>{window.__musicCalls.push('hide');},
     music_control:async({operation})=>{
      window.__musicCalls.push(operation);
      if(kind==='late-startup'&&operation==='status')await new Promise(resolve=>{window.__releaseReady=resolve;});
      return window.__returnNull?null:{hasTrack:false,playing:false,title:'',artist:'',position:0,duration:0};
     }};
   },kind);
   await page.reload();await go(page,'music');
   const open=page.getByRole('button',{name:'Open Spotube',exact:true});
   await open.click();await page.waitForFunction(()=>window.__musicCalls.includes('status'));
   if(kind==='startup'){
    await page.waitForFunction(()=>document.querySelector('[aria-label="Music source"] button')?.getAttribute('aria-pressed')==='true',null,{timeout:2500});
    assert.equal(await open.getAttribute('aria-pressed'),'false');
    assert.match(await page.locator('.spotube-connection-status').innerText(),/could not start/i);
    assert.equal(await page.evaluate(()=>window.__musicCalls.at(-1)),'hide');
    await page.evaluate(()=>{window.__returnNull=false;});
    await open.click();await page.waitForFunction(()=>document.querySelector('.spotube-connection-status')?.textContent==='Spotube ready.');
   }else if(kind==='late-startup'){
    await page.waitForFunction(()=>typeof window.__releaseReady==='function');
    await page.getByRole('button',{name:'Local library',exact:true}).click();
    await page.waitForFunction(()=>window.__musicCalls.at(-1)==='pause');
    await page.evaluate(()=>{window.__releaseReady();});
    assert.equal(await open.getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('.spotube-connection-status').innerText(),'Local music.');
   }else{
    const hidden=await page.evaluate(()=>window.__musicCalls.filter(s=>s==='hide').length);
    await page.evaluate(()=>{
     const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
     dialog.textContent='Synthetic dialog fixture';Object.assign(dialog.style,{position:'fixed',top:'100px',left:'100px',width:'300px',height:'150px'});
     document.body.append(dialog);window.__testDialog=dialog;
    });
    await page.waitForFunction(n=>window.__musicCalls.filter(s=>s==='hide').length>n,hidden,{timeout:2500});
    const opened=await page.evaluate(()=>window.__musicCalls.filter(s=>s==='open').length);
    await page.evaluate(()=>{window.__testDialog.hidden=true;});
    await page.waitForFunction(n=>window.__musicCalls.filter(s=>s==='open').length>n,opened,{timeout:2500});
   }
   result.cases.push({kind,passed:true,calls:await page.evaluate(()=>window.__musicCalls)});
  }finally{await context.close();}
 }
 assert.deepEqual(fx.problems,[]);result.passed=true;
 console.log('PASS: null startup rolls back and retries; visible dialog hides native view until dismissed. Browser/IPC fixture only.');
}catch(error){result.error=String(error);throw error;}
finally{
 if(process.env.ANF_SPOTUBE_STARTUP_REPORT)await writeFile(process.env.ANF_SPOTUBE_STARTUP_REPORT,JSON.stringify(result,null,2));
 await fx.close();
}
