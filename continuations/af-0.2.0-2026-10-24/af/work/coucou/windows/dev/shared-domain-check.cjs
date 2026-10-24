const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {core,legacy}=require(process.argv[2]);
for(const [area,api] of Object.entries(core)){
  assert.deepEqual(Object.keys(api).sort(),Object.keys(legacy[area]).sort(),area+' preserves the public API');
  for(const [name,value] of Object.entries(api))assert.equal(value,legacy[area][name],area+'.'+name+' has one implementation');
}
// Bundle the neutral boundary independently of either host. A transitive import
// into a platform directory or third-party runtime must fail this architecture check.
const source=path.resolve(__dirname,'../../shared/domain/index.ts');
const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`
  import {build} from ${JSON.stringify(require('node:url').pathToFileURL(require.resolve('esbuild')).href)};
  const result=await build({entryPoints:[${JSON.stringify(source)}],bundle:true,platform:'neutral',format:'esm',write:false,metafile:true});
  process.stdout.write(JSON.stringify(result.metafile));
`],{encoding:'utf8'}));
const shared=path.resolve(__dirname,'../../shared');
for(const input of Object.keys(result.inputs)){
  const relative=path.relative(shared,path.resolve(input));
  assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'Neutral domain depends only on shared source: '+input);
}
assert.ok(Object.keys(result.inputs).length>=7,'All neutral domains are included');
assert.ok(!fs.readFileSync(source,'utf8').includes('tauri'),'No native host in the shared public entry');
console.log('Shared domain boundary passed: six identical compatibility APIs and independently bundled platform-free dependency closure.');
