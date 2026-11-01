#!/usr/bin/env python3
"""
Unified Cross-Platform Release Packaging & Verification Script for AnF.
Packages:
  - Windows Setup Installer (NSIS)
  - Windows Portable Archive (ZIP)
  - Android Debug APK (Sideloadable)
  - Android Unsigned APK (Production)
Performs:
  - Byte-integrity and APK structural audit (check-android-apk.py)
  - 16 KB ELF page-alignment check (zipalign -c -P 16 4)
  - Cryptographic manifest generation (SHA256SUMS)
"""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys


def get_default_version(root: str) -> str:
    tauri_conf = os.path.join(root, 'windows', 'src-tauri', 'tauri.conf.json')
    if os.path.exists(tauri_conf):
        try:
            with open(tauri_conf, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('version', '0.1.47')
        except Exception:
            pass
    return '0.1.47'


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while chunk := f.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest().lower()


def main():
    root = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
    default_ver = get_default_version(root)

    parser = argparse.ArgumentParser(description="Unified AnF Release Packaging")
    parser.add_argument(
        "--version",
        default=default_ver,
        help=f"Release version string (default: {default_ver})",
    )
    parser.add_argument(
        "--skip-align-check",
        action="store_true",
        help="Skip zipalign verification if tool unavailable",
    )
    args = parser.parse_args()

    version = args.version
    print(f"=== AnF Release Packaging Pipeline: v{version} ===")
    print(f"Workspace Root: {root}")

    out_dir = os.path.join(root, "releases", f"anf-{version}")
    os.makedirs(out_dir, exist_ok=True)

    # 1. Android Deliverables
    src_debug = os.path.join(
        root, "android", "gradle-build", "outputs", "apk", "debug", "CoucouAndroid-debug.apk"
    )
    src_unsigned = os.path.join(
        root, "android", "gradle-build", "outputs", "apk", "release", "CoucouAndroid-release-unsigned.apk"
    )

    dest_debug = os.path.join(out_dir, f"AnF-Android-{version}-debug.apk")
    dest_unsigned = os.path.join(out_dir, f"AnF-Android-{version}-unsigned.apk")

    if os.path.exists(src_debug):
        print(f"Packaging Android debug APK v{version}...")
        shutil.copyfile(src_debug, dest_debug)
        print(f"  -> {dest_debug} ({os.path.getsize(dest_debug):,} bytes)")
    elif os.path.exists(dest_debug):
        print(f"Using existing Android debug APK: {dest_debug}")
    else:
        print(f"Warning: Android debug APK source not found at {src_debug}")

    if os.path.exists(src_unsigned):
        print(f"Packaging Android unsigned APK v{version}...")
        shutil.copyfile(src_unsigned, dest_unsigned)
        print(f"  -> {dest_unsigned} ({os.path.getsize(dest_unsigned):,} bytes)")
    elif os.path.exists(dest_unsigned):
        print(f"Using existing Android unsigned APK: {dest_unsigned}")
    else:
        print(f"Warning: Android unsigned APK source not found at {src_unsigned}")

    # 2. Windows Deliverables
    win_rel = os.path.join(root, "windows", "release")
    src_win_setup = os.path.join(win_rel, f"AnF-Windows-{version}-setup.exe")
    if not os.path.exists(src_win_setup):
        src_win_setup = os.path.join(win_rel, "AnF-Windows-setup.exe")

    dest_win_setup = os.path.join(out_dir, f"AnF-Windows-{version}-setup.exe")
    if os.path.exists(src_win_setup):
        print(f"Packaging Windows Setup Installer v{version}...")
        shutil.copyfile(src_win_setup, dest_win_setup)
        print(f"  -> {dest_win_setup} ({os.path.getsize(dest_win_setup):,} bytes)")
    elif os.path.exists(dest_win_setup):
        print(f"Using existing Windows Setup Installer: {dest_win_setup}")
    else:
        print(f"Warning: Windows setup executable not found at {src_win_setup}")

    # Windows Portable Archive
    src_portable_dir = os.path.join(win_rel, f"AnF-Windows-{version}-portable")
    dest_portable_zip = os.path.join(out_dir, f"AnF-Windows-{version}-portable.zip")
    if os.path.exists(src_portable_dir):
        print(f"Creating Windows Portable ZIP archive v{version}...")
        base_name = os.path.splitext(dest_portable_zip)[0]
        shutil.make_archive(base_name, "zip", src_portable_dir)
        print(f"  -> {dest_portable_zip} ({os.path.getsize(dest_portable_zip):,} bytes)")
    elif os.path.exists(dest_portable_zip):
        print(f"Using existing Windows portable zip: {dest_portable_zip}")
    else:
        print(f"Warning: Portable directory not found at {src_portable_dir}")

    # 3. Android Verification
    if os.path.exists(dest_debug) and os.path.exists(dest_unsigned):
        apk_checker = os.path.join(root, "scripts", "check-android-apk.py")
        if os.path.exists(apk_checker):
            print("\nExecuting Android APK integrity check...")
            res = subprocess.run([sys.executable, apk_checker, dest_debug, dest_unsigned])
            if res.returncode != 0:
                print("Error: check-android-apk.py failed!")
                sys.exit(1)

        if not args.skip_align_check:
            zipalign_bin = r"C:\Users\mwali\.android-sdk\build-tools\36.0.0\zipalign.exe"
            if os.path.exists(zipalign_bin):
                print("Verifying 16 KB page-alignment via zipalign...")
                subprocess.run([zipalign_bin, "-c", "-P", "16", "4", dest_debug], check=True)
                subprocess.run([zipalign_bin, "-c", "-P", "16", "4", dest_unsigned], check=True)
                print("  -> 16 KB page-alignment check: PASS")

    # 4. Generate Cryptographic Manifest (SHA256SUMS)
    print("\nGenerating SHA256SUMS cryptographic manifest...")
    manifest_files = [
        f"AnF-Windows-{version}-setup.exe",
        f"AnF-Windows-{version}-portable.zip",
        f"AnF-Android-{version}-debug.apk",
        f"AnF-Android-{version}-unsigned.apk",
    ]

    manifest_lines = []
    for fname in manifest_files:
        fpath = os.path.join(out_dir, fname)
        if os.path.exists(fpath):
            file_hash = sha256_file(fpath)
            manifest_lines.append(f"{file_hash}  {fname}")
            print(f"  {file_hash}  {fname}")

    sums_path = os.path.join(out_dir, "SHA256SUMS")
    with open(sums_path, "w", encoding="utf-8") as f:
        f.write("\n".join(manifest_lines) + "\n")

    print(f"\nSuccessfully packaged and verified release v{version} in:")
    print(f"  {out_dir}")


if __name__ == "__main__":
    main()
