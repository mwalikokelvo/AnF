"""Negative tests for APK asset provenance. Fixtures are ZIPs, not installable apps."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

checker = Path(__file__).with_name('check-android-apk.py')
with tempfile.TemporaryDirectory(prefix='anf-apk-check-') as folder:
    base = Path(folder)
    assets = base / 'assets'
    assets.mkdir()
    files = {n: b'fixture' for n in ['index.html', 'main.js', 'main.css', 'pdf.worker.mjs',
             'THIRD-PARTY-LICENSES.txt', 'THIRD-PARTY-STORAGE-LICENSES.txt',
             'cmaps/test.bcmap', 'standard_fonts/test.pfb', 'wasm/test.wasm']}
    contract = {'version': '0.1.31', 'sourceSha256': 'a' * 64}
    files['android-build.json'] = json.dumps(contract).encode()
    for name, data in files.items():
        destination = assets / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    apk = base / 'fixture.apk'
    with zipfile.ZipFile(apk, 'w') as archive:
        for name, data in files.items():
            archive.writestr('assets/web/' + name, data)
        archive.writestr('lib/arm64-v8a/libsqlcipher.so', b'fixture')

    def check(expected, current_contract=contract):
        result = subprocess.run([sys.executable, str(checker), str(apk), '--assets-dir',
                                 str(assets), '--contract', json.dumps(current_contract)],
                                capture_output=True, text=True)
        assert (result.returncode == 0) == expected, result.stdout + result.stderr

    check(True)
    check(False, {**contract, 'sourceSha256': 'b' * 64})
    (assets / 'main.js').write_bytes(b'newer source build')
    check(False)
    (assets / 'main.js').write_bytes(files['main.js'])
    (assets / 'new-feature.js').write_bytes(b'new')
    check(False)
print('PASS: APK provenance rejects stale source, altered web bytes and missing new features.')
