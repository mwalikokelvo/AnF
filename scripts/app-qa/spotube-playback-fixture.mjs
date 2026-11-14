// QA-only source injection and generated media. Never imported by production.
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function withPausedFixture(source){
 source=source.replaceAll('\r\n','\n');
 const marker="    channel.invokeMethod<void>('ready');";
 if(source.includes('ANF_SPOTUBE_QA_FIXTURE')||source.split(marker).length!==2)throw Error('Unexpected fixture injection source.');
 const imports="import 'dart:convert';";
 if(source.split(imports).length!==2)throw Error('Unexpected fixture injection imports.');
 source=source.replace(imports,imports+"\nimport 'package:crypto/crypto.dart' as qa_crypto;\nimport 'package:spotube/models/metadata/metadata.dart';");
 return source.replace(marker,String.raw`    () async {
      try {
        if (!Platform.isWindows || Platform.environment['GITHUB_ACTIONS'] != 'true' ||
            Platform.environment['RUNNER_ENVIRONMENT'] != 'github-hosted') {
          throw StateError('Disposable Windows QA required');
        }
        final root = Directory(Platform.environment['RUNNER_TEMP']!).resolveSymbolicLinksSync();
        final file = File(Platform.environment['ANF_SPOTUBE_QA_FIXTURE']!);
        final resolved = file.resolveSymbolicLinksSync();
        if (!resolved.toLowerCase().startsWith((root + Platform.pathSeparator).toLowerCase()) ||
            file.uri.pathSegments.last != 'fixture.wav') throw StateError('Fixture path refused');
        final bytes = await file.readAsBytes();
        if (bytes.length != 960044 || qa_crypto.sha256.convert(bytes).toString() !=
            Platform.environment['ANF_SPOTUBE_QA_SHA256']) throw StateError('Fixture content refused');
        // Real upstream decoder/player; mute only, no replacement/null sink.
        await audioPlayer.setVolume(0);
        final track = SpotubeTrackObject.localTrackFromFile(File(resolved));
        await audioPlayer.openPlaylist([SpotubeMedia(track)], autoPlay: false);
      } catch (_) {
        print('ANF_QA_FIXTURE_LOAD_FAILED');
      }
      await channel.invokeMethod<void>('ready');
    }();`);
}

export function generatedWave(){
 const samples=30*16000,data=Buffer.alloc(44+samples*2);
 data.write('RIFF',0);data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);
 data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);
 data.writeUInt32LE(16000,24);data.writeUInt32LE(32000,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);
 data.write('data',36);data.writeUInt32LE(samples*2,40);
 for(let i=0;i<samples;i++)data.writeInt16LE(Math.round(1024*Math.sin(2*Math.PI*440*i/16000)),44+i*2);
 return data;
}

export function withDecoderDiagnostics(source){
 source=source.replaceAll('\r\n','\n');
 const marker='      stream.error.listen((event) {';
 if(source.includes('decoder-errors.txt')||source.split(marker).length!==2)throw Error('Unexpected decoder diagnostic source.');
 return "import 'dart:io';\n"+source.replace(marker,marker+String.raw`
        if (Platform.environment['GITHUB_ACTIONS'] == 'true' &&
            Platform.environment['RUNNER_ENVIRONMENT'] == 'github-hosted' &&
            Platform.environment['ANF_SPOTUBE_QA_FIXTURE'] != null) {
          final safe = event.toString()
            .replaceAll(RegExp(r'https?://\S+'), '[url]')
            .replaceAll(RegExp(r'[A-Za-z]:[\\/]\S+'), '[path]')
            .replaceAll(RegExp(r'\b[a-fA-F0-9]{32,}\b'), '[identifier]');
          final dir = File(Platform.environment['ANF_SPOTUBE_QA_FIXTURE']!).parent.path;
          File(dir + Platform.pathSeparator + 'decoder-errors.txt').writeAsStringSync(safe + '\n', mode: FileMode.append);
        }`);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('Disposable hosted Windows only.');
 const root=fileURLToPath(new URL('../../',import.meta.url));
 const module=path.join(root,'windows/spotube-native/lib/anf_host.dart');
 const original=readFileSync(path.join(root,'integrations/spotube/anf_host.dart'),'utf8');
 if(readFileSync(module,'utf8').replaceAll('\r\n','\n')!==original.replaceAll('\r\n','\n'))throw Error('Generated host differs before QA injection.');
 const dir=mkdtempSync(path.join(process.env.RUNNER_TEMP,'anf-spotube-playback-'));
 const fixture=path.join(dir,'fixture.wav'),bytes=generatedWave(),sha=createHash('sha256').update(bytes).digest('hex');
 writeFileSync(fixture,bytes,{flag:'wx'});
 writeFileSync(module,withPausedFixture(original));
 const player=path.join(root,'windows/spotube-native/lib/services/audio_player/custom_player.dart');
 writeFileSync(player,withDecoderDiagnostics(readFileSync(player,'utf8')));
 writeFileSync(process.env.GITHUB_ENV,`ANF_SPOTUBE_QA_FIXTURE=${fixture}\nANF_SPOTUBE_QA_SHA256=${sha}\n`,{flag:'a'});
 console.log('Prepared generated 30-second muted-player fixture; SHA256='+sha+'. Only disposable module changed.');
}
