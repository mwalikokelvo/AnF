import 'dart:io';

const musicExtensions = {
  '.mp3',
  '.mp4',
  '.m4a',
  '.aac',
  '.flac',
  '.wav',
  '.ogg',
  '.opus',
  '.webm',
  '.aiff',
  '.aif',
};

class LocalMusicScan {
  final Map<String, List<File>> files;
  final int entries;
  final int skippedDirectories;
  final bool truncated;
  final bool cancelled;
  const LocalMusicScan(
    this.files,
    this.entries,
    this.skippedDirectories,
    this.truncated,
    this.cancelled,
  );
}

/// Read-only discovery with bounded traversal and no symlink following.
Future<LocalMusicScan> scanLocalMusic(
  Iterable<String> roots, {
  bool Function()? cancelled,
  void Function(int entries, int tracks)? progress,
  int maxTracks = 10000,
  int maxEntries = 100000,
}) async {
  if (maxTracks < 1 || maxEntries < 1)
    throw ArgumentError('Scan bounds must be positive');
  bool stopped() => cancelled?.call() ?? false;
  String key(String path) => Platform.isWindows ? path.toLowerCase() : path;
  final canonical = <String>[];
  int skipped = 0, entries = 0, tracks = 0;
  for (final root in roots) {
    if (stopped()) return LocalMusicScan({}, entries, skipped, false, true);
    if (root.isEmpty) continue;
    try {
      if (await FileSystemEntity.type(root, followLinks: false) !=
          FileSystemEntityType.directory)
        continue;
      final path = await Directory(root).resolveSymbolicLinks();
      if (!canonical.any((p) => key(p) == key(path))) canonical.add(path);
    } on FileSystemException {
      skipped++;
    }
  }
  canonical.sort((a, b) => a.length.compareTo(b.length));
  final uniqueRoots = <String>[];
  for (final root in canonical) {
    if (!uniqueRoots.any(
      (p) => key(root).startsWith(
        key(
          p.endsWith(Platform.pathSeparator)
              ? p
              : '$p${Platform.pathSeparator}',
        ),
      ),
    ))
      uniqueRoots.add(root);
  }
  final result = <String, List<File>>{}, seen = <String>{};
  for (final root in uniqueRoots) {
    final files = result[root] = <File>[];
    final pending = <Directory>[Directory(root)];
    while (pending.isNotEmpty && !stopped()) {
      final dir = pending.removeLast();
      try {
        await for (final entity in dir.list(followLinks: false)) {
          if (stopped()) break;
          if (++entries > maxEntries)
            return LocalMusicScan(result, entries - 1, skipped, true, false);
          if (entity is Directory) pending.add(entity);
          if (entity is File) {
            final name = entity.path.toLowerCase();
            final dot = name.lastIndexOf('.');
            if (dot >= 0 &&
                musicExtensions.contains(name.substring(dot)) &&
                seen.add(key(entity.absolute.path))) {
              files.add(entity);
              tracks++;
              if (tracks >= maxTracks)
                return LocalMusicScan(result, entries, skipped, true, false);
            }
          }
          if (entries % 128 == 0) progress?.call(entries, tracks);
        }
      } on FileSystemException {
        skipped++;
      }
    }
    if (stopped()) break;
  }
  progress?.call(entries, tracks);
  return LocalMusicScan(result, entries, skipped, false, stopped());
}

/// Batches metadata work so large libraries cannot create unbounded native jobs.
Future<List<T>> mapMusicFiles<T>(
  List<File> files,
  Future<T> Function(File) read, {
  int concurrency = 4,
  bool Function()? cancelled,
}) async {
  if (concurrency < 1 || concurrency > 16)
    throw ArgumentError('Invalid concurrency');
  final result = <T>[];
  for (int start = 0; start < files.length; start += concurrency) {
    if (cancelled?.call() ?? false) break;
    final end = (start + concurrency).clamp(0, files.length);
    result.addAll(await Future.wait(files.sublist(start, end).map(read)));
  }
  return result;
}
