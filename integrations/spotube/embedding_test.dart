import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:spotube/anf_host.dart';
import 'package:spotube/components/titlebar/titlebar_buttons.dart';
import 'package:spotube/collections/intents.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
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
