import {readdirSync,readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const old=String.fromCharCode(99,111,117,99,111,117),pattern=new RegExp(old,'i');
const excluded=new Set(['.git','node_modules','target','dist','build','gradle-build','gradle-input','.gradle','.tools','worktrees','release','releases','models','vendor','DerivedData','spotube-native','.venv','venv','__pycache__']);
const failures=[];let inspected=0;
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
 if(excluded.has(entry.name)||entry.isSymbolicLink())continue;
 const file=path.join(dir,entry.name),relative=path.relative(root,file);
 if(pattern.test(entry.name))failures.push(relative+' (path)');
 if(entry.isDirectory()){walk(file);continue;}
 if(/\.(?:png|jpg|jpeg|webp|gif|ico|icns|pdf|zip|7z|tar|gz|xz|apk|aab|woff2?|ttf|otf|m4a|mp3|wav|ogg|flac|sqlite|db|exe|dll|so|dylib|pyd|bin|gguf|ggml|safetensors|pt|pth|onnx|npy|npz)$/i.test(entry.name))continue;
 if(statSync(file).size>16*1024*1024)throw Error('Unclassified file exceeds 16 MiB branding audit limit: '+relative);
 const bytes=readFileSync(file);if(bytes.includes(0))continue;
 inspected++;if(pattern.test(bytes.toString('utf8')))failures.push(relative+' (content)');
}}
walk(root);if(failures.length)throw Error('Obsolete product branding:\n'+failures.join('\n'));
console.log(`PASS: branding audit (${inspected} text files; generated/vendor/model/binary trees excluded).`);
