"""Verify that APK assets match MainActivity's web/ URL handler."""
import sys
import zipfile
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('filenames', nargs='+')
parser.add_argument('--assets-dir')
parser.add_argument('--contract')
args = parser.parse_args()
for filename in args.filenames:
    with zipfile.ZipFile(filename) as apk:
        bad = apk.testzip()
        if bad:
            raise SystemExit('APK CRC failure: ' + bad)
        names = set(apk.namelist())
        if len(names) != len(apk.namelist()):
            raise SystemExit('Duplicate ZIP entries are forbidden')
        for name in ['index.html', 'main.js', 'main.css', 'pdf.worker.mjs',
                     'THIRD-PARTY-LICENSES.txt', 'THIRD-PARTY-STORAGE-LICENSES.txt']:
            route = 'assets/web/' + name
            if route not in names or not apk.getinfo(route).file_size:
                raise SystemExit(f'Missing native WebView asset: {route} in {filename}')
        for directory in ['cmaps', 'standard_fonts', 'wasm']:
            if not any(name.startswith('assets/web/' + directory + '/') for name in names):
                raise SystemExit(f'Missing PDF runtime directory: {directory}')
        if 'assets/index.html' in names:
            raise SystemExit('Stale root assets would hide an incorrect native routing layout')
        if not any(name.startswith('lib/') and name.endswith('/libsqlcipher.so') for name in names):
            raise SystemExit('Missing encrypted-storage native runtime')
        if args.contract:
            actual = json.loads(apk.read('assets/web/android-build.json'))
            if actual != json.loads(args.contract):
                raise SystemExit('APK was not built from current product inputs')
        if args.assets_dir:
            assets = Path(args.assets_dir)
            expected = {'assets/web/' + str(p.relative_to(assets)).replace('\\', '/'): p
                        for p in assets.rglob('*') if p.is_file()}
            packaged = {n for n in names if n.startswith('assets/web/') and not n.endswith('/')}
            if packaged != set(expected):
                raise SystemExit('Packaged WebView file inventory differs from current assets')
            for name, source in expected.items():
                if hashlib.sha256(apk.read(name)).digest() != hashlib.sha256(source.read_bytes()).digest():
                    raise SystemExit('Stale or altered packaged asset: ' + name)
        print(f'PASS: packaged WebView and PDF assets in {filename}')
