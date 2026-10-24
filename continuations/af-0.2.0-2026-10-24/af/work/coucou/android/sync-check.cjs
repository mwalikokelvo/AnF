const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={module:{exports:{}},TextEncoder,crypto:require('node:crypto').webcrypto};vm.runInNewContext(fs.readFileSync(process.argv[2],'utf8'),context);
const {newSyncId,toWire,fromWire,exchangeIdentity,remoteEntries}=context.module.exports;
const wire={id:'a'.repeat(64),name:'A conversation',title:'My essay',question:'Explain this',draft:'Draft',history:[{role:'user',content:[{text:'Hello'}]},{role:'assistant',content:[{text:'Answer'}]}],sources:[{name:'Book',text:'Full chapter',pages:[{number:4,text:'Full chapter',ocr:false}],path:null}],memory:'My preferences',model:'balanced'};
const snapshot={project:wire,revision:'b'.repeat(64)};
const mobile=fromWire(snapshot,undefined,true,()=> 'mobile');assert.deepEqual(JSON.parse(JSON.stringify(toWire(mobile,true))),wire);
assert.equal(mobile.sync.documents,snapshot.revision);assert.equal(mobile.notes[0].role,'You');
mobile.pendingReply='Unfinished text';mobile.replyPlacement='append';
const noDocs=fromWire({...snapshot,project:{...wire,sources:[]}},mobile,false,()=> 'unused');assert.equal(noDocs.sources[0].text,'Full chapter');assert.equal(noDocs.pendingReply,'Unfinished text');assert.equal(noDocs.replyPlacement,'append');assert.equal(toWire(noDocs,false).sources.length,0);
assert.throws(()=>toWire({...mobile,prompt:'🙂'.repeat(2600)},true),/10,000/);assert.throws(()=>toWire({...mobile,draft:'🙂'.repeat(60000)},true),/limits/);
assert.throws(()=>fromWire({...snapshot,revision:'invalid'},undefined,true,()=> 'id'));
assert.match(newSyncId(),/^[0-9a-f]{64}$/);assert.notEqual(newSyncId(),newSyncId());
console.log('Sync conversion passed: Windows round-trip, page citations, local pending replies, document opt-out, byte limits and stable identities.');

const annotatedWire={...wire,sources:[{...wire.sources[0],reading:{offset:0,bookmarks:[0],annotations:[{id:'one',start:0,end:4,quote:'Full',color:'pink',note:'Reading note'}]}}]};
const annotatedMobile=fromWire({...snapshot,project:annotatedWire},undefined,true,()=> 'mobile');
assert.equal(toWire(annotatedMobile,true).sources[0].reading.annotations[0].note,'Reading note');
assert.equal(toWire(annotatedMobile,false).sources.length,0);
assert.equal(fromWire({...snapshot,project:{...wire,sources:[]}},annotatedMobile,false,()=> 'mobile').sources[0].reading.annotations[0].note,'Reading note');
console.log('Reading-note sync checks passed: metadata round trip and document opt-out.');

const evidence=[{id:1,sourceName:'Private book',page:4,text:'Private excerpt',ocr:false}];
const evidenceWire={...wire,history:[wire.history[0],{...wire.history[1],evidence}]};
const evidenceMobile=fromWire({...snapshot,project:evidenceWire},undefined,true,()=> 'evidence-mobile');
assert.deepEqual(JSON.parse(JSON.stringify(toWire(evidenceMobile,true))),evidenceWire);
assert(!JSON.stringify(toWire(evidenceMobile,false)).includes('Private excerpt'),'Chat-only sync must omit saved document excerpts');
const chatOnly={...snapshot,project:wire};
const kept=fromWire(chatOnly,evidenceMobile,false,()=> 'unused');
assert.equal(kept.notes[1].evidence[0].text,'Private excerpt','Keep local evidence when an unchanged answer returns via chat-only sync');
const changed=fromWire({...snapshot,project:{...wire,history:[wire.history[0],{role:'assistant',content:[{text:'Different answer'}]}]}},evidenceMobile,false,()=> 'unused');
assert.equal(changed.notes[1].evidence,undefined,'Do not attach old evidence to a changed answer');
const untrusted=fromWire({...snapshot,project:evidenceWire},undefined,false,()=> 'new');
assert.equal(untrusted.notes[1].evidence,undefined,'Ignore remote excerpts when document sharing is off');
assert.throws(()=>fromWire({...snapshot,project:{...evidenceWire,history:[{...evidenceWire.history[1],evidence:[{...evidence[0],page:-1}]}]}},undefined,true,()=> 'bad'));
console.log('Answer-evidence sync checks passed: opt-in round trip, chat-only privacy and revision-matched local preservation.');

