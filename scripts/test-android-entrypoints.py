import copy
from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

spec = spec_from_file_location('entrypoints', Path(__file__).with_name('check-android-entrypoints.py'))
entrypoints = module_from_spec(spec)
spec.loader.exec_module(entrypoints)
A = entrypoints.A


def fixture(package):
    legacy = package.startswith('com.coucou.')
    name = 'com.coucou.workspace' if legacy else 'com.anf.workspace'
    manifest = ET.fromstring(f'''<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="{package}">
      <application><activity android:name="com.anf.workspace.MainActivity" android:exported="true" />
      <service android:name="{name}.QuickNoteTile" android:exported="true" android:permission="android.permission.BIND_QUICK_SETTINGS_TILE"><intent-filter><action android:name="android.service.quicksettings.action.QS_TILE" /></intent-filter></service>
      <service android:name="{name}.PlaybackService" android:exported="false"><intent-filter><action android:name="androidx.media3.session.MediaSessionService" /></intent-filter></service></application></manifest>''')
    app = manifest.find('application')
    launcher = ET.SubElement(app, 'activity-alias', {A+'name': name+'.MainActivity', A+'targetActivity': 'com.anf.workspace.MainActivity', A+'exported': 'true'}) if legacy else app.find('activity')
    intent = ET.SubElement(launcher, 'intent-filter')
    ET.SubElement(intent, 'action', {A+'name': 'android.intent.action.MAIN'})
    ET.SubElement(intent, 'category', {A+'name': 'android.intent.category.LAUNCHER'})
    ET.SubElement(launcher, 'meta-data', {A+'name': 'android.app.shortcuts', A+'resource': '@xml/shortcuts'})
    shortcuts = ET.fromstring(f'''<shortcuts xmlns:android="http://schemas.android.com/apk/res/android"><shortcut android:shortcutId="quick_note"><intent android:action="com.anf.QUICK_NOTE" android:targetPackage="{package}" android:targetClass="{name}.MainActivity" /></shortcut></shortcuts>''')
    return manifest, shortcuts


class EntryPointTests(unittest.TestCase):
    def test_all_real_and_isolated_review_ids(self):
        for package in entrypoints.IDS:
            with self.subTest(package=package):
                result = entrypoints.validate(*fixture(package), package)
                self.assertFalse(result['installedUpgradeVerified'])

    def test_old_hardcoded_modern_shortcut_is_rejected_for_legacy(self):
        manifest, shortcuts = fixture('com.coucou.workspace')
        shortcuts.find('.//intent').set(A+'targetPackage', 'com.anf.workspace')
        with self.assertRaisesRegex(ValueError, 'another installed package'):
            entrypoints.validate(manifest, shortcuts, 'com.coucou.workspace')

    def test_review_suffix_cannot_target_production_installation(self):
        manifest, shortcuts = fixture('com.anf.workspace.musicdev')
        shortcuts.find('.//intent').set(A+'targetPackage', 'com.anf.workspace')
        with self.assertRaises(ValueError):
            entrypoints.validate(manifest, shortcuts, 'com.anf.workspace.musicdev')

    def test_duplicate_launcher_and_missing_target_are_rejected(self):
        manifest, shortcuts = fixture('com.coucou.workspace')
        app = manifest.find('application')
        app.append(copy.deepcopy(app.find('activity-alias')))
        with self.assertRaisesRegex(ValueError, 'one launcher'):
            entrypoints.validate(manifest, shortcuts, 'com.coucou.workspace')
        app.remove(app[-1]); app.remove(app.find('activity'))
        with self.assertRaisesRegex(ValueError, 'target activity missing'):
            entrypoints.validate(manifest, shortcuts, 'com.coucou.workspace')

    def test_unprotected_tile_and_missing_shortcut_metadata_are_rejected(self):
        for mutate in [lambda app: app.find('service').set(A+'permission', ''),
                       lambda app: app.find('activity').remove(app.find('activity/meta-data'))]:
            manifest, shortcuts = fixture('com.anf.workspace')
            mutate(manifest.find('application'))
            with self.assertRaises(ValueError):
                entrypoints.validate(manifest, shortcuts, 'com.anf.workspace')

    def test_media_component_and_private_boundary_cannot_change(self):
        for field, value in [(A+'name', 'com.anf.workspace.PlaybackService'), (A+'exported', 'true')]:
            manifest, shortcuts = fixture('com.coucou.workspace')
            service = manifest.findall('application/service')[1]
            service.set(field, value)
            with self.assertRaisesRegex(ValueError, 'media-service'):
                entrypoints.validate(manifest, shortcuts, 'com.coucou.workspace')


if __name__ == '__main__':
    unittest.main()
