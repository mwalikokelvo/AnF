// Supported app-owned Tauri page-load test path; no debugger or remote UI control.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const evidence=path.join(path.dirname(root),'anf-pr47-evidence');
assert(process.argv.slice(2).every(arg=>['--require-receipt','--speech-only'].includes(arg)),'Unknown native QA runner option');
const speechOnly=process.argv.includes('--speech-only');
const helper=spawn(process.execPath,[path.join(root,'scripts/app-qa/mkr-workspace-manual.mjs'),...process.argv.slice(2).filter(arg=>arg==='--require-receipt')],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
let descriptor,buffer='',stderr='';
helper.stdout.on('data',data=>{
 buffer+=data.toString();assert(buffer.length<=16384,'Unexpected launcher output');
 const line=buffer.split('\n').find(line=>line.startsWith('{'));
 if(line&&!descriptor)descriptor=JSON.parse(line);
});
helper.stderr.on('data',data=>{stderr=(stderr+data.toString()).slice(0,4096);});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
 const deadline=Date.now()+120000;
 while(!descriptor&&Date.now()<deadline&&helper.exitCode===null)await sleep(100);
 assert(descriptor,'QA launcher did not start: '+stderr);
 assert.equal(descriptor.engineeringOnly,true);
 const {directory}=JSON.parse(await readFile(path.join(evidence,'latest-mkr-workspace-qa.json'),'utf8'));
 assert.equal(path.dirname(directory).toLowerCase(),evidence.toLowerCase());
 assert.equal(path.dirname(descriptor.profile),path.join(directory,'profile'));
 const resultFile=path.join(descriptor.profile,'AnF/mkr-native-selftest-result.json');
 let result;
 while(Date.now()<deadline&&helper.exitCode===null){
  try{result=JSON.parse(await readFile(resultFile,'utf8'));break;}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
  await sleep(250);
 }
 assert(result,'No native self-test result; no playback success is implied.');
 await writeFile(path.join(evidence,'mkr-in-app-selftest-latest.json'),JSON.stringify({resultFile,...result,...(descriptor.buildReceipt?{buildReceipt:descriptor.buildReceipt}:{})},null,2));
 // Keep a bounded phase/check summary even if artifact retention fails later.
 console.log(JSON.stringify({engineeringOnly:true,passed:result.passed,phase:result.phase,checks:result.checks,failure:result.failure}));
 assert.equal(result.passed,true,result.failure||'Native self-test failed');
 if(speechOnly)assert.equal(result.scope,'native-speech-handoff');
 assert(result.checks.length>=(speechOnly?3:6),'Missing required native checks');
 for(const check of result.checks)console.log('PASS: '+check);
 console.log(speechOnly?'PASS: real desktop local speech/native audio handoff; provider, Android and release QA remain separate.':'PASS: disposable real Tauri/WinRT acceptance with generated catalog/media. Provider streaming, Android and release QA remain separate.');
}finally{
 if(helper.exitCode===null){helper.stdin.write('stop\n');await new Promise(resolve=>{helper.once('exit',resolve);setTimeout(resolve,5000);});}
 if(helper.exitCode===null)helper.kill();
}
