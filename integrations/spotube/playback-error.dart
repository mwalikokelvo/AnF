// AnF-owned, bounded messages: never expose raw provider URLs or device details.
String describePlaybackError(Object? value) {
  final message = value?.toString().toLowerCase() ?? '';
  if (message.contains('could not open/initialize audio device') ||
      message.contains('failed to initialize audio driver')) {
    return 'Audio output is unavailable. Check your sound output device, then retry playback.';
  }
  return 'Audio could not load. Retry playback or open Spotube to check your provider.';
}
