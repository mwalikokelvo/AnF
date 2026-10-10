const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={module:{exports:{}},TextEncoder};vm.runInNewContext(fs.readFileSync(process.argv[2],'utf8'),context);
const {summaries,readProject,backupProjects,signature}=context.module.exports;
function database(records){return{transaction(){let tx={abort(){queueMicrotask(()=>tx.onabort?.());},objectStore(){return{get(id){const req={};queueMicrotask(()=>{req.result=records.find(p=>p.id===id);req.onsuccess();});return req;},openCursor(){const req={};let i=0;const advance=()=>queueMicrotask(()=>{req.result=i<records.length?{value:records[i++],continue:advance}:null;req.onsuccess();});advance();return req;},getAll(){throw Error('Bulk loading must not be used');}};}};return tx;}};}
const sample={id:'one',name:'First',draft:'Draft',prompt:'Question',notes:[{role:'You',text:'Needle in old chat'}],sources:[{name:'Long book',text:'x'.repeat(2_000_000)}],updated:1,sync:{id:'remote'}};
(async()=>{
 const db=database([sample,{...sample,id:'two',name:'Second',notes:[],updated:2}]);
 const list=await summaries(db);assert.equal(list[0].id,'two');assert.equal(list.length,2);assert(!('sources'in list[0]));assert(!('notes'in list[0]));assert.equal(list[0].syncId,'remote');
 assert.equal((await summaries(db,'needle'))[0].id,'one');assert.equal((await summaries(db,'Long book')).length,0);
 assert.equal((await readProject(db,'one')).sources[0].text.length,2_000_000);assert.equal(await readProject(db,'missing'),undefined);
 assert.equal(signature(sample),signature({...sample,updated:999}));assert.notEqual(signature(sample),signature({...sample,draft:'Edited'}));
 assert.equal((await backupProjects(db)).length,2);
 await assert.rejects(backupProjects(database(Array.from({length:9},(_,i)=>({...sample,id:String(i)})))),/16 MB/);
 console.log('Storage checks passed: lightweight history, old-message search, one-project loading, unchanged-save detection, bounded backup and oversize refusal.');
})().catch(e=>{console.error(e);process.exitCode=1;});
