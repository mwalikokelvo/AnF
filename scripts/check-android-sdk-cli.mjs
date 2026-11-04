import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'anf-sdk-discovery-'));
const sdk=path.join(root,'SDK root with spaces');
const helper=fileURLToPath(new URL('./prepare-android-sdk.mjs',import.meta.url));
const binary=process.platform==='win32'?'android.exe':'android';
function tool(version,name=binary){const p=path.join(sdk,'cmdline-tools',version,'bin',name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'');return p;}
function run(arg='--print-cli'){return spawnSync(process.execPath,[helper,arg],{env:{...process.env,ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk},encoding:'utf8'});}
try{
  tool('latest','sdkmanager');assert.notEqual(run().status,0);
  const named=tool('16111833');assert.equal(run().status,0);assert.equal(run().stdout.trim(),named);
  tool('latest');assert.equal(run().stdout.trim(),named);
  fs.unlinkSync(named);assert.equal(run().stdout.trim(),path.join(sdk,'cmdline-tools/latest/bin',binary));
  assert.notEqual(run('--unsupported').status,0);
  assert.notEqual(run('--check').status,0); // No false success without actual SDK packages.
  console.log('PASS: numeric/latest CLI discovery, old sdkmanager rejection, spaces, option and SDK-file guards; no downloads or tool execution.');
}finally{
  assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('anf-sdk-discovery-'));
  fs.rmSync(root,{recursive:true,force:false});
}
