import 'dart:io';
import '../lib/services/local_music_scan.dart';

void check(bool value, String message) {
  if (!value) throw StateError(message);
}

Future<void> main() async {
  final root = await Directory.systemTemp.createTemp('af-scan-test-');
  try {
    final child = await Directory('${root.path}/nested').create();
    for (final name in ['one.MP3', 'two.flac', 'ignore.txt'])
      await File('${child.path}/$name').writeAsString('fixture');
    await File('${root.path}/three.opus').writeAsString('fixture');
    final scan = await scanLocalMusic([child.path, root.path, root.path]);
    check(
      scan.files.length == 1,
      'Nested/duplicate roots must be deduplicated',
    );
    final files = scan.files.values.expand((v) => v).toList();
    check(files.length == 3, 'Supported formats only');
    check(
      (await scanLocalMusic([root.path], maxTracks: 2)).truncated,
      'Track bound',
    );
    check(
      (await scanLocalMusic([root.path], cancelled: () => true)).cancelled,
      'Pre-cancellation',
    );
    int active = 0, peak = 0, started = 0;
    bool cancel = false;
    await mapMusicFiles(List.generate(20, (_) => files.first), (file) async {
      active++;
      started++;
      if (active > peak) peak = active;
      await Future<void>.delayed(const Duration(milliseconds: 3));
      active--;
      cancel = true;
      return file;
    }, cancelled: () => cancel);
    check(
      peak <= 4 && started == 4,
      'Metadata concurrency and mid-batch cancellation',
    );
    print(
      'PASS: format filtering, duplicate/nested roots, bounds, cancellation, and bounded metadata concurrency',
    );
  } finally {
    await root.delete(recursive: true);
  }
}
