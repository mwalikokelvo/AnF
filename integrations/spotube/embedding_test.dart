import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:spotube/anf_host.dart';
import 'package:spotube/components/titlebar/titlebar_buttons.dart';
import 'package:spotube/collections/intents.dart';
import 'package:spotube/models/metadata/metadata.dart';
import 'package:spotube/provider/discord_provider.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final track=SpotubeTrackObject.fromJson({
    'id':'test','name':'Audio regression','externalUri':'https://example.invalid/track',
    'artists':[{'id':'artist','name':'Test artist','externalUri':'https://example.invalid/artist'}],
    'album':{'id':'album','name':'Test album','albumType':'album','externalUri':'https://example.invalid/album','artists':[],'images':[]},
    'durationMs':5000,'isrc':'TEST','explicit':false,
  }) as SpotubeFullTrackObject;
  test('track JSON is deeply serialized for plugin and media boundaries',(){
    final json=track.toJson();
    expect((json['artists'] as List).single,isA<Map<String,dynamic>>());
    expect(json['album'],isA<Map<String,dynamic>>());
    expect(SpotubeTrackObject.fromJson(json).artists.single.name,'Test artist');
  });
  test('embedded playback does not access uninitialized Discord RPC',()async{
    await DiscordNotifier().updatePresence(track);
  });
  test('close shortcut returns to AnF through its host channel', () async {
    final calls = <String>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(AnfHost.channel, (call) async {
      calls.add(call.method);
      return null;
    });
    expect(AnfHost.embedded, isTrue);
    await CloseAppAction().invoke(CloseAppIntent());
    expect(calls, ['close']);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(AnfHost.channel, null);
  });
  testWidgets('embedded titlebar leaves the host window controls alone', (tester) async {
    await tester.pumpWidget(const ProviderScope(
        child: MaterialApp(home: WindowTitleBarButtons())));
    expect(find.byType(WindowTitleBarButtons), findsOneWidget);
    expect(find.byType(Icon), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
