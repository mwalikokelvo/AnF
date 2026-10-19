// Reconstruct a pinned, patched Flutter module. No signing/service secrets.
import {spawnSync} from 'node:child_process';
import {cp,mkdir,readFile as readRawFile,writeFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawnTool} from './tool-process.mjs';
import {configureAndroidModule} from './module-identity.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const pin='69a310c78f5ceaf4eab7dfee98f187d38211c9ba';
const source=process.env.SPOTUBE_SOURCE||path.join(root,'../.cache/anf-spotube-source');
const desktop=process.argv.includes('--windows');
const module=path.join(root,desktop?'windows/spotube-native':'android/spotube-module');
const flutter=process.env.FLUTTER_BIN||(process.platform==='win32'?'flutter.bat':'flutter');
// A clean Git checkout on Windows may use CRLF; pinned patches use LF.
async function readFile(file,encoding){return (await readRawFile(file,encoding)).replace(/\r\n/g,'\n');}
function run(bin,args,cwd=root){
  const result=spawnTool(bin,args,{cwd,stdio:'inherit',env:process.env});if(result.error)throw result.error;if(result.status)throw Error(`${bin} failed (${result.status})`);
}
try{await access(path.join(source,'.git'));}catch{await mkdir(path.dirname(source),{recursive:true});run('git',['clone','https://github.com/KRTirtho/spotube.git',source]);}
const sha=spawnSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).stdout.trim();
const dirty=spawnSync('git',['status','--porcelain'],{cwd:source,encoding:'utf8'});
if(dirty.status||dirty.stdout.trim())throw Error('Preserve the changed Spotube checkout and use a clean SPOTUBE_SOURCE directory.');
if(sha!==pin){run('git',['fetch','origin',pin],source);run('git',['checkout','--detach',pin],source);}
run('git',['diff','--exit-code',pin,'--','lib','assets','pubspec.yaml','l10n.yaml','LICENSE'],source);
try{await access(path.join(module,'.metadata'));}catch{run(flutter,desktop?['create','--no-pub','--template=app','--platforms=windows','--org=com.anf','--project-name=spotube',module]:['create','--no-pub','--template=module','--org=com.anf','--project-name=spotube',module]);}
for(const name of ['lib','assets','LICENSE','l10n.yaml'])await cp(path.join(source,name),path.join(module,name),{recursive:true});
let spec=await readFile(path.join(source,'pubspec.yaml'),'utf8');
// Standalone upstream SDK test plugins must not register in a release runtime AAR.
spec=spec.replace('  integration_test:\n    sdk: flutter\n','');
if(!desktop)spec=configureAndroidModule(spec);
await writeFile(path.join(module,'pubspec.yaml'),spec);
// Plugin scripts and media extras consume maps immediately, without a later
// jsonEncode pass. Nested artists/albums must already be plain JSON values.
await cp(path.join(root,'integrations/spotube/build.yaml'),path.join(module,'build.yaml'));
await cp(path.join(root,'integrations/spotube/pubspec.lock'),path.join(module,'pubspec.lock'));
try{await access(path.join(module,'.env'));}catch{await writeFile(path.join(module,'.env'),'LASTFM_API_KEY=\nLASTFM_API_SECRET=\nENABLE_UPDATE_CHECK=0\nRELEASE_CHANNEL=stable\nHIDE_DONATIONS=1\n');}
let main=await readFile(path.join(module,'lib/main.dart'),'utf8');
main=main.replace("import 'dart:io';\n",'').replace("import 'package:spotube/collections/http-override.dart';\n",'');
main=main.replace("import 'dart:async';","import 'dart:async';\nimport 'anf_host.dart';");
main=main.replace('    );\n  });\n}', '    );\n    AnfHost.install();\n  });\n}');
main=main.replace('HttpOverrides.global = BadCertificateAllowlistOverrides();','// Use normal TLS verification inside AnF.');
// Both desktop startup blocks must be excluded: WindowManagerTools resolves
// GA_ROOT after SetParent, so initializing it would control AnF's outer window.
main=main.replaceAll('if (kIsDesktop) {','if (kIsDesktop && !AnfHost.embedded) {');
main=main.replace('ref.listen(trayManagerProvider, (_, __) {});','if (!AnfHost.embedded) ref.listen(trayManagerProvider, (_, __) {});');
for(const provider of ['bonsoirProvider','connectClientsProvider'])main=main.replace(`ref.listen(${provider}, (_, __) {});`,`if (!AnfHost.embedded) ref.listen(${provider}, (_, __) {});`);
for(const hook of ['useFixWindowStretching();','useCloseBehavior(ref);','useDeepLinking(ref, router);','useDisableBatteryOptimizations();'])main=main.replace(hook,`if (!AnfHost.embedded) ${hook}`);
main=main.replace('if (kIsMobile) {','if (kIsMobile && !AnfHost.embedded) {');
main=main.replace("title: 'Spotube',","title: 'AnF · Music Hub',");
main=main.replace('final themeMode =\n        ref.watch(userPreferencesProvider.select((s) => s.themeMode));','final hostTheme = useValueListenable(AnfHost.theme);\n    final themeMode = AnfHost.embedded && kIsDesktop ? hostTheme :\n        ref.watch(userPreferencesProvider.select((s) => s.themeMode));');
main=main.replace('        return child;','        return AnfHost.embedded ? AnfHost.frame(child) : child;');
await writeFile(path.join(module,'lib/main.dart'),main);
await cp(path.join(root,'integrations/spotube/anf_host.dart'),path.join(module,'lib/anf_host.dart'));
await mkdir(path.join(module,'test'),{recursive:true});
await cp(path.join(root,'integrations/spotube/embedding_test.dart'),path.join(module,'test/embedding_test.dart'));
await cp(path.join(root,'integrations/spotube/playback_test.dart'),path.join(module,'test/playback_test.dart'));
// Embedded music does not own AnF's outer window or floating mini-player.
for(const [relative,changes] of [
  ['provider/user_preferences/user_preferences_provider.dart',[["import 'package:window_manager/window_manager.dart';","import 'package:window_manager/window_manager.dart';\nimport 'package:spotube/anf_host.dart';"],['if (kIsDesktop) {','if (kIsDesktop && !AnfHost.embedded) {']]],
  ['components/titlebar/titlebar.dart',[["import 'package:window_manager/window_manager.dart';","import 'package:window_manager/window_manager.dart';\nimport 'package:spotube/anf_host.dart';"],['if (kIsDesktop && !systemTitleBar)', 'if (!AnfHost.embedded && kIsDesktop && !systemTitleBar)'],['if (!kIsDesktop || systemTitlebar) return;', 'if (AnfHost.embedded || !kIsDesktop || systemTitlebar) return;']]],
  ['components/titlebar/titlebar_buttons.dart',[["import 'package:window_manager/window_manager.dart';","import 'package:window_manager/window_manager.dart';\nimport 'package:spotube/anf_host.dart';"],['if (!kTitlebarVisible || preferences.systemTitleBar)', 'if (AnfHost.embedded || !kTitlebarVisible || preferences.systemTitleBar)']]],
  ['modules/root/bottom_player.dart',[["import 'package:window_manager/window_manager.dart';","import 'package:window_manager/window_manager.dart';\nimport 'package:spotube/anf_host.dart';"],['if (!kIsDesktop) return;', 'if (AnfHost.embedded || !kIsDesktop) return;']]],
  ['provider/discord_provider.dart',[["import 'dart:async';","import 'dart:async';\nimport 'package:spotube/anf_host.dart';"],['if (!kIsDesktop) return;', 'if (AnfHost.embedded || !kIsDesktop) return;'],['Future<void> updatePresence(SpotubeTrackObject track) async {','Future<void> updatePresence(SpotubeTrackObject track) async {\n    if (AnfHost.embedded) return;']]],
  ['provider/server/server.dart',[["import 'dart:io';","import 'dart:io';\nimport 'package:spotube/anf_host.dart';"],['enabledRemoteConnect\n          ? InternetAddress.anyIPv4','enabledRemoteConnect && !AnfHost.embedded\n          ? InternetAddress.anyIPv4']]],
  ['services/audio_player/audio_player.dart',[["kIsWindows ? \"localhost\" : InternetAddress.anyIPv4.address","InternetAddress.loopbackIPv4.address"]]],
  ['services/audio_player/audio_players_streams_mixin.dart', [['return Stream.value(false);', 'return _mkPlayer.stream.buffering;']]],
  ['services/audio_player/custom_player.dart', [['  int _androidAudioSessionId = 0;', '  String? lastError;\n  int _androidAudioSessionId = 0;'], ['      stream.error.listen((event) {', "      stream.error.listen((event) {\n        lastError = 'Audio could not load. Retry playback or open Spotube to check your provider.';"], ['        _playerStateStream.add(AudioPlaybackState.buffering);', '        _playerStateStream.add(event ? AudioPlaybackState.buffering\n            : state.playing ? AudioPlaybackState.playing : AudioPlaybackState.paused);']]],
  ['services/audio_player/audio_player.dart', [['  bool get isBuffering {','  String? get lastError => _mkPlayer.lastError;\n\n  bool get isBuffering {']]],
  ['services/audio_player/audio_player_impl.dart', [['    await _mkPlayer.open(', '    _mkPlayer.lastError = null;\n    await _mkPlayer.open(']]],
  ['components/fallbacks/error_box.dart', [["import 'package:auto_route/auto_route.dart';", "import 'package:auto_route/auto_route.dart';\nimport 'package:spotube/collections/routes.gr.dart';"], ['    // Make a monospace error log view. Make sure it\'s only 4 lines', "    final sessionRejected = RegExp(r'\\b401\\b').hasMatch(error.toString());"], ['                  error.toString(),', "                  sessionRejected\n                      ? 'Your music provider rejected this session (401). Open provider settings to reconnect your account, then retry.'\n                      : error.toString(),"], ['              // Show a dialog with full log and a retry button as well', "              if (sessionRejected)\n                Button.primary(\n                  onPressed: () => context.pushRoute(const SettingsMetadataProviderRoute()),\n                  child: const Text('Open provider settings'),\n                ),\n              // Show a dialog with full log and a retry button as well"]]],
  ['collections/intents.dart',[["import 'dart:io';","import 'dart:io';\nimport 'package:spotube/anf_host.dart';"],['    if (kIsDesktop) {\n      exit(0);', "    if (AnfHost.embedded) return AnfHost.channel.invokeMethod<void>('close');\n    if (kIsDesktop) {\n      exit(0);"]]],
  ['services/audio_services/mobile_audio_service.dart',[["import 'dart:io';","import 'dart:io';\nimport 'package:spotube/anf_host.dart';"],['    if (kIsAndroid) exit(0);', '    if (kIsAndroid && !AnfHost.embedded) exit(0);']]],
  ['provider/sleep_timer_provider.dart',[["import 'dart:io';","import 'dart:io';\nimport 'package:spotube/anf_host.dart';\nimport 'package:spotube/services/audio_player/audio_player.dart';"],['    state = duration;', '    _timer?.cancel();\n    state = duration;'],['    _timer = Timer(duration, () {','    _timer = Timer(duration, () async {'],['      exit(0);', '      state = null;\n      if (AnfHost.embedded) {\n        await audioPlayer.pause();\n      } else {\n        exit(0);\n      }'],['  void cancelSleepTimer() {', '  @override\n  void dispose() {\n    _timer?.cancel();\n    super.dispose();\n  }\n\n  void cancelSleepTimer() {']]],
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
run(flutter,['pub','get','--enforce-lockfile',...(process.argv.includes('--offline')?['--offline']:[])],module);
if(!desktop){
  // The pinned Android plugin declares desktop assets absent from its Git tree.
  // Vendor its verified revision rather than modifying the shared Pub cache.
  const config=JSON.parse(await readFile(path.join(module,'.dart_tool/package_config.json'),'utf8'));
  const plugin=config.packages.find(p=>p.name==='flutter_new_pipe_extractor');
  const origin=fileURLToPath(new URL(plugin.rootUri,new URL('file://'+path.join(module,'.dart_tool/package_config.json'))));
  const revision='41cbd821ce49b9343136f67d83d3117e582dad75';
  const actual=spawnSync('git',['rev-parse','HEAD'],{cwd:origin,encoding:'utf8'});
  if(actual.status||actual.stdout.trim()!==revision)throw Error('NewPipe plugin does not match the pinned revision.');
  const vendor=path.join(module,'vendor/flutter_new_pipe_extractor');
  await mkdir(vendor,{recursive:true});
  const archive=spawnSync('git',['archive',revision],{cwd:origin,maxBuffer:20*1024*1024});
  if(archive.status)throw Error('Pinned NewPipe source archive failed.');
  const extract=spawnSync('tar',['-x','-C',vendor],{input:archive.stdout});
  if(extract.status)throw Error('Pinned NewPipe source extraction failed.');
  const manifest=path.join(vendor,'pubspec.yaml');
  const original=await readFile(manifest,'utf8');
  if(!original.includes('  assets:\n    - assets/\n'))throw Error('Pinned NewPipe asset declaration changed.');
  await writeFile(manifest,original.replace('  assets:\n    - assets/\n',''));
  spec=await readFile(path.join(module,'pubspec.yaml'),'utf8');
  spec=spec.replace('  flutter_new_pipe_extractor:\n    git:\n      url: https://github.com/KRTirtho/flutter_new_pipe_extractor', '  flutter_new_pipe_extractor:\n    path: vendor/flutter_new_pipe_extractor');
  await writeFile(path.join(module,'pubspec.yaml'),spec);
  // Preserve every other locked package while changing this one to local source.
  run(flutter,['pub','get','--offline'],module);
}
run(flutter,['pub','run','build_runner','build','--delete-conflicting-outputs'],module);
// build_runner can remove generated localization sources during a clean build.
run(flutter,['gen-l10n'],module);
console.log(`Prepared embedded Spotube ${pin}. BSD acknowledgement: This product includes software developed by Kingkor Roy Tirtho.`);
