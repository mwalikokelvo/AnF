const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={module:{exports:{}},TextEncoder};vm.runInNewContext(fs.readFileSync(process.argv[2],'utf8'),context);
const {restoreProjects,mergeReply}=context.module.exports;
const old={name:'Old conversation',draft:'My writing',prompt:'Question',notes:[{role:'You',text:'Hello'}],sources:[{name:'Book',text:'Chapter'}],id:'old'};
const wrap=p=>({kind:'coucou-mobile-backup',projects:[p]});
const restored=restoreProjects(wrap(old),()=> 'new-id',123)[0];
assert.equal(restored.id,'new-id');assert.equal(restored.updated,123);assert.equal(restored.replyPlacement,'append');assert.equal(restored.pendingReply,'');
const newer={...old,pendingReply:'Unfinished reply',responseLength:'long',replyPlacement:'replace',untrusted:'discard'};
const fresh=restoreProjects(wrap(newer),()=> 'copy')[0];assert.equal(fresh.pendingReply,'Unfinished reply');assert.equal(fresh.responseLength,'long');assert.equal(fresh.replyPlacement,'replace');assert(!('untrusted'in fresh));
for(const malformed of [null,{},wrap(null),wrap({...old,sources:[null]}),wrap({...old,notes:[{role:'x',text:9}]}),wrap({...old,pendingReply:'x'.repeat(200001)})])assert.throws(()=>restoreProjects(malformed,()=> 'id'));
assert.equal(mergeReply('Original','New','append').draft,'Original\n\n## Next part\n\nNew');assert.equal(mergeReply('Original','New','replace').draft,'New');
const full=mergeReply('x'.repeat(199999),'New','append');assert(full.full);assert.equal(full.draft.length,199999);
console.log('Android data checks passed: legacy restore, unfinished replies, safe copies, malformed backups, append/replace and full draft preservation.');

const annotated={...old,sources:[{name:'Book',text:'Hello',reading:{offset:0,bookmarks:[0],annotations:[{id:'one',start:0,end:5,quote:'Hello',color:'gold',note:'My note'}]}}]};
assert.equal(restoreProjects(wrap(annotated),()=> 'copy')[0].sources[0].reading.annotations[0].note,'My note');
assert.throws(()=>restoreProjects(wrap({...annotated,sources:[{...annotated.sources[0],text:'Other'}]}),()=> 'copy'));
console.log('Reading-note backup checks passed: anchored notes preserved and changed text rejected.');

assert(mergeReply('🙂'.repeat(49999),'Another paragraph','append').full);

const pages=[{number:1,text:'First page.',ocr:false},{number:2,text:'Second page 🙂.',ocr:true}];
const evidence=[{id:1,sourceName:'Book',page:2,text:'Second page 🙂.',ocr:true}];
const withPages={...old,sources:[{name:'Book',text:'First page. Second page 🙂.',pages}],notes:[{role:'Assistant',text:'See [1].',evidence}]};
const roundtrip=restoreProjects(wrap(withPages),()=> 'pages')[0];
assert.deepEqual(JSON.parse(JSON.stringify(roundtrip.sources[0].pages)),pages);
assert.deepEqual(JSON.parse(JSON.stringify(roundtrip.notes[0].evidence)),evidence);
roundtrip.sources[0].pages[0].text='Changed';roundtrip.notes[0].evidence[0].text='Changed';
assert.equal(pages[0].text,'First page.');assert.equal(evidence[0].text,'Second page 🙂.');
for(const badPages of [null,{},[null],[{number:0,text:'x',ocr:false}],[{number:1,text:'x',ocr:'yes'}],[pages[0],pages[0]],Array(601).fill(pages[0]),[{number:1,text:'🙂'.repeat(500001),ocr:false}]]){
 assert.throws(()=>restoreProjects(wrap({...old,sources:[{name:'Book',text:'x',pages:badPages}]}),()=> 'id'));
}
for(const badEvidence of [null,{},[null],[{...evidence[0],page:0}],[{...evidence[0],text:'🙂'.repeat(501)}],[evidence[0],evidence[0]],[{...evidence[0],ocr:'yes'}]]){
 assert.throws(()=>restoreProjects(wrap({...old,notes:[{role:'Assistant',text:'Answer',evidence:badEvidence}]}),()=> 'id'));
}
console.log('Source-page and answer-evidence restore checks passed: exact snapshots, independent copies, UTF-8 limits and invalid metadata rejection.');

// Storage and writing limits are bytes; UTF-16 character counts undercount Unicode.
for(const [field,limit] of [['draft',200000],['prompt',100000],['pendingReply',200000]]){
 const exact='🙂'.repeat(limit/4);assert.equal(new TextEncoder().encode(exact).length,limit);
 assert.equal(restoreProjects(wrap({...old,[field]:exact}),()=> 'id')[0][field],exact);
 assert.throws(()=>restoreProjects(wrap({...old,[field]:exact+'a'}),()=> 'id'));
}
for(const [base,limit,make,select] of [
 ['界',200000,text=>({...old,notes:[{role:'Assistant',text}]}),p=>p.notes[0].text],
 ['🙂',2000000,text=>({...old,sources:[{name:'Book',text}]}),p=>p.sources[0].text],
 ['界',2000,name=>({...old,sources:[{name,text:'Chapter'}]}),p=>p.sources[0].name],
]){
 const bytes=new TextEncoder().encode(base).length,exact=base.repeat(Math.floor(limit/bytes))+'a'.repeat(limit%bytes);
 assert.equal(select(restoreProjects(wrap(make(exact)),()=> 'id')[0]),exact);
 assert.throws(()=>restoreProjects(wrap(make(exact+'a')),()=> 'id'));
}
// Conversation names retain their existing character limit, including non-Latin names.
assert.equal(restoreProjects(wrap({...old,name:'界'.repeat(160)}),()=> 'id')[0].name.length,160);
assert.throws(()=>restoreProjects({kind:'coucou-mobile-backup',projects:[old,{...old,draft:'🙂'.repeat(50001)}]},()=> 'id'));
console.log('Unicode restore checks passed: byte-exact writing, prompt, reply, source and note boundaries; legacy title limits preserved; invalid later conversation rejected.');