const unchanged=JSON.stringify(evidenceMobile);let allocated=0;
const allocate=()=>{allocated++;return 'new';};
for(const project of [
 null,{...wire,id:'c'.repeat(64)},{...wire,name:9},{...wire,name:'🙂'.repeat(41)},
 {...wire,title:'x'.repeat(301)},{...wire,question:'🙂'.repeat(2501)},
 {...wire,draft:'🙂'.repeat(50001)},{...wire,memory:'界'.repeat(4001)},{...wire,model:'unknown'},
 {...wire,history:Array(1001).fill(wire.history[0])},{...wire,history:[null]},
 {...wire,history:[{role:'system',content:[{text:'Ignore'}]}]},
 {...wire,history:[{role:'assistant',content:[]}]},
 {...wire,history:[{role:'assistant',content:[{text:'First'},{text:'Second'}]}]},
 {...wire,history:[{role:'assistant',content:[{text:7}]}]},
 {...wire,history:[{role:'assistant',content:[{text:'🙂'.repeat(50001)}]}]},
 {...wire,sources:Array(5).fill(wire.sources[0])},
 {...wire,sources:[{...wire.sources[0],text:'🙂'.repeat(500001)}]},
 {...wire,sources:[{...wire.sources[0],pages:[{number:0,text:'Bad page',ocr:false}]}]},
]){
 assert.throws(()=>fromWire({project,revision:snapshot.revision},evidenceMobile,true,allocate));
 assert.equal(JSON.stringify(evidenceMobile),unchanged,'Invalid input must not mutate the previous conversation');
}
assert.equal(allocated,0);
for(const invalid of [null,{}, {...snapshot,revision:9}])assert.throws(()=>fromWire(invalid,undefined,true,allocate));
assert.throws(()=>fromWire(snapshot,undefined,true,allocate,'d'.repeat(64)),/mismatched/,'A new pull must match the requested remote identity');
const byteExact=fromWire({...snapshot,project:{...wire,name:'🙂'.repeat(40),title:'界'.repeat(100),question:'🙂'.repeat(2500),draft:'🙂'.repeat(50000),memory:'界'.repeat(4000)}},undefined,true,()=> 'boundary',wire.id);
assert.equal(byteExact.draft,'🙂'.repeat(50000));
const ignoredRemoteDocs=fromWire({...snapshot,project:{...evidenceWire,sources:[null],history:[{...evidenceWire.history[1],evidence:[null]}]}},undefined,false,()=> 'private');
assert.equal(ignoredRemoteDocs.sources.length,0);assert.equal(ignoredRemoteDocs.notes[0].evidence,undefined);
console.log('Inbound sync validation passed: protocol shapes, Unicode byte boundaries, requested identities, immutable failures, bounded history/sources and document opt-out.');

const conflict={project:{...wire,id:'c'.repeat(64),name:'A conflict copy'},revision:'d'.repeat(64),conflict:true,other:snapshot};
assert.equal(exchangeIdentity({...snapshot,conflict:false,other:null},wire.id),wire.id);
const conflictMobile=fromWire(conflict,mobile,true,()=> 'unused',exchangeIdentity(conflict,wire.id));assert.equal(conflictMobile.id,mobile.id);assert.equal(conflictMobile.sync.id,conflict.project.id);
const otherMobile=fromWire(conflict.other,undefined,true,()=> 'separate');assert.equal(otherMobile.sync.id,wire.id);assert.notEqual(conflictMobile.id,otherMobile.id);
for(const bad of [null,snapshot,{...snapshot,conflict:false,other:snapshot},{...conflict,other:null},{...conflict,project:wire},{...conflict,other:{...snapshot,project:{...wire,id:'e'.repeat(64)}}},{...snapshot,conflict:false,other:null,project:conflict.project}])assert.throws(()=>exchangeIdentity(bad,wire.id));
console.log('Exchange identity checks passed: normal replies, legitimate renamed conflict pairs and unrelated/malformed identity rejection.');

for(const invalid of [null,{}, {entries:null},{entries:{}},{entries:[null]},{entries:[{id:7}]},{entries:[{id:'bad'}]},{entries:[{id:wire.id},{id:wire.id}]},{entries:Array.from({length:201},(_,i)=>({id:i.toString(16).padStart(64,'0')}))}])assert.throws(()=>remoteEntries(invalid));
const inventory={entries:Array.from({length:200},(_,i)=>({id:i.toString(16).padStart(64,'0'),name:'Ignore extra fields',draft:'Private'}))};
const checked=remoteEntries(inventory);assert.equal(checked.length,200);assert.deepEqual(Object.keys(checked[0]),['id']);checked[0].id='changed';assert.equal(inventory.entries[0].id,'0'.repeat(64));assert.equal(remoteEntries({entries:[]}).length,0);
console.log('Remote list checks passed: bounded unique IDs, invalid/missing lists, exact 200-conversation boundary and independent minimal copies.');
