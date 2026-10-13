"""Verify that APK assets match MainActivity's web/ URL handler."""
import sys
import zipfile

for filename in sys.argv[1:]:
    with zipfile.ZipFile(filename) as apk:
        names = set(apk.namelist())
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
        print(f'PASS: packaged WebView and PDF assets in {filename}')
