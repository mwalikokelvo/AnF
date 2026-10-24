import 'dart:async';
import 'package:flutter/services.dart';
import 'package:spotube/services/audio_player/audio_player.dart';
import 'package:spotube/services/logger/logger.dart';
import 'package:spotube/utils/embedding.dart';

const afMusicChannel = MethodChannel('af/music_host');

void registerAFMusicHost() {
  if (!afEmbedded) return;
  afMusicChannel.setMethodCallHandler((call) async {
    if (call.method == 'pause') {
      await audioPlayer.pause().timeout(const Duration(seconds: 3));
      final deadline = DateTime.now().add(const Duration(seconds: 3));
      while (audioPlayer.isPlaying && DateTime.now().isBefore(deadline)) {
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
      if (audioPlayer.isPlaying) {
        throw PlatformException(code: 'pause_failed', message: 'Music did not acknowledge pause.');
      }
      return {'playing': false};
    }
    if (call.method == 'status') return {'playing': audioPlayer.isPlaying};
    throw MissingPluginException('Unsupported A&F music command');
  });
  unawaited(afMusicChannel.invokeMethod<void>('ready').catchError((Object error, StackTrace stack) {
    AppLogger.reportError(error, stack);
  }));
}
