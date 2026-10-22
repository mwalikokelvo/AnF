import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {planVersionBump,versionFiles} from './bump-version.mjs';
const root=fileURLToPath(new URL('../windows/',import.meta.url));
const source=Object.fromEntries(versionFiles.map(name=>[name,readFileSync(path.join(root,name),'utf8').replace(/\r\n/g,'\n')]));
const old=JSON.parse(source['package.json']).version,next='99.98.97';
// Reproduce the real failure: an unrelated dependency shares the application
// version. Its entire lock entry and JS metadata must remain byte/data-identical.
const dependency='\n[[package]]\nname = "version-collision-fixture"\nversion = "'+old+'"\nchecksum = "keep-this-exactly"\n';
const fixture={...source,'Cargo.lock':source['Cargo.lock']+dependency};
const js=JSON.parse(fixture['package-lock.json']);js.packages['node_modules/version-collision-fixture']={version:old,resolved:'https://example.invalid/'+old};fixture['package-lock.json']=JSON.stringify(js);
const out=planVersionBump(fixture,next);
assert(out['Cargo.lock'].endsWith(dependency));
assert.deepEqual(JSON.parse(out['package-lock.json']).packages['node_modules/version-collision-fixture'],js.packages['node_modules/version-collision-fixture']);
assert.equal(JSON.parse(out['src-tauri/tauri.conf.json']).version,next);
assert.equal(JSON.parse(out['package.json']).version,next);
const bad={...fixture,'src-tauri/tauri.conf.json':'{"version":"1.2.3"}'};
assert.throws(()=>planVersionBump(bad,next),/disagree/);
assert.throws(()=>planVersionBump(fixture,'garbage'),/three-part/);
// Current source must also remain internally coherent without changing it.
planVersionBump(source,old);
console.log('PASS: application version coherence; colliding dependency versions/checksums/URLs preserved; mismatches rejected before writes.');
