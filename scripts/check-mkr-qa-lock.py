"""Offline guards: QA snapshot renaming must preserve Cargo's locked graph."""
import importlib.util
from pathlib import Path
import tomllib
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('mkr_qa', ROOT/'scripts/app-qa/prepare-mkr-native-qa.py')
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)


class EngineeringLockTests(unittest.TestCase):
    def workspace(self, version):
        return '[workspace.package]\nversion = "' + version + '"\n'

    def lock(self, version):
        return ('version = 4\n\n[[package]]\nname = "anf"\nversion = "' + version
                + '"\ndependencies = ["dep"]\n\n[[package]]\nname = "dep"\n'
                'version = "1.2.3"\nsource = "registry+https://example.invalid"\n'
                'checksum = "' + 'a'*64 + '"\n')

    def test_versions_and_line_endings_preserve_every_other_byte(self):
        for version in ('0.1.42', '0.1.48', '1.0.0-preview.2'):
            for newline in ('\n', '\r\n'):
                with self.subTest(version=version, newline=newline):
                    original = self.lock(version).replace('\n', newline)
                    result = qa.rename_qa_lock(self.workspace(version), original)
                    self.assertEqual(result.replace('name = "anf-mkr-qa"', 'name = "anf"'), original)
                    self.assertEqual(tomllib.loads(result)['package'][1], tomllib.loads(original)['package'][1])

    def test_current_repository_lock_preserves_graph(self):
        workspace = (ROOT/'windows/Cargo.toml').read_text(encoding='utf-8')
        original = (ROOT/'windows/Cargo.lock').read_text(encoding='utf-8')
        result = qa.rename_qa_lock(workspace, original)
        self.assertEqual(result.replace('name = "anf-mkr-qa"', 'name = "anf"'), original)

    def test_mismatched_version_refused(self):
        with self.assertRaises(ValueError):
            qa.rename_qa_lock(self.workspace('0.1.48'), self.lock('0.1.42'))

    def test_duplicate_app_refused(self):
        with self.assertRaises(ValueError):
            qa.rename_qa_lock(self.workspace('0.1.48'), self.lock('0.1.48') + '\n[[package]]\nname = "anf"\nversion = "0.1.48"\n')

    def test_registry_app_or_existing_qa_refused(self):
        original = self.lock('0.1.48')
        for bad in (original.replace('dependencies =', 'source = "registry+https://example.invalid"\ndependencies ='),
                    original + '\n[[package]]\nname = "anf-mkr-qa"\nversion = "0.1.48"\n'):
            with self.assertRaises(ValueError):
                qa.rename_qa_lock(self.workspace('0.1.48'), bad)


if __name__ == '__main__':
    unittest.main()
