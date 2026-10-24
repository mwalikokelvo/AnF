const assert=require('node:assert/strict');
const {EditorState,Compartment,writingGuard}=require(require('node:path').resolve(process.argv[2]));
let external=false;const notices=[],lock=new Compartment();
let state=EditorState.create({doc:'Original',extensions:[lock.of(EditorState.readOnly.of(false)),writingGuard(()=>external,s=>notices.push(s))]});
const apply=spec=>state=state.update(spec).state;
apply({changes:{from:8,insert:' writing'}});assert.equal(state.doc.toString(),'Original writing');
apply({effects:lock.reconfigure(EditorState.readOnly.of(true))});assert(state.readOnly);
for(const changes of [{from:0,to:state.doc.length,insert:'Replacement'},{from:0,insert:'Completion'},{from:0,to:1}]){
 apply({changes});assert.equal(state.doc.toString(),'Original writing','Locked document rejects raw command/completion changes');
}
assert.equal(notices.length,0,'Locked transactions are refused without size warnings');apply({selection:{anchor:3}});assert.equal(state.selection.main.head,3,'Selection remains available while locked');
external=true;apply({changes:{from:0,to:state.doc.length,insert:'Another project'}});external=false;assert.equal(state.doc.toString(),'Another project');assert(state.readOnly,'Host synchronization preserves the lock');
apply({effects:lock.reconfigure(EditorState.readOnly.of(false))});assert(!state.readOnly);apply({changes:{from:state.doc.length,insert:' edited'}});assert.equal(state.doc.toString(),'Another project edited');
const exact='🙂'.repeat(50000);apply({changes:{from:0,to:state.doc.length,insert:exact}});assert.equal(state.doc.toString(),exact);apply({changes:{from:state.doc.length,insert:'a'}});assert.equal(state.doc.toString(),exact);assert.equal(notices.length,1);
external=true;apply({changes:{from:0,to:state.doc.length,insert:exact+'Existing imported text'}});external=false;assert(state.doc.length>exact.length,'Host sync retains existing oversized content without silent truncation');apply({changes:{from:0,to:state.doc.length,insert:'Shortened'}});assert.equal(state.doc.toString(),'Shortened','An oversized existing document can be shortened normally');
console.log('CodeMirror state checks passed: real transaction lock/unlock, command/completion refusal, selection, trusted sync, exact Unicode byte limit, overflow refusal and shortening existing content.');
