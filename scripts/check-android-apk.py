"""Verify that APK assets match MainActivity's web/ URL handler and 16 KB page alignment."""
import struct
import sys
import zipfile

def verify_alignment(filename):
    with open(filename, 'rb') as f:
        data = f.read()
    eocd_pos = data.rfind(b'\x50\x4b\x05\x06')
    if eocd_pos == -1:
        raise SystemExit(f'Missing EOCD signature in {filename}')
    cd_entries = struct.unpack('<H', data[eocd_pos+10:eocd_pos+12])[0]
    cd_start = struct.unpack('<I', data[eocd_pos+16:eocd_pos+20])[0]
    pos = cd_start
    so_count = 0
    for _ in range(cd_entries):
        fields = struct.unpack('<IHHHHHHIIIHHHHHII', data[pos:pos+46])
        fn_len, extra_len, comment_len, local_offset = fields[10], fields[11], fields[12], fields[16]
        name = data[pos+46:pos+46+fn_len].decode('utf-8', errors='ignore')
        pos += 46 + fn_len + extra_len + comment_len
        l_fields = struct.unpack('<IHHHIIIIHH', data[local_offset:local_offset+30])
        l_method, l_fn_len, l_extra_len = l_fields[3], l_fields[8], l_fields[9]
        file_data_offset = local_offset + 30 + l_fn_len + l_extra_len
        if name.endswith('.so') and l_method == 0:
            so_count += 1
            if file_data_offset % 16384 != 0:
                raise SystemExit(f'16 KB page alignment failed: {name} at offset {file_data_offset} in {filename}')
        elif l_method == 0:
            if file_data_offset % 4 != 0:
                raise SystemExit(f'4-byte alignment failed: {name} at offset {file_data_offset} in {filename}')
    return so_count

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
        so_count = verify_alignment(filename)
        print(f'PASS: packaged WebView, PDF assets, and 16 KB page-alignment in {filename} ({so_count} uncompressed .so libraries aligned)')
