import 'package:flutter_test/flutter_test.dart';
import 'package:spotube/anf_playback_error.dart';
import 'package:spotube/services/audio_player/custom_player.dart';

void main() {
  test('actual patched CustomPlayer and helper compile together', () {
    expect(CustomPlayer, isNotNull); // Do not instantiate an audio device.
  });
  test('known native output failures offer device recovery', () {
    for (final value in [
      'Could not open/initialize audio device -> no sound.',
      '[audio] FAILED TO INITIALIZE AUDIO DRIVER',
    ]) {
      expect(describePlaybackError(value),
          'Audio output is unavailable. Check your sound output device, then retry playback.');
    }
  });
  test('unknown media errors stay bounded and do not expose credentials', () {
    const fallback = 'Audio could not load. Retry playback or open Spotube to check your provider.';
    for (final value in [null, '', 'failed opening https://example.invalid/private?key=synthetic',
      r'Unable to open C:\private\fixture.wav', 'audio metadata invalid']) {
      expect(describePlaybackError(value), fallback);
    }
  });
}
