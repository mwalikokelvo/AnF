import {readFileSync,lstatSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const old=/coucou/i;
// Exact compatibility tokens, scoped to their actual implementation or test.
// Never rename these bytes to make a branding test pass: they identify existing
// app sandboxes, cryptographic payloads, profiles and old upgrade fixtures.
const compatibility=new Map([
 ['.github/workflows/android-release-gate.yml',['com.coucou.workspace']],
 ['.github/workflows/android.yml',['com.coucou.workspace']],
 ['.github/workflows/windows.yml',['Coucou-Windows-setup']],
 ['android/build.gradle',['com.coucou.workspace']],
 ['android/java/com/anf/workspace/MainActivity.java',['com.coucou.workspace','https://coucou.local/','coucouDownloadResult','coucouFeedResult']],
 ['android/src/androidTest/java/com/anf/workspace/UpgradeUiTest.java',['com.coucou.workspace','coucou.local','CoucouAndroid','coucou-mobile']],
 ['crates/anf-vault/src/lib.rs',['coucou-conflict-v1']],
 ['plugins/anf-tauri-toolkit/skills/tauri-project/scripts/inspect_tauri.py',['build-work/af/work/coucou/windows']],
 ['scripts/app-qa/android-upgrade.py',['com.coucou.workspace']],
 ['scripts/app-qa/music-hub.mjs',['coucou-audio']],
 ['scripts/app-qa/native-music-player.mjs',['coucou-audio']],
 ['scripts/app-qa/run-android-upgrade.sh',['com.coucou.workspace']],
 ['scripts/app-qa/windows-ui.mjs',["'Coucou'"]],
 ['scripts/app-qa/windows-upgrade.ps1',["'Coucou'",'coucou.exe','coucou.log','Get-Process coucou,AnF']],
 ['scripts/check-identity-migration.mjs',[String.raw`com\.coucou\.workspace`]],
 ['windows/src/workspace/main.ts',['coucou-windows-backup']],
 ['windows/src/workspace/podcast-feeds.ts',['coucouFeedResult']],
 ['windows/src-tauri/nsis/hooks.nsh',['coucou.exe','Coucou.lnk']],
]);
const upstreamUrl=/https:\/\/github\.com\/Louis-CFM\/coucou(?=[/"'\s)>]|$)/g;
const historicalDoc=name=>name==='README.md'||name==='CLAUDE.md'||name==='android/RELEASE-PROCEDURE.txt'||name==='windows/README.md'||name.startsWith('docs/');
const auditFiles=new Set(['scripts/check-branding.mjs','scripts/check-branding-test.mjs','scripts/app-qa/appearance.mjs']);

export function brandingProblems(name,text){
 const problems=[];
 if(old.test(name))problems.push(name+' (obsolete source path)');
 if(auditFiles.has(name))return problems; // The audit and visible-body assertion must name the rejected brand.
 if(historicalDoc(name)){
  // History, upstream copyright, old artifact filenames and migration paths
  // are legitimate prose. Current project titles and website chrome are not.
  if(name.endsWith('.html')){
   for(const match of text.matchAll(/<(?:title|h1)\b[^>]*>([^<]*)|<span\s+class="name"[^>]*>([^<]*)/gi)){
    if(old.test(match[1]??match[2]??''))problems.push(name+' (visible legacy title)');
   }
  }else if(old.test(text.split(/\r?\n/).find(line=>/^#\s/.test(line))??''))problems.push(name+' (visible legacy heading)');
  return problems;
 }
 let remaining=text.replace(upstreamUrl,'UPSTREAM_REPOSITORY');
 for(const token of compatibility.get(name)??[])remaining=remaining.replaceAll(token,'COMPATIBILITY_IDENTIFIER');
 if(old.test(remaining))problems.push(name+' (unreviewed legacy branding)');
 return problems;
}

export function checkBranding(){
 // Audit tracked product inputs, not private/generated files or archived full
 // checkouts. Git still lists new staged inputs during the integration merge.
 const list=spawnSync('git',['ls-files','-z','--cached'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
 if(list.error||list.status!==0)throw Error('Branding audit requires a Git source checkout.');
 const failures=[];let inspected=0;
 const excluded=new Set(['.git','node_modules','target','dist','build','gradle-build','gradle-input','.gradle','.tools','worktrees','release','releases','models','vendor','DerivedData','spotube-native','.venv','venv','__pycache__']);
 for(const name of new Set(list.stdout.split('\0').filter(Boolean))){
  if(name.startsWith('continuations/')||name.startsWith('_core/'))continue; // Archived/separate projects; never ship them as this product.
  if(name.split('/').some(part=>excluded.has(part)))continue;
  if(/\.(?:png|jpg|jpeg|webp|gif|ico|icns|pdf|zip|7z|tar|gz|xz|apk|aab|woff2?|ttf|otf|m4a|mp3|wav|ogg|flac|sqlite|db|exe|dll|so|dylib|pyd|bin|gguf|ggml|safetensors|pt|pth|onnx|npy|npz)$/i.test(name))continue;
  const file=path.join(root,name),stat=lstatSync(file);
  if(stat.isSymbolicLink())throw Error('Unexpected linked tracked source: '+name);
  if(stat.size>16*1024*1024)throw Error('Unclassified file exceeds16MiB audit limit: '+name);
  const bytes=readFileSync(file);if(bytes.includes(0))continue;
  inspected++;failures.push(...brandingProblems(name,bytes.toString('utf8')));
 }
 if(failures.length)throw Error('Obsolete product branding:\n'+failures.join('\n'));
 console.log(`PASS: branding audit (${inspected} tracked product text files; exact compatibility exceptions; history retained).`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)checkBranding();
