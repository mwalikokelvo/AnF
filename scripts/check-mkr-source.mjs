import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {checkManifest,checkSource,verifyPrepared,prepareCatalog} from '../integrations/mkr-music/prepare-catalog.mjs';
const root=fileURLToPath(new URL('../integrations/mkr-music/',import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'catalog-source.json'),'utf8'));
checkManifest(manifest);
assert.equal(manifest.sources.filter(e=>e.path.endsWith('.kt')).length,104);
for(const mutate of [m=>{m.sources[0].path='../escape.kt';},m=>{m.sources[0].path='app/Musixmatch.kt';},m=>{m.sources[1].path=m.sources[0].path;},m=>{m.commit='not-the-pin';},m=>{m.sources[0].sha256='bad';}]){
 const fixture=structuredClone(manifest);mutate(fixture);assert.throws(()=>checkManifest(fixture));
}
function blob(text){const bytes=Buffer.from(text);return[{path:'innertube/src/main/kotlin/Test.kt',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length},bytes];}
for(const text of ['package safe\nimport android.app.Activity','package safe\nval apiKey = "synthetic-secret-not-for-output"','package musixmatch']){
 const [entry,bytes]=blob(text);assert.throws(()=>checkSource(entry,bytes),error=>!error.message.includes('synthetic-secret'));
}
const [entry,bytes]=blob('package safe\nval noCredential = true');checkSource(entry,bytes);assert.throws(()=>checkSource(entry,Buffer.from('changed')));
const vendor=path.join(root,'engine/vendor/mkr');
if(fs.existsSync(vendor)){
 verifyPrepared(vendor,manifest);
 const sandbox=fs.mkdtempSync(path.join(os.tmpdir(),'anf-mkr-source-'));
 const altered=path.join(sandbox,'altered');fs.cpSync(vendor,altered,{recursive:true});
 const selected=manifest.sources.find(e=>e.path.endsWith('.kt')).path;
 const alteredFile=path.join(altered,selected),original=fs.readFileSync(alteredFile);
 fs.appendFileSync(alteredFile,'\n// changed fixture\n');
 const changed=fs.readFileSync(alteredFile);
 assert.throws(()=>prepareCatalog(undefined,altered));
 assert.deepEqual(fs.readFileSync(alteredFile),changed,'Changed source must not be overwritten');
 assert.deepEqual(fs.readFileSync(path.join(vendor,selected)),original,'Product source must remain intact');
 fs.writeFileSync(path.join(altered,'unexpected.txt'),'fixture');assert.throws(()=>verifyPrepared(altered,manifest));
 const linked=path.join(sandbox,'linked');fs.symlinkSync(vendor,linked,process.platform==='win32'?'junction':'dir');assert.throws(()=>verifyPrepared(linked,manifest));
 console.log('Verified actual prepared source and fail-closed modified/unlisted/junction fixtures: '+sandbox);
}else console.log('Prepared upstream sources absent; manifest/synthetic tests only. No native playback verification.');
console.log('PASS: MKR pinned-source paths, digests, restricted/credential/platform exclusions and preservation. No runtime availability enabled.');
