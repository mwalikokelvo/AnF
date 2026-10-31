import 'dart:convert';
import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter/material.dart' as material;
import 'package:shadcn_flutter/shadcn_flutter.dart' show ThemeMode;
import 'package:spotube/services/audio_player/audio_player.dart';

/// The native AnF host owns screen navigation and the application lifetime.
/// Flutter's cached engine remains alive when the music Activity closes.
class AnfHost {
  static const embedded = bool.fromEnvironment('ANF_EMBEDDED', defaultValue: true);
  static const channel = MethodChannel('anf/spotube');
  static final theme = material.ValueNotifier<ThemeMode>(ThemeMode.system);

  static void install() {
    if (!embedded) return;
    channel.setMethodCallHandler((call) async {
      switch (call.method) {
        case 'pause':
          await audioPlayer.pause();
          return null;
        case 'status':
          return _status();
        case 'control':
          switch (call.arguments) {
            case 'status':
              break;
            case 'light':
              theme.value = ThemeMode.light;
              break;
            case 'dark':
              theme.value = ThemeMode.dark;
              break;
            case 'system':
              theme.value = ThemeMode.system;
              break;
            case 'retry':
              final playlist = audioPlayer.playlist;
              if (playlist.medias.isEmpty) throw StateError('Choose music in Spotube first.');
              await audioPlayer.openPlaylist(playlist.medias, initialIndex: playlist.index.clamp(0, playlist.medias.length - 1));
              break;
            case 'pause':
              await audioPlayer.pause();
              break;
            case 'play':
              if (!audioPlayer.hasSource) throw StateError('Choose music in Spotube first.');
              await audioPlayer.resume();
              break;
            case 'previous':
              await audioPlayer.skipToPrevious();
              break;
            case 'next':
              await audioPlayer.skipToNext();
              break;
            default:
              throw MissingPluginException('Unknown AnF music operation');
          }
          return _status();
        default:
          throw MissingPluginException('Unknown AnF music operation');
      }
    });
    channel.invokeMethod<void>('ready');
  }

  static String _status() {
    final playlist = audioPlayer.playlist;
    final index = playlist.index;
    final media = index >= 0 && index < playlist.medias.length
        ? playlist.medias[index] : null;
    final extras = media?.extras;
    final artists = extras?['artists'];
    String bounded(String value) => value.length > 200 ? value.substring(0, 200) : value;
    return jsonEncode({
      'hasTrack': media != null,
      'playing': audioPlayer.isPlaying,
      'buffering': audioPlayer.isBuffering,
      'error': audioPlayer.lastError,
      'title': bounded(extras?['name']?.toString() ?? 'Spotube music'),
      'artist': bounded(artists is List
          ? artists.whereType<Map>().map((artist) => artist['name']?.toString() ?? '').where((name) => name.isNotEmpty).join(', ')
          : ''),
      'position': audioPlayer.position.inMilliseconds,
      'duration': audioPlayer.duration.inMilliseconds,
    });
  }

  static material.Widget frame(material.Widget child) {
    if (Platform.isWindows) return child;
    return material.Column(children: [
      material.SafeArea(bottom: false, child: material.Material(
        color: const material.Color(0xff15191a),
        child: material.Padding(padding: const material.EdgeInsets.symmetric(horizontal: 12, vertical: 6), child: material.Row(children: [
          material.IconButton(tooltip: 'Return to AnF', onPressed: () => channel.invokeMethod<void>('close'), icon: const material.Icon(material.Icons.arrow_back, color: material.Color(0xff79e4b4))),
          const material.Expanded(child: material.Column(crossAxisAlignment: material.CrossAxisAlignment.start, children: [
            material.Text('Music Hub', style: material.TextStyle(color: material.Colors.white, fontSize: 20, fontWeight: material.FontWeight.w600)),
            material.Tooltip(message: 'This product includes software developed by Kingkor Roy Tirtho.', child: material.Text('Powered by Spotube', style: material.TextStyle(color: material.Color(0xffa6afb5), fontSize: 12))),
          ])),
        ])),
      )),
      material.Expanded(child: child),
    ]);
  }
}
