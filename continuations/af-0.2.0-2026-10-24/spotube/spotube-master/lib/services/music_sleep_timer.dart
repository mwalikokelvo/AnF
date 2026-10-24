import 'dart:async';

class MusicSleepTimer {
  Timer? _timer;
  bool _disposed = false;

  void schedule(Duration duration, void Function() onExpire) {
    if (_disposed) throw StateError('Timer is disposed');
    if (duration.isNegative) throw ArgumentError.value(duration, 'duration');
    cancel();
    _timer = Timer(duration, () {
      _timer = null;
      if (!_disposed) onExpire();
    });
  }

  void cancel() {
    _timer?.cancel();
    _timer = null;
  }

  void dispose() {
    cancel();
    _disposed = true;
  }
}
