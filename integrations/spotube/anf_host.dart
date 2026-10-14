import 'package:flutter/services.dart';
import 'package:flutter/material.dart' as material;
import 'package:spotube/services/audio_player/audio_player.dart';

/// The native AnF host owns screen navigation and the application lifetime.
/// Flutter's cached engine remains alive when the music Activity closes.
class AnfHost {
  static const embedded = bool.fromEnvironment('ANF_EMBEDDED', defaultValue: true);
  static const channel = MethodChannel('anf/spotube');

  static void install() {
    if (!embedded) return;
    channel.setMethodCallHandler((call) async {
      switch (call.method) {
        case 'pause':
          await audioPlayer.pause();
          return null;
        case 'status':
          return {'playing': audioPlayer.isPlaying};
        default:
          throw MissingPluginException('Unknown AnF music operation');
      }
    });
    channel.invokeMethod<void>('ready');
  }

  static material.Widget frame(material.Widget child) {
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
