import '../lib/services/music_sleep_timer.dart';

void check(bool value) {
  if (!value) throw StateError('Timer regression');
}

Future<void> main() async {
  final timer = MusicSleepTimer();
  int expired = 0;
  timer.schedule(const Duration(milliseconds: 5), () => expired += 100);
  timer.schedule(const Duration(milliseconds: 10), () => expired++);
  await Future<void>.delayed(const Duration(milliseconds: 40));
  check(expired == 1);
  timer.schedule(const Duration(milliseconds: 5), () => expired++);
  timer.cancel();
  await Future<void>.delayed(const Duration(milliseconds: 20));
  check(expired == 1);
  timer.schedule(const Duration(milliseconds: 5), () => expired++);
  timer.dispose();
  await Future<void>.delayed(const Duration(milliseconds: 20));
  check(expired == 1);
  bool rejected = false;
  try {
    timer.schedule(Duration.zero, () => expired++);
  } on StateError {
    rejected = true;
  }
  check(rejected);
  print(
    'PASS: timer replacement, cancellation, disposal and no host process exit',
  );
}
