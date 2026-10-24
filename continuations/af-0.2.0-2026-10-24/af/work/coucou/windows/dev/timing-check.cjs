const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/island/fsm.ts', 'utf8');
const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
let tasks = new Map(), id = 0;
const context = {exports: {}, window: {setTimeout(fn, delay) {tasks.set(++id, {fn, delay}); return id;}, clearTimeout(id) {tasks.delete(id);}}};
vm.runInNewContext(code, context);
for (const seconds of [3, 5]) {
 const fsm = new context.exports.IslandStateMachine();
 fsm.homeToPetitDelay = seconds;
 fsm.forceHome(); fsm.mouseLeft();
 assert.equal(tasks.size, 1);
 assert.equal([...tasks.values()][0].delay, seconds * 1000);
 fsm.mouseEntered(); assert.equal(tasks.size, 0);
 fsm.mouseLeft(); [...tasks.values()][0].fn(); tasks.clear();
 assert.equal(fsm.state, 'petit');
 fsm.forceHome(); fsm.pinned = true; fsm.mouseLeft();
 assert.equal(tasks.size, 0); assert.equal(fsm.state, 'home');
}
console.log('3s and 5s timing checks passed, including hover cancellation and pinned alerts.');
