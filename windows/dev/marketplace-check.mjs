import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
import {transform} from 'esbuild';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const code=(await transform(fs.readFileSync('src/workspace/addon-data.ts','utf8'),{loader:'ts',format:'esm'})).code;
const data=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const registry=data.catalog(JSON.parse(fs.readFileSync('../marketplace/registry.json')));
for(const m of registry){
 const file='../marketplace/'+(m.type==='theme'?'sample-theme':'sample-plugin')+'/'+m.entry;
 assert.equal(m.sha256,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
}
assert.match(data.themeStyle(fs.readFileSync('../marketplace/sample-theme/theme.css','utf8')),/--accent:#cba6f7/);
for(const css of [':root{--anf-bg:url(https://evil.test)}','body{display:none}',':root{--anf-bg:#ffffff}@import url(x);',':root{--evil:#ffffff}',':root{--anf-radius:1000px}'])
 assert.throws(()=>data.themeStyle(css));
assert.throws(()=>data.catalog([registry[0],registry[0]]));
assert.throws(()=>data.manifest({...registry[0],id:'../escape'}));
assert.throws(()=>data.manifest({...registry[0],downloadUrl:'https://evil.test/theme.css'}));

// Run the actual sandbox bootstrap in a fresh VM, with no parent DOM or IPC.
// This verifies the messaging/lifecycle contract, not WebView's CSP enforcement.
import vm from 'node:vm';
const template=fs.readFileSync('src-tauri/src/addon-sandbox.html','utf8');
const plugin=fs.readFileSync('../marketplace/sample-plugin/index.js','utf8');
const html=template.replace('__ANF_PLUGIN_CODE__',JSON.stringify(plugin));
const messages=[],listeners=[];
const parent={postMessage:m=>messages.push(m)};
const context=vm.createContext({parent,window:{},addEventListener:(name,fn)=>{if(name==='message')listeners.push(fn);}});
vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1],context,{timeout:1000});
assert(messages.some(m=>m.type==='loaded'));
assert(messages.some(m=>m.type==='register'&&m.title==='Hello from your plugin'));
const before=messages.length;
listeners[0]({source:{},data:{anfHost:1,type:'ready'}});
assert.equal(messages.length,before);
listeners[0]({source:parent,data:{anfHost:1,type:'ready'}});
assert(messages.some(m=>m.message?.includes('App ready')));
const registration=messages.find(m=>m.type==='register');
listeners[0]({source:parent,data:{anfHost:1,type:'action',key:registration.key}});
assert(messages.some(m=>m.message?.startsWith('Hello!')));
assert.equal(context.window.__TAURI_INTERNALS__,undefined);
console.log('Marketplace hashes, manifest/theme rejection, sandbox startup, ready/action messages and sender checks passed.');
