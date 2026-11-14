// Kevo voice: only speech addressed to Kevo becomes a command, and each profile gets a fitting natural voice.
const {parseWakeCommand,pickVoice,splitForSpeech}=require(require('node:path').resolve(process.argv[2]));const assert=require('node:assert/strict');
const w=['kevo','keevo','kivo','kayvo','kebo','cavo'];
assert.deepEqual(parseWakeCommand('Hey Google.',w),{wake:null,text:'Hey Google.'});
assert.deepEqual(parseWakeCommand('Are you awake?',w),{wake:null,text:'Are you awake?'});
assert.deepEqual(parseWakeCommand('Hey Kevo, what time is it',w),{wake:'hey kevo',text:'what time is it'});
assert.deepEqual(parseWakeCommand('okay keevo play music',w),{wake:'okay keevo',text:'play music'});
assert.deepEqual(parseWakeCommand('What time is it, Kevo?',w),{wake:'kevo',text:'What time is it'});
assert.deepEqual(parseWakeCommand('What time is it, Kevo, please?',w),{wake:'kevo',text:'What time is it'});
assert.deepEqual(parseWakeCommand('Kevo',w),{wake:'kevo',text:''});
assert.equal(parseWakeCommand('kevology is fun',w).wake,null);
const v=(name,lang,localService=true)=>({name,lang,localService});
const voices=[v('Microsoft David - English (United States)','en-US'),v('Microsoft Zira - English (United States)','en-US'),v('Microsoft Aria Online (Natural) - English (United States)','en-US',false),v('Microsoft Guy Online (Natural) - English (United States)','en-US',false),v('Microsoft Ryan Online (Natural) - English (United Kingdom)','en-GB',false),v('Microsoft Hortense - French','fr-FR')];
assert.match(pickVoice(voices,{accent:'en-US',gender:'female'}).name,/Zira/,'online voices need opt-in');
assert.match(pickVoice(voices,{accent:'en-US',gender:'male'}).name,/David/);
assert.match(pickVoice(voices,{accent:'en-US',gender:'female'},true).name,/Aria/);
assert.match(pickVoice(voices,{accent:'en-US',gender:'male'},true).name,/Guy/);
assert.match(pickVoice(voices,{accent:'en-GB',gender:'male'},true).name,/Ryan/);
assert.match(pickVoice(voices.slice(0,2),{accent:'en-US',gender:'female'}).name,/Zira/);
assert.equal(pickVoice([v('Hortense','fr-FR')],{accent:'en-US'}),null);
assert.deepEqual(splitForSpeech('One. Two!  Three?'),['One. Two! Three?']);
assert.ok(splitForSpeech('A sentence that is long enough. '.repeat(20)).every(p=>p.length<=220));
assert.ok(splitForSpeech('word '.repeat(120)).every(p=>p.length<=220),'one long unpunctuated sentence is split');
// Every built-in recording exists under the name the pack lists and really is an MP3 (a WAV renamed .mp3 fails in some players).
const fs=require('node:fs'),path=require('node:path');const dir=path.join(__dirname,'../voice-pack');
const pack=fs.readFileSync(path.join(__dirname,'../src/workspace/jarvis/voice/jarvis-voice-pack.ts'),'utf8');
const names=[...pack.matchAll(/filename: '([^']+)'/g)].map(m=>m[1]);assert.equal(names.length,13);
for(const name of names){const head=fs.readFileSync(path.join(dir,name)).subarray(0,3);assert.ok(head.toString('latin1')==='ID3'||(head[0]===0xff&&(head[1]&0xe0)===0xe0),name+' is not an MP3');}
console.log('Kevo voice checks passed.');
