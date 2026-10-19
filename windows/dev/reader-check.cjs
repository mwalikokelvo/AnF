const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const context={module:{exports:{}},TextEncoder};vm.runInNewContext(fs.readFileSync(process.argv[2],'utf8'),context);
const {sections,readingState,addHighlight,clipText}=context.module.exports;
const text='[Page 1]\nHello 🌻 world.\n'+'Paragraph text.\n'.repeat(1000);const parts=sections(text);
assert.equal(parts.map(p=>text.slice(p.start,p.end)).join(''),text);assert(parts.length>1);assert.equal(parts[0].label,'[Page 1]');assert(parts.every(p=>p.end-p.start<=3500));
const emoji='a'.repeat(3499)+'🌻'+'b'.repeat(4000);const unicode=sections(emoji);assert.equal(unicode[0].end,3499);assert.equal(unicode.map(p=>emoji.slice(p.start,p.end)).join(''),emoji);
for(const separator of [' ','\n']){const boundary='a'.repeat(3500)+separator+'b'.repeat(4000);const chunks=sections(boundary);assert(chunks.every(p=>p.end-p.start<=3500));assert.equal(chunks.map(p=>boundary.slice(p.start,p.end)).join(''),boundary);}
const prose='word '.repeat(1500);const words=sections(prose);assert(words.slice(0,-1).every(p=>prose[p.end-1]===' '));assert.equal(words.map(p=>prose.slice(p.start,p.end)).join(''),prose);
const start=text.indexOf('Hello'),end=start+'Hello 🌻'.length;const state=addHighlight(readingState(null,text),text,start,end,'gold','My note','note-1');assert.equal(state.annotations[0].quote,'Hello 🌻');
assert.throws(()=>readingState(state,text.replace('Hello','Other')),/matches/);assert.throws(()=>addHighlight(state,text,start,end,'green','','note-1'),/matches/);
assert.throws(()=>readingState({...state,offset:-1},text),/Invalid/);assert.throws(()=>readingState({...state,annotations:Array(101).fill(state.annotations[0])},text),/Invalid/);
assert.equal(clipText('Draft','Quote','Book'),'Draft\n\nQuote\n\nSource: Book');assert.throws(()=>clipText('🙂'.repeat(50000),'x','Book'),/limit/);
console.log('Reader checks passed: lossless sectioning, Unicode boundaries, exact quote anchors, invalid metadata, duplicate IDs and bounded draft clipping.');

const {documentMatches,readingNotesMarkdown,sourceSections}=require(process.argv[2]);
assert.deepEqual(documentMatches('A.b a.B','a.b'),[{start:0,end:3},{start:4,end:7}]);
assert.deepEqual(documentMatches('A.b a.B','a.b',true),[]);
assert.deepEqual(documentMatches('😀 İ x','İ'),[{start:3,end:4}]);
assert.equal(documentMatches('x'.repeat(6000),'x').length,5000);
assert.deepEqual(documentMatches('abcdef','['),[]);
assert.match(readingNotesMarkdown({name:'Book',text:'text'}),/No highlights saved/);
assert.equal(sourceSections({name:'PDF',text:'A\n\n',pages:[{number:1,text:'A'},{number:2,text:''}]}).length,2);
console.log('Reader additions: literal Unicode search, case matching, bounded results, page boundaries and note export passed.');
