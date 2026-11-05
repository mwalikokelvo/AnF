"""Integration tests of combined APK gates using synthetic ZIPs, not installable APKs."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

CHECK = Path(__file__).with_name('check-android-apk.py')


class ApkGateCheck(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='anf-apk-gates-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.assets = self.root / 'assets'
        self.assets.mkdir()
        self.contract = {'applicationId': 'com.anf.workspace', 'fixture': True}
        names = ['index.html', 'main.js', 'main.css', 'pdf.worker.mjs',
                 'THIRD-PARTY-LICENSES.txt', 'THIRD-PARTY-STORAGE-LICENSES.txt',
                 'cmaps/test', 'standard_fonts/test', 'wasm/test']
        for name in names:
            p = self.assets / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b'generated fixture')
        (self.assets / 'android-build.json').write_text(json.dumps(self.contract))

    def archive(self, aligned=True, native=True, stale=False):
        target = self.root / 'fixture.zip'
        with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as out:
            for source in self.assets.rglob('*'):
                if source.is_file():
                    name = source.relative_to(self.assets).as_posix()
                    content = b'stale' if stale and name == 'main.js' else source.read_bytes()
                    out.writestr('assets/web/' + name, content)
            if native:
                info = zipfile.ZipInfo('lib/arm64-v8a/libsqlcipher.so')
                info.compress_type = zipfile.ZIP_STORED
                if aligned:
                    pad = (-(out.fp.tell() + 30 + len(info.filename.encode()))) % 16384
                    if pad < 4:
                        pad += 16384
                    info.extra = b'\xfe\xca' + (pad - 4).to_bytes(2, 'little') + bytes(pad - 4)
                out.writestr(info, b'not a real native binary')
        return target

    def run_gate(self, archive, contract=None):
        return subprocess.run([sys.executable, str(CHECK), str(archive),
                               '--assets-dir', str(self.assets), '--contract',
                               json.dumps(self.contract if contract is None else contract)],
                              capture_output=True, text=True)

    def test_combined_gates_accept_matching_aligned_fixture(self):
        result = self.run_gate(self.archive())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('1 uncompressed .so libraries aligned', result.stdout)

    def test_contract_still_required(self):
        result = self.run_gate(self.archive(), {'wrong': True})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('current product inputs', result.stderr)

    def test_stale_web_bytes_still_rejected(self):
        result = self.run_gate(self.archive(stale=True))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Stale or altered packaged asset', result.stderr)

    def test_native_storage_still_required(self):
        result = self.run_gate(self.archive(native=False))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Missing encrypted-storage native runtime', result.stderr)

    def test_main_alignment_gate_retained(self):
        result = self.run_gate(self.archive(aligned=False))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('16 KB page alignment failed', result.stderr)


if __name__ == '__main__':
    unittest.main()
