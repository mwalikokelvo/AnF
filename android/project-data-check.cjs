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
