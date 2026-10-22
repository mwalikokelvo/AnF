import 'dart:io';
import 'dart:math';
import 'dart:typed_data';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:media_kit/media_kit.dart';
import 'package:spotube/models/metadata/metadata.dart';
import 'package:spotube/services/audio_player/audio_player.dart';
import 'package:spotube/services/logger/logger.dart';

// Opt-in: exercises the packaged native decoder and production loopback player.
// No provider credentials, network service, or audible output are needed.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final library = Platform.environment['ANF_TEST_LIBMPV'];
  test('native loopback audio decodes, advances, pauses and resumes', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(const MethodChannel('dev.fluttercommunity.plus/package_info'),
            (_) async => {'appName':'AnF test','packageName':'com.anf.test',
              'version':'1','buildNumber':'1','buildSignature':''});
    AppLogger.initialize(false);
    MediaKit.ensureInitialized(libmpv: library);
    const rate = 16000, seconds = 8;
    final wav = ByteData(44 + rate * seconds * 2);
    void label(int offset, String text) {
      for (var i = 0; i < text.length; i++) { wav.setUint8(offset+i, text.codeUnitAt(i)); }
    }
    label(0,'RIFF'); wav.setUint32(4,wav.lengthInBytes-8,Endian.little);
    label(8,'WAVE'); label(12,'fmt '); wav.setUint32(16,16,Endian.little);
    wav.setUint16(20,1,Endian.little); wav.setUint16(22,1,Endian.little);
    wav.setUint32(24,rate,Endian.little); wav.setUint32(28,rate*2,Endian.little);
    wav.setUint16(32,2,Endian.little); wav.setUint16(34,16,Endian.little);
    label(36,'data'); wav.setUint32(40,wav.lengthInBytes-44,Endian.little);
    for (var i=0;i<rate*seconds;i++) {
      wav.setInt16(44+i*2,(sin(i*2*pi*440/rate)*1000).round(),Endian.little);
    }
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4,0);
    var requests = 0;
    var unavailable = false;
    server.listen((request) async {
      expect(request.uri.path,'/stream/native-audio-test'); requests++;
      if(unavailable){request.response.statusCode=503;await request.response.close();return;}
      request.response.headers.contentType = ContentType('audio','wav');
      request.response.contentLength = wav.lengthInBytes;
      request.response.add(wav.buffer.asUint8List());
      await request.response.close();
    });
    SpotubeMedia.serverPort = server.port;
    final player = SpotubeAudioPlayer();
    try {
      final track = SpotubeTrackObject.fromJson({
        'id':'native-audio-test','name':'Decoder test','externalUri':'https://example.invalid',
        'artists':[{'id':'a','name':'Test artist','externalUri':'https://example.invalid'}],
        'album':{'id':'b','name':'Test album','albumType':'album','externalUri':'https://example.invalid','artists':[],'images':[]},
        'durationMs':8000,'isrc':'TEST','explicit':false,
      });
      final media = SpotubeMedia(track);
      expect(SpotubeMedia.media(media).track.artists.single.name,'Test artist');
      await player.setVolume(0);
      final advanced = player.positionStream.firstWhere((p)=>p.inMilliseconds>700);
      await player.openPlaylist([media]);
      await advanced.timeout(const Duration(seconds:20));
      expect(requests,greaterThan(0));
      expect(player.duration.inSeconds,seconds);
      await player.pause();
      await Future<void>.delayed(const Duration(milliseconds:200));
      final paused = player.position;
      await Future<void>.delayed(const Duration(milliseconds:500));
      expect((player.position-paused).inMilliseconds.abs(),lessThan(150));
      expect(player.isPlaying,isFalse);
      final resumed = player.positionStream.firstWhere((p)=>p>paused+const Duration(milliseconds:300));
      await player.resume();
      await resumed.timeout(const Duration(seconds:5));
      unavailable=true;
      await player.openPlaylist([Media(media.uri+'?attempt=failed',extras:media.extras)]);
      for(var i=0;i<100&&player.lastError==null;i++){
        await Future<void>.delayed(const Duration(milliseconds:100));
      }
      expect(player.lastError,isNotNull,reason:'Native decoder failures must reach the host status.');
      unavailable=false;
      final recovered=player.positionStream.firstWhere((p)=>p.inMilliseconds>700);
      await player.openPlaylist([Media(media.uri+'?attempt=recovered',extras:media.extras)]);
      await recovered.timeout(const Duration(seconds:10));
      expect(player.lastError,isNull,reason:'A retry must clear the previous failure.');
    } finally {
      await player.dispose(); await server.close(force:true);
    }
  },skip: library == null ? 'Set ANF_TEST_LIBMPV to the packaged native DLL.' : false);
}
