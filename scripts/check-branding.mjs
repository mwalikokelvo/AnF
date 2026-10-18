import {readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const old=String.fromCharCode(99,111,117,99,111,117),pattern=new RegExp(old,'i');
const excluded=new Set(['.git','node_modules','target','dist','build','gradle-build','gradle-input','.gradle','.tools','worktrees','releases','models','vendor','DerivedData']);
const failures=[];let inspected=0;
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
 if(excluded.has(entry.name)||entry.isSymbolicLink())continue;
 const file=path.join(dir,entry.name),relative=path.relative(root,file);
 if(pattern.test(entry.name))failures.push(relative+' (path)');
 if(entry.isDirectory()){walk(file);continue;}
 const bytes=readFileSync(file);if(bytes.includes(0)||/\.(?:png|jpg|jpeg|webp|gif|ico|icns|pdf|zip|apk|aab|woff2?|ttf|otf|m4a|mp3|wav|ogg|flac|sqlite|db|exe|dll|bin)$/i.test(entry.name))continue;
 inspected++;if(pattern.test(bytes.toString('utf8')))failures.push(relative+' (content)');
}}
walk(root);if(failures.length)throw Error('Obsolete product branding:\n'+failures.join('\n'));
console.log(`PASS: branding audit (${inspected} text files; generated/vendor/model/binary trees excluded).`);
