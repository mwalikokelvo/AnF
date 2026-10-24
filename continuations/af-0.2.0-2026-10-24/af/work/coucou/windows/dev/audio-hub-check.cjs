const assert=require('node:assert/strict');
const {reconcileQueue,moveTrack,shuffled,nextTrack,spectralClean}=require(process.argv[2]);
(async()=>{
 assert.deepEqual(reconcileQueue(['b','gone','b'],['a','b','c']),['b','a','c']);
 assert.deepEqual(reconcileQueue(['b','gone','b'],['a','b','c'],false),['b'],'Subset playlists must not append unrelated tracks');
 assert.deepEqual(reconcileQueue([],['a','b'],false),[],'Empty custom queues stay empty');
 assert.deepEqual(reconcileQueue(['c','a'],['a','b','c','new'],false),['c','a'],'New library imports must not change a saved subset');
 assert.equal(nextTrack(reconcileQueue(['b'],['a','b','c'],false),'b','off',true),undefined,'Playback ends at the subset boundary');
 assert.deepEqual(moveTrack(['a','b','c'],'a',2),['b','c','a']);
 assert.deepEqual(moveTrack(['a','b'],'missing',0),['a','b']);
 assert.equal(nextTrack(['a','b'],'b','off',true),undefined);
 assert.equal(nextTrack(['a','b'],'b','all',true),'a');
 assert.equal(nextTrack(['a','b'],'a','track',true),'a');
 assert.equal(nextTrack(['a','b'],'a','track',false),'b');
 const source=['a','b','c','d'],mixed=shuffled(source,()=>0);assert.deepEqual([...mixed].sort(),source);assert.notDeepEqual(mixed,source);assert.deepEqual(source,['a','b','c','d']);
 const rate=16000,data=new Float32Array(rate*3);let seed=7;
 for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=((seed/4294967296)*2-1)*.04+(i>=rate?.25*Math.sin(2*Math.PI*440*i/rate):0);}
 const out=await spectralClean(data,rate,0,1);assert.equal(out.length,data.length);assert.ok(out.every(Number.isFinite));
 const rms=(d,a,b)=>Math.sqrt(d.slice(a,b).reduce((s,x)=>s+x*x,0)/(b-a));
 assert.ok(rms(out,rate/4,rate*3/4)<rms(data,rate/4,rate*3/4)*.8,'steady noise should decrease');
 assert.ok(rms(out,rate*1.5,rate*2.5)>rms(data,rate*1.5,rate*2.5)*.75,'speech-band tone should remain');
 assert.deepEqual(await spectralClean(new Float32Array(rate*2),rate,0,1),new Float32Array(rate*2));
 await assert.rejects(()=>spectralClean(data,rate,2.5,1),/noise-only/);
 await assert.rejects(()=>spectralClean(data,rate,0,1,()=>{},()=>true),/cancelled/);
 console.log('Audio hub checks passed: queue integrity, repeat/shuffle, noise attenuation, signal preservation, silence, bounds and cancellation.');
})().catch(e=>{console.error(e);process.exit(1);});
