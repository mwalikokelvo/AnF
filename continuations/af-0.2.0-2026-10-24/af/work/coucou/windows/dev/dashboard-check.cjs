const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const c={module:{exports:{}},TextEncoder,Date};vm.runInNewContext(fs.readFileSync(process.argv[2],'utf8'),c);const{draftTasks,captureText,dayName}=c.module.exports;
const input='- [ ] Real task\n```md\n- [ ] Example, not a task\n```\n> - [ ] Quoted example\n* [x] Finished\n~~~\n- [ ] Hidden example\n~~~\n- [ ] 🌻 Read';
const tasks=draftTasks(input);assert.equal(tasks.length,3);assert.equal(tasks.filter(t=>!t.checked).length,2);assert.equal(tasks[2].text,'🌻 Read');assert.equal(tasks[2].line,9);
assert.equal(dayName(new Date(2026,0,2)),'Daily · 2026-01-02');const next=captureText('Existing writing','New thought',new Date(2026,0,2,9,5));assert(next.startsWith('Existing writing\n\n## '));assert(next.endsWith('\n\nNew thought'));assert.throws(()=>captureText('','  '));assert.throws(()=>captureText('','a'.repeat(8001)));assert.throws(()=>captureText('🌻'.repeat(50000),'One more'));
console.log('Dashboard checks passed: fenced/quoted examples ignored, original task locations retained, local dates, append-only capture and size limits.');

const nested=['- [ ] Before','````md','- [ ] Example','```','- [ ] Still an example','```` trailing','- [ ] Not closed yet','~~~~','- [ ] Wrong marker','`````','- [x] After'].join('\n');
assert.deepEqual(JSON.parse(JSON.stringify(draftTasks(nested))),[{line:0,text:'Before',checked:false},{line:10,text:'After',checked:true}]);
assert.equal(draftTasks('~~~md\n- [ ] Example\n~~~\n* [ ] Real').length,1);
assert.equal(draftTasks('```md\n- [ ] Unclosed').length,0);
assert.equal(draftTasks('   ````\n- [ ] Hidden\n   ````\n- [ ] Visible')[0].text,'Visible');
console.log('Fence boundary checks passed: longer/shorter runs, closing information, mixed markers, unclosed blocks and original task line numbers.');
