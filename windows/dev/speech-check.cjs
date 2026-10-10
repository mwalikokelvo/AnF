const {sentences}=require(require('node:path').resolve(process.argv[2]));const assert=require('node:assert/strict');
assert.deepEqual(sentences('One sentence. Second question? Last!'),['One sentence.',' Second question?',' Last!']);
const text='a'.repeat(1799)+'🌻'+'b'.repeat(2400)+'.';const parts=sentences(text);assert.equal(parts.join(''),text);assert(parts.every(p=>p.length<=1800));assert(parts.every(p=>!/[\uD800-\uDBFF]$/.test(p)));assert.deepEqual(sentences(''),[]);
console.log('Speech segmentation checks passed: punctuation, bounded native chunks, empty text and Unicode boundaries.');
