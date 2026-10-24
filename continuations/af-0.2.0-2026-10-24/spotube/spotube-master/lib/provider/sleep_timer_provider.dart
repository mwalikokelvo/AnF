import 'dart:async';
import 'package:spotube/services/music_sleep_timer.dart';
import 'package:spotube/services/audio_player/audio_player.dart';
import 'package:spotube/services/logger/logger.dart';

import 'package:hooks_riverpod/hooks_riverpod.dart';

class SleepTimerNotifier extends StateNotifier<Duration?> {
  SleepTimerNotifier() : super(null);

  final _timer = MusicSleepTimer();

  void setSleepTimer(Duration duration) {
    _timer.schedule(duration, () {
      if (!mounted) return;
      state = null;
      unawaited(
        audioPlayer.pause().catchError((Object error, StackTrace stack) {
          AppLogger.reportError(error, stack);
        }),
      );
    });
    state = duration;
  }

  void cancelSleepTimer() {
    state = null;
    _timer.cancel();
  }

  @override
  void dispose() {
    _timer.dispose();
    super.dispose();
  }
}

final sleepTimerProvider = StateNotifierProvider<SleepTimerNotifier, Duration?>(
  (ref) => SleepTimerNotifier(),
);
