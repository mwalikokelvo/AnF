const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={module:{exports:{}}};vm.runInNewContext(fs.readFileSync(process.argv[2],'utf8'),ctx);const {followups,needsClarification,documentQuestion}=ctx.module.exports;
assert(needsClarification('Help me!'));assert(!needsClarification('Explain chapter three to a beginner.'));
assert(followups(true).some(f=>f.label==='Show the evidence'));assert(!followups(false).some(f=>f.label==='Compare documents'));
const payload=documentQuestion('Explain photosynthesis and chlorophyll',[{name:'Biology',text:'Unrelated introduction. '.repeat(300)+'Photosynthesis uses chlorophyll to absorb light. '.repeat(20)}]);
assert(payload.includes('Photosynthesis uses chlorophyll'));assert(payload.includes('[1] Biology'));assert(payload.includes('not complete documents'));assert(payload.length<2200);
const limited=documentQuestion('A question',Array.from({length:10},(_,i)=>({name:'Book '+i,text:'Text '.repeat(5000)})));assert(!limited.includes('[5]'));assert(limited.length<7000);
console.log('Follow-up checks passed: clarification, document-specific suggestions, bounded relevant excerpts and source labels.');
