import 'package:flutter_test/flutter_test.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' show ThemeMode;
import 'package:spotube/anf_host.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('host appearance updates the actual notifier without audio or preferences', () {
    final changes = <ThemeMode>[];
    void changed() => changes.add(AnfHost.theme.value);
    AnfHost.theme.addListener(changed);
    try {
      expect(AnfHost.applyTheme('light'), isTrue);
      expect(AnfHost.theme.value, ThemeMode.light);
      expect(AnfHost.applyTheme('dark'), isTrue);
      expect(AnfHost.theme.value, ThemeMode.dark);
      expect(changes, [ThemeMode.light, ThemeMode.dark]);
      for (final unknown in [null, 'status', 'arbitrary-command']) {
        expect(AnfHost.applyTheme(unknown), isFalse);
        expect(AnfHost.theme.value, ThemeMode.dark);
      }
    } finally {
      AnfHost.theme.removeListener(changed);
    }
  });
}
