// Deterministic browser regression: fake voices/music/native receipts, no audio proof.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {build}=createRequire(path.join(root,'windows/package.json'))('esbuild');
const prove=process.argv.find(x=>x.startsWith('--prove-baseline='))?.slice(17);
if(prove){
 assert.match(prove,/^[0-9a-f]{7,40}$/);
 const red=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--baseline='+prove],{cwd:root,encoding:'utf8',timeout:180000});
 const report=red.stdout+'\n'+red.stderr;
 await fs.writeFile(path.join(process.env.RUNNER_TEMP,'speech-baseline.txt'),report);
 assert(red.status!==0&&report.includes('AssertionError [ERR_ASSERTION]: Speech started before the music pause was acknowledged'),'Expected behavioral baseline assertion was not observed');
 console.log('PASS: unchanged baseline demonstrably starts speech before the music handoff');process.exit(0);
}
const baseline=process.argv.find(x=>x.startsWith('--baseline='))?.slice(11);
const plugins=[];
if(baseline){
 assert.match(baseline,/^[0-9a-f]{7,40}$/);
 const old=spawnSync('git',['show',baseline+':windows/src/workspace/speech-player.ts'],{cwd:root,encoding:'utf8'});
 assert.equal(old.status,0,old.stderr);
 plugins.push({name:'read-only-baseline',setup(b){b.onResolve({filter:/\/speech-player$/},()=>({path:'speech-player.ts',namespace:'baseline'}));b.onLoad({filter:/.*/,namespace:'baseline'},()=>({contents:old.stdout,loader:'ts',resolveDir:path.join(root,'windows/src/workspace')}));}});
}
const out=path.join(root,'windows/target/speech-handoff-'+(baseline?'baseline':'current'));await fs.mkdir(out,{recursive:true});
await build({plugins,stdin:{resolveDir:root,loader:'ts',contents:`
import {createSpeechPlayer} from './windows/src/workspace/speech-player';
import {createMkrPlayer} from './windows/src/workspace/mkr-player';
import './windows/src/workspace/workspace.css';import './windows/src/workspace/anf-design.css';
const actualSynth=window.speechSynthesis,ActualUtterance=window.SpeechSynthesisUtterance;
window.make=async(mode,hold=false)=>{
 window.player?.stop();window.player?.root.remove();
 window.speechStarts=0;window.speechPlaying=false;window.musicPlaying=true;window.handoffs=0;window.calls=[];
 window.hold=hold;window.deny=false;window.receiptId=undefined;window.finishSpeech=undefined;
 const native={speakPart(text,rate,id){window.calls.push('speech-play');window.speechStarts++;window.speechPlaying=true;window.finishSpeech=()=>window.AnFSpeechDone(id);},stopSpeaking(){window.speechPlaying=false;},stopSpeakingConfirmed(id){window.receiptId=id;window.calls.push('speech-stop-receipt');}};
 if(mode==='old-native')delete native.stopSpeakingConfirmed;
 window.AnFAndroid=mode==='provider'||mode==='system'?undefined:native;
 if(mode==='system'){
  let utterance;
  const synth={speaking:false,paused:false,pending:false,getVoices:()=>[{localService:true,name:'System fixture',lang:'en-US'}],addEventListener(){},
   speak(value){utterance=value;synth.speaking=true;synth.paused=false;window.speechPlaying=true;window.speechStarts++;window.finishSpeech=()=>{synth.speaking=false;value.onend?.();};},
   pause(){synth.paused=true;},resume(){synth.paused=false;window.speechPlaying=true;},cancel(){const old=utterance;utterance=undefined;synth.speaking=false;synth.paused=false;window.speechPlaying=false;if(old)setTimeout(()=>old.onerror?.(),0);}};
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:synth});window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 }else{Object.defineProperty(window,'speechSynthesis',{configurable:true,value:actualSynth});window.SpeechSynthesisUtterance=ActualUtterance;}
 const player=createSpeechPlayer(undefined,async()=>{window.handoffs++;if(window.hold)await new Promise(resolve=>window.release=resolve);if(window.deny)throw Error('private.invalid/handoff');await window.music.pause();});
 window.player=player;document.querySelector('#workspace-root').append(player.root);
 window.music=createMkrPlayer(async(command)=>{
  if(command==='capabilities')return{protocol:1,embedded:true,platform:'windows-native'};
  if(command==='play'){window.calls.push('music-play');window.musicPlaying=true;}
  if(command==='pause'){window.calls.push('music-pause');window.musicPlaying=false;}
  return{playing:window.musicPlaying,positionMs:0,durationMs:1000,track:{id:'fixture',title:'Generated music',artist:'Fixture'}};
 },()=>player.pauseForOtherAudio());
 await window.music.available();
 if(mode==='provider'){
  player.configureVoices([{id:'fixture',label:'Generated voice fixture',available:()=>true,speak(text,rate,callbacks){window.calls.push('speech-play');window.speechStarts++;window.speechPlaying=true;window.finishSpeech=callbacks.onEnd;return{stop(){window.speechPlaying=false;},pause(){window.speechPlaying=false;},resume(){window.speechPlaying=true;}};}}]);
  player.root.querySelector('select[aria-label="Offline reading voice"]').value='provider:fixture';
 }
};
`},bundle:true,format:'iife',outfile:path.join(out,'fixture.js')});
await fs.writeFile(path.join(out,'index.html'),'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="fixture.css"><div id="workspace-root"></div><script src="fixture.js"></script>');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:850}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.join(out,'index.html')).href);
 await page.evaluate(async()=>{await window.make('provider',true);window.player.load('One sentence. Two sentences.');});
 assert.equal(await page.evaluate(()=>window.speechStarts),0,'Speech started before the music pause was acknowledged');
 assert.equal(await page.evaluate(()=>window.musicPlaying),true);
 assert.equal(await page.locator('.speech-player').getAttribute('aria-busy'),'true');
 await page.getByRole('button',{name:'Stop',exact:true}).click();await page.evaluate(()=>window.release());
 await page.waitForTimeout(30);assert.equal(await page.evaluate(()=>window.speechStarts),0,'Stopped pending speech must never start later');
 await page.evaluate(async()=>{await window.make('provider');window.deny=true;window.player.load('One sentence.');});
 await page.getByText('Other audio could not be paused. Retry read aloud when the player responds.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.speechStarts),0);assert.equal(await page.evaluate(()=>window.musicPlaying),true);
 await page.evaluate(async()=>{await window.make('provider');window.player.load('One sentence. Two sentences.');});
 await page.getByRole('button',{name:'Pause',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.musicPlaying),false);
 await page.evaluate(()=>window.music.play('fixture'));
 assert.equal(await page.evaluate(()=>window.speechPlaying),false);assert.equal(await page.evaluate(()=>window.musicPlaying),true);
 assert.equal(await page.locator('.speech-player').isVisible(),true,'Music handoff must preserve the open reader player');
 await page.getByRole('button',{name:'Resume',exact:true}).click();await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.musicPlaying),false);
 await page.evaluate(()=>window.finishSpeech());await page.waitForFunction(()=>window.speechStarts===2);
 assert.equal(await page.getByRole('slider',{name:'Read-aloud sentence'}).inputValue(),'1','Resumed voice callbacks must advance to the next sentence');
 await page.evaluate(()=>window.music.play('fixture'));
 assert.equal(await page.getByRole('slider',{name:'Read-aloud sentence'}).inputValue(),'1');
 await page.screenshot({path:path.join(out,'reader-paused-for-music.png')});
 await page.evaluate(async()=>{await window.make('provider',true);window.externalStarts=0;window.externalRead=window.player.readExternal(()=>window.externalStarts++);});
 await page.evaluate(()=>window.music.play('fixture'));await page.evaluate(()=>window.release());
 assert.equal(await page.evaluate(()=>window.externalRead),false,'A music request must revoke a pending Writing read-aloud');
 assert.equal(await page.evaluate(()=>window.externalStarts),0);
 await page.evaluate(async()=>{await window.make('provider',true);window.externalStarts=0;window.externalRead=window.player.readExternal(()=>window.externalStarts++);});
 await page.getByRole('button',{name:'Stop',exact:true}).click();await page.evaluate(()=>window.release());
 assert.equal(await page.evaluate(()=>window.externalRead),false,'Stop must cancel a pending Writing read-aloud without locking the workspace');
 assert.equal(await page.evaluate(()=>window.externalStarts),0);
 await page.evaluate(async()=>{await window.make('system');window.player.load('System queue fixture.');});
 await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
 await page.evaluate(()=>window.music.play('fixture'));
 assert.equal(await page.evaluate(()=>window.speechSynthesis.speaking),false);
 await page.evaluate(()=>window.player.readExternal(()=>window.speechSynthesis.speak(new SpeechSynthesisUtterance('Writing fixture.'))));
 await page.waitForTimeout(40);
 assert.equal(await page.evaluate(()=>window.speechSynthesis.speaking),true,'Old reader cancellation callbacks must not cancel new Writing speech');
 await page.evaluate(()=>window.music.play('fixture'));
 assert.equal(await page.evaluate(()=>window.speechSynthesis.speaking),false,'Music must stop shared Writing speech even with the reader paused');
 await page.evaluate(async()=>{await window.make('native');window.switchDone=false;window.switchResult=window.music.play('fixture').then(()=>window.switchDone=true);});
 await page.waitForFunction(()=>!!window.receiptId);
 assert.equal(await page.evaluate(()=>window.switchDone),false,'Even an idle reader must ask native about shared Writing speech');
 await page.evaluate(()=>window.AnFSpeechPauseResult(window.receiptId,true));await page.evaluate(()=>window.switchResult);
 await page.evaluate(async()=>{await window.make('native');window.player.load('Native fixture sentence.');});
 await page.waitForFunction(()=>window.speechStarts===1);
 await page.evaluate(()=>{window.switchDone=false;window.switchResult=window.music.play('fixture').then(()=>window.switchDone=true,e=>{window.switchError=e.message;});});
 await page.waitForFunction(()=>!!window.receiptId);
 assert.equal(await page.evaluate(()=>window.calls.includes('music-play')),false,'Fire-and-forget native stop must not authorize music');
 await page.evaluate(()=>window.AnFSpeechPauseResult('wrong-receipt',true));assert.equal(await page.evaluate(()=>window.switchDone),false);
 await page.evaluate(()=>window.AnFSpeechPauseResult(window.receiptId,true));await page.evaluate(()=>window.switchResult);
 assert.equal(await page.evaluate(()=>window.switchDone),true);assert.equal(await page.evaluate(()=>window.speechPlaying),false);
 await page.getByRole('button',{name:'Resume',exact:true}).click();await page.waitForFunction(()=>window.speechStarts===2);
 await page.evaluate(()=>{window.switchError=undefined;window.switchResult=window.music.play('fixture').catch(e=>{window.switchError=e.message;});});
 await page.waitForFunction(()=>typeof window.AnFSpeechPauseResult==='function');
 await page.evaluate(()=>window.AnFSpeechPauseResult(window.receiptId,false));await page.evaluate(()=>window.switchResult);
 assert.match(await page.evaluate(()=>window.switchError),/did not confirm/);assert.equal(await page.evaluate(()=>window.musicPlaying),false);
 await page.evaluate(async()=>{await window.make('native');window.player.load('Timeout fixture.');});await page.waitForFunction(()=>window.speechStarts===1);
 await page.evaluate(()=>{window.switchError=undefined;window.switchResult=window.music.play('fixture').catch(e=>{window.switchError=e.message;});});
 await page.evaluate(()=>window.switchResult);assert.match(await page.evaluate(()=>window.switchError),/did not confirm/);
 assert.equal(await page.evaluate(()=>window.calls.includes('music-play')),false);
 await page.evaluate(async()=>{await window.make('old-native');window.player.load('Old native fixture.');});await page.waitForFunction(()=>window.speechStarts===1);
 const old=await page.evaluate(()=>window.music.play('fixture').then(()=>'',e=>e.message));assert.match(old,/Update the app/);
 assert.deepEqual(errors,[]);
 console.log('PASS: delayed/denied/cancelled speech startup, bidirectional music handoff, preserved sentence and resumed callbacks, matching/denied/timed-out native receipts and old-build refusal. Mock engines, not audible/native-device proof.');
}finally{await browser.close();}
