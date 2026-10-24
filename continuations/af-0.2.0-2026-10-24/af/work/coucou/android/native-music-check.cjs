const assert=require('node:assert/strict');
const requests=[];
global.window={CoucouAndroid:{musicRequest(id,operation){requests.push({id,operation});}}};
const {nativeMusic}=require(process.argv[2]);
function reply(value,error=''){const r=requests.shift();window.coucouMusicResult(r.id,JSON.stringify(value),error);return r.operation;}
(async()=>{
 const music=nativeMusic();
 const ready=music.available();assert.equal(reply({available:true}),'available');assert.equal(await ready,true);
 const refused=music.suspend();assert.equal(reply({playing:true}),'pause');await assert.rejects(refused,/could not be paused/);
 const paused=music.suspend();reply({playing:false});await paused;
 const error=music.suspend();reply({},'Native pause failed');await assert.rejects(error,/Native pause failed/);
 const brokenOpen=music.open();reply({});await assert.rejects(brokenOpen,/could not open/);
 const opened=music.open();reply({opened:true});await opened;
 const unknown=nativeMusic(),handoff=unknown.suspend();reply({available:false});await handoff;
 await assert.rejects(unknown.open(),/not included/);
 window.coucouMusicResult('unknown-request','{}','');
 console.log('PASS: module availability, pause acknowledgement, failed pause refusal, validated open, absent module and stale replies');
})().catch(e=>{console.error(e);process.exitCode=1;});
