import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {androidContract} from './android-release-contract.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const config=JSON.parse(await readFile(new URL('../windows/src-tauri/tauri.conf.json',import.meta.url),'utf8'));
const hashes=new Set();
for(const legacy of [false,true])for(const review of [false,true]){
  const contract=await androidContract(root,{legacy,review});
  assert.equal(contract.applicationId,(legacy?'com.coucou.workspace':'com.anf.workspace')+(review?'.musicdev':''));
  assert.equal(contract.version,config.version+(review?'-music-preview':''));
  const [major,minor,patch]=config.version.split('.').map(Number);
  assert.equal(contract.versionCode,major*1000000+minor*1000+patch);
  assert.match(contract.sourceSha256,/^[a-f0-9]{64}$/);
  hashes.add(contract.sourceSha256);
}
assert.equal(hashes.size,4,'Review builds and separate installed identities need distinct provenance');
console.log('PASS: both installed Android identities and both isolated review suffixes have exact, distinct build contracts. No signer or upgrade acceptance claimed.');
