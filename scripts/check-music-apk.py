"""Check the actual combined APK, including native Flutter code and host classes."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path)
    parser.add_argument("--abi", choices=("arm64-v8a", "x86_64"))
    args = parser.parse_args()
    native = []
    with zipfile.ZipFile(args.apk) as archive:
        assert archive.testzip() is None, "APK CRC failure"
        names = archive.namelist()
        if args.abi:
            packaged = {name.split('/')[1] for name in names if name.startswith('lib/') and name.endswith('.so')}
            assert packaged == {args.abi}, f"Unexpected packaged ABIs: {packaged}"
        dex = b"".join(archive.read(name) for name in names if name.endswith(".dex"))
        for name in ("MusicActivity", "SpotubeHost", "AudioServiceActivity"):
            assert name.encode() in dex, "Missing native host class: " + name
        assert any("flutter_assets/" in name for name in names), "Missing Flutter assets"
        for abi in ((args.abi,) if args.abi else ("arm64-v8a", "x86_64")):
            for lib in ("libflutter.so", "libapp.so"):
                assert f"lib/{abi}/{lib}" in names, f"Missing {abi} {lib}"
        for name in names:
            if not name.startswith("lib/") or not name.endswith(".so"):
                continue
            data = archive.read(name)
            assert data[:4] == b"\x7fELF" and data[5] == 1, "Invalid native ELF: " + name
            wide = data[4] == 2
            offset = struct.unpack_from("<Q" if wide else "<I", data, 32 if wide else 28)[0]
            size, count = struct.unpack_from("<HH", data, 54 if wide else 42)
            assert count < 1024 and offset + count * size <= len(data), "Invalid ELF headers"
            alignments = []
            for index in range(count):
                header = offset + index * size
                if struct.unpack_from("<I", data, header)[0] == 1:
                    alignments.append(struct.unpack_from("<Q" if wide else "<I", data, header + (48 if wide else 28))[0])
            assert alignments, "Missing ELF load segments"
            assert min(alignments) >= 16384, "Native library lacks 16 KB load alignment: " + name
            native.append({"file": name, "bits": 64 if wide else 32, "loadAlignment": alignments})
        report = {
            "file": str(args.apk), "bytes": args.apk.stat().st_size,
            "sha256": hashlib.sha256(args.apk.read_bytes()).hexdigest(),
            "crc": "passed", "embeddedFlutter": True, "hostClasses": "present",
            "nativeLibraries": native,
            "nativeLoadAlignment": "at least 16 KB",
            "deviceTesting": "not performed", "signature": "verify separately with apksigner",
        }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
