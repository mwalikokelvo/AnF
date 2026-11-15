import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from android_archive_baseline import select_baseline, validate_inputs, verify_archive


class ArchiveBaselineTests(unittest.TestCase):
    def test_old_unsigned_artifact_selection_and_ambiguity(self):
        with tempfile.TemporaryDirectory(prefix='anf-baseline-test-') as tmp:
            directory = Path(tmp)
            expected = directory / 'previous-unsigned.apk'
            expected.write_bytes(b'unsigned test fixture')
            (directory / 'previous-debug.apk').write_bytes(b'debug test fixture')
            self.assertEqual(select_baseline(directory), expected)
            (directory / 'another-unsigned.apk').write_bytes(b'ambiguous')
            with self.assertRaisesRegex(ValueError, 'exactly one'):
                select_baseline(directory)

    def test_archive_identity_and_stale_provenance_are_rejected(self):
        with tempfile.TemporaryDirectory(prefix='anf-baseline-test-') as tmp:
            directory = Path(tmp)
            apk = directory / 'AnF-Android-0.1.22.apk'
            apk.write_bytes(b'synthetic archive fixture; not an APK')
            spec = {'filename': apk.name, 'sha256': hashlib.sha256(apk.read_bytes()).hexdigest(),
                    'signerSha256': 'a' * 64, 'applicationId': 'com.coucou.workspace'}
            cert = 'Signer #1 certificate SHA-256 digest: ' + 'a' * 64
            package = "package: name='com.coucou.workspace' versionName='fixture'"
            verify_archive(apk, cert, package, spec)
            for wrong_cert, wrong_package in [(cert.replace('a' * 64, 'b' * 64), package),
                                               (cert, package.replace('com.coucou.workspace', 'com.anf.workspace'))]:
                with self.assertRaises(ValueError):
                    verify_archive(apk, wrong_cert, wrong_package, spec)
            with self.assertRaisesRegex(ValueError, 'provenance'):
                select_baseline(directory, spec)
            report = {'baseline': spec, 'originalBaselineSignerVerified': True}
            provenance = directory / 'archive-provenance.json'
            provenance.write_text(json.dumps(report))
            self.assertEqual(select_baseline(directory, spec), apk)
            report['originalBaselineSignerVerified'] = False
            provenance.write_text(json.dumps(report))
            with self.assertRaisesRegex(ValueError, 'provenance'):
                select_baseline(directory, spec)
            report['originalBaselineSignerVerified'] = True
            provenance.write_text(json.dumps(report))
            apk.write_bytes(b'changed after verification')
            with self.assertRaisesRegex(ValueError, 'bytes changed'):
                select_baseline(directory, spec)

    def test_invalid_or_conflicting_sources_fail_before_download(self):
        for run, archive in [('', 'none'), ('123', 'none'), ('', 'legacy-0.1.22')]:
            validate_inputs(run, archive)
        for run, archive in [('123', 'legacy-0.1.22'), ('not-a-run', 'none'), ('', '../../unknown')]:
            with self.assertRaises(ValueError):
                validate_inputs(run, archive)


if __name__ == '__main__':
    unittest.main()
