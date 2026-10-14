// Reconstruct a pinned, patched Flutter module. No signing/service secrets.
import {spawnSync} from 'node:child_process';
import {cp,mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const pin='69a310c78f5ceaf4eab7dfee98f187d38211c9ba';
const source=process.env.SPOTUBE_SOURCE||path.join(root,'../.cache/anf-spotube-source');
const desktop=process.argv.includes('--windows');
const module=path.join(root,desktop?'windows/spotube-native':'android/spotube-module');
const flutter=process.env.FLUTTER_BIN||'flutter';
function run(bin,args,cwd=root){const result=spawnSync(bin,args,{cwd,stdio:'inherit',env:process.env});if(result.error)throw result.error;if(result.status)throw Error(`${bin} failed (${result.status})`);}
try{await access(path.join(source,'.git'));}catch{await mkdir(path.dirname(source),{recursive:true});run('git',['clone','https://github.com/KRTirtho/spotube.git',source]);}
const sha=spawnSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).stdout.trim();
if(sha!==pin){run('git',['fetch','origin',pin],source);run('git',['checkout','--detach',pin],source);}
run('git',['diff','--exit-code',pin,'--','lib','assets','pubspec.yaml','l10n.yaml','LICENSE'],source);
try{await access(path.join(module,'.metadata'));}catch{run(flutter,desktop?['create','--template=app','--platforms=windows','--org=com.coucou','--project-name=spotube',module]:['create','--template=module','--org=com.coucou','--project-name=spotube',module]);}
for(const name of ['lib','assets','LICENSE','l10n.yaml'])await cp(path.join(source,name),path.join(module,name),{recursive:true});
let spec=await readFile(path.join(source,'pubspec.yaml'),'utf8');
// Standalone upstream SDK test plugins must not register in a release runtime AAR.
spec=spec.replace('  integration_test:\n    sdk: flutter\n','');
if(!desktop)spec=spec.replace('flutter:\n  generate: true','flutter:\n  module:\n    androidX: true\n    androidPackage: com.coucou.spotube\n    iosBundleIdentifier: com.coucou.spotube\n  generate: true');
await writeFile(path.join(module,'pubspec.yaml'),spec);
await cp(path.join(root,'integrations/spotube/pubspec.lock'),path.join(module,'pubspec.lock'));
await writeFile(path.join(module,'.env'),'LASTFM_API_KEY=\nLASTFM_API_SECRET=\nENABLE_UPDATE_CHECK=0\nRELEASE_CHANNEL=stable\nHIDE_DONATIONS=1\n');
let main=await readFile(path.join(module,'lib/main.dart'),'utf8');
main=main.replace("import 'dart:io';\n",'').replace("import 'package:spotube/collections/http-override.dart';\n",'');
main=main.replace("import 'dart:async';","import 'dart:async';\nimport 'anf_host.dart';");
main=main.replace('    );\n  });\n}', '    );\n    AnfHost.install();\n  });\n}');
main=main.replace('HttpOverrides.global = BadCertificateAllowlistOverrides();','// Use normal TLS verification inside AnF.');
main=main.replace('if (kIsDesktop) {','if (kIsDesktop && !AnfHost.embedded) {');
main=main.replace('ref.listen(trayManagerProvider, (_, __) {});','if (!AnfHost.embedded) ref.listen(trayManagerProvider, (_, __) {});');
for(const provider of ['bonsoirProvider','connectClientsProvider'])main=main.replace(`ref.listen(${provider}, (_, __) {});`,`if (!AnfHost.embedded) ref.listen(${provider}, (_, __) {});`);
for(const hook of ['useFixWindowStretching();','useCloseBehavior(ref);','useDeepLinking(ref, router);','useDisableBatteryOptimizations();'])main=main.replace(hook,`if (!AnfHost.embedded) ${hook}`);
main=main.replace('if (kIsMobile) {','if (kIsMobile && !AnfHost.embedded) {');
main=main.replace("title: 'Spotube',","title: 'AnF · Music Hub',");
main=main.replace('        return child;','        return AnfHost.embedded ? AnfHost.frame(child) : child;');
await writeFile(path.join(module,'lib/main.dart'),main);
await cp(path.join(root,'integrations/spotube/anf_host.dart'),path.join(module,'lib/anf_host.dart'));
// Embedded music does not own AnF's outer window or floating mini-player.
for(const [relative,changes] of [
  ['components/titlebar/titlebar.dart',[["import 'package:window_manager/window_manager.dart';","import 'package:window_manager/window_manager.dart';\nimport 'package:spotube/anf_host.dart';"],['if (kIsDesktop && !systemTitleBar)', 'if (!AnfHost.embedded && kIsDesktop && !systemTitleBar)'],['if (!kIsDesktop || systemTitlebar) return;', 'if (AnfHost.embedded || !kIsDesktop || systemTitlebar) return;']]],
  ['components/titlebar/titlebar_buttons.dart',[["import 'package:window_manager/window_manager.dart';","import 'package:window_manager/window_manager.dart';\nimport 'package:spotube/anf_host.dart';"],['if (!kTitlebarVisible || preferences.systemTitleBar)', 'if (AnfHost.embedded || !kTitlebarVisible || preferences.systemTitleBar)']]],
  ['modules/root/bottom_player.dart',[["import 'package:window_manager/window_manager.dart';","import 'package:window_manager/window_manager.dart';\nimport 'package:spotube/anf_host.dart';"],['if (!kIsDesktop) return;', 'if (AnfHost.embedded || !kIsDesktop) return;']]],
  ['provider/discord_provider.dart',[["import 'dart:async';","import 'dart:async';\nimport 'package:spotube/anf_host.dart';"],['if (!kIsDesktop) return;', 'if (AnfHost.embedded || !kIsDesktop) return;']]],
  ['provider/server/server.dart',[["import 'dart:io';","import 'dart:io';\nimport 'package:spotube/anf_host.dart';"],['enabledRemoteConnect\n          ? InternetAddress.anyIPv4','enabledRemoteConnect && !AnfHost.embedded\n          ? InternetAddress.anyIPv4']]],
  ['services/audio_player/audio_player.dart',[["kIsWindows ? \"localhost\" : InternetAddress.anyIPv4.address","InternetAddress.loopbackIPv4.address"]]],
]){
  const file=path.join(module,'lib',relative);let text=await readFile(file,'utf8');
  for(const [before,after] of changes){if(!text.includes(before))throw Error(`Pinned embedding patch did not match ${relative}`);text=text.replace(before,after);}
  await writeFile(file,text);
}
// Isolate Spotube's database from every existing AnF data store.
const dbFile=path.join(module,'lib/models/database/database.dart');
let database=await readFile(dbFile,'utf8');database=database.replace("File(join(dbFolder.path, 'db.sqlite'))","File(join(dbFolder.path, 'anf-spotube.sqlite'))");await writeFile(dbFile,database);
if(desktop){
  await cp(path.join(source,'windows'),path.join(module,'windows'),{recursive:true});
  await cp(path.join(root,'integrations/spotube/windows_main.cpp'),path.join(module,'windows/runner/main.cpp'));
  const header=path.join(module,'windows/runner/flutter_window.h');
  let text=await readFile(header,'utf8');text=text.replace('  virtual ~FlutterWindow();','  virtual ~FlutterWindow();\n  flutter::FlutterEngine* AnfEngine(){return flutter_controller_->engine();}');await writeFile(header,text);
  const resource=path.join(module,'windows/runner/Runner.rc');
  let metadata=await readFile(resource,'utf8');metadata=metadata.replace('VALUE "CompanyName", "oss.krtirtho"','VALUE "CompanyName", "AnF"').replace('VALUE "ProductName", "spotube"','VALUE "ProductName", "AnFMusic"');await writeFile(resource,metadata);
}
run(flutter,['pub','get','--enforce-lockfile'],module);
run(flutter,['pub','run','build_runner','build','--delete-conflicting-outputs'],module);
console.log(`Prepared embedded Spotube ${pin}. BSD acknowledgement: This product includes software developed by Kingkor Roy Tirtho.`);
