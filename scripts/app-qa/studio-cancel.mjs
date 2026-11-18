// Browser regression against actual Studio code. Only the pause IPC is delayed;
// this is not a native-app, audio-device or installed-upgrade acceptance test.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {start,go,seedTracks} from './fixture.mjs';
const source=await readFile(new URL('../../windows/src/workspace/audio-studio.ts',import.meta.url));
const result={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 sourceSHA256:createHash('sha256').update(source).digest('hex'),browserFixture:true,
 nativeAppVerified:false,physicalAudioVerified:false,cancelledStartVerified:false,freshRetryVerified:false};
const fx=await start();
try{
 const {context,page}=await fx.open({width:1280,height:800});
 await context.addInitScript(()=>{
  window.__studioPlayAttempts=0;
  const original=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){window.__studioPlayAttempts++;this.muted=true;return original.call(this);};
  window.__ipc={music_pause:async()=>{
   if(window.__holdStudioPause)await new Promise(resolve=>{window.__releaseStudioPause=resolve;});
   return null;
  }};
 });
 await seedTracks(page);await page.reload();
 await go(page,'audio');
 const studio=page.locator('.audio-studio');
 await page.locator('.audio-playlist button').filter({hasText:'Morning Light'}).first().click();
 await page.waitForFunction(()=>!document.querySelector('.audio-studio').hasAttribute('aria-busy'));
 await page.evaluate(()=>{window.__holdStudioPause=true;window.__studioPlayAttempts=0;});
 await studio.getByRole('button',{name:'Play',exact:true}).click();
 await page.waitForFunction(()=>typeof window.__releaseStudioPause==='function');
 const cancel=studio.getByRole('button',{name:'Cancel processing',exact:true});
 assert(await cancel.isEnabled());await cancel.click();
 await page.evaluate(()=>{window.__holdStudioPause=false;window.__releaseStudioPause();});
 await page.waitForFunction(()=>!document.querySelector('.audio-studio').hasAttribute('aria-busy'));
 result.playAttemptsAfterCancelledReply=await page.evaluate(()=>window.__studioPlayAttempts);
 assert.equal(result.playAttemptsAfterCancelledReply,0,'Cancelled Studio start reached media.play after late pause reply');
 result.cancelledStartVerified=true;
 await studio.getByRole('button',{name:'Play',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('.audio-studio').hasAttribute('aria-busy'));
 assert.equal(await page.evaluate(()=>window.__studioPlayAttempts),1,'Fresh retry must reach the real media element play');
 await studio.getByRole('button',{name:'Pause',exact:true}).click();
 result.freshRetryVerified=true;
 assert.deepEqual(fx.problems,[]);
 console.log('PASS: cancelled Studio pending start stays cancelled; fresh retry reaches real muted media.play. Browser/IPC fixture only.');
}catch(error){result.error=String(error);throw error;}
finally{
 if(process.env.ANF_STUDIO_CANCEL_REPORT)await writeFile(process.env.ANF_STUDIO_CANCEL_REPORT,JSON.stringify(result,null,2));
 await fx.close();
}
