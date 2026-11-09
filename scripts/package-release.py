#!/usr/bin/env python3
"""Collect, verify and checksum the AnF release deliverables.

This script only copies and zips what the builds already produced:
  windows/release/AnF-Windows-X-setup.exe            (npm run pack, in windows/)
  windows/release/AnF-Windows-X-portable/            (npm run pack, in windows/)
  android/gradle-build/outputs/apk/{debug,release}/  (node scripts/build-android.mjs)
into releases/anf-X/, then verifies the APKs and writes SHA256SUMS.

It exits non-zero if a required artifact is missing (unless --allow-partial) or
a check cannot run (unless it is explicitly skipped). It only says "Successfully
packaged and verified" when every check really ran.
"""

import argparse
import glob
import hashlib
import json
import os
import shutil
import subprocess
import sys


def read_version(root: str) -> str:
    conf = os.path.join(root, 'windows', 'src-tauri', 'tauri.conf.json')
    try:
        with open(conf, 'r', encoding='utf-8') as f:
            version = json.load(f)['version']
    except (OSError, ValueError, KeyError) as e:
        sys.exit(f"error: cannot read version from {conf}: {e}")
    if not isinstance(version, str) or not version:
        sys.exit(f"error: no version string in {conf}")
    return version


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while chunk := f.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()


def find_zipalign():
    found = shutil.which('zipalign')
    if found:
        return found
    for var in ('ANDROID_HOME', 'ANDROID_SDK_ROOT'):
        sdk = os.environ.get(var)
        if sdk:
            hits = sorted(glob.glob(os.path.join(sdk, 'build-tools', '*', 'zipalign*')))
            hits = [h for h in hits if os.path.basename(h) in ('zipalign', 'zipalign.exe')]
            if hits:
                return hits[-1]
    return None


def main():
    parser = argparse.ArgumentParser(description="Package and verify the AnF release")
    parser.add_argument("--version", help="must equal tauri.conf.json's version unless --force")
    parser.add_argument("--root", default=os.path.abspath(os.path.join(os.path.dirname(__file__), '..')),
                        help="repository root (default: this checkout)")
    parser.add_argument("--allow-partial", action="store_true",
                        help="do not fail when required artifacts are missing")
    parser.add_argument("--skip-align-check", action="store_true",
                        help="skip the zipalign 16 KB check (reported as SKIPPED)")
    parser.add_argument("--force", action="store_true",
                        help="allow --version to differ from tauri.conf.json")
    args = parser.parse_args()

    root = os.path.abspath(args.root)
    conf_version = read_version(root)
    version = args.version or conf_version
    if version != conf_version and not args.force:
        sys.exit(f"error: --version {version} does not match tauri.conf.json ({conf_version}); use --force to override")

    print(f"=== AnF release packaging: v{version} ===")
    out_dir = os.path.join(root, "releases", f"anf-{version}")
    os.makedirs(out_dir, exist_ok=True)

    names = {
        "setup": f"AnF-Windows-{version}-setup.exe",
        "portable": f"AnF-Windows-{version}-portable.zip",
        "debug": f"AnF-Android-{version}-debug.apk",
        "unsigned": f"AnF-Android-{version}-unsigned.apk",
    }
    # Never reuse a stale artifact: start from a clean set of known names.
    for n in [*names.values(), "SHA256SUMS", "manifest.json"]:
        p = os.path.join(out_dir, n)
        if os.path.exists(p):
            os.remove(p)
    dest = {k: os.path.join(out_dir, n) for k, n in names.items()}

    win_rel = os.path.join(root, "windows", "release")
    apk_dir = os.path.join(root, "android", "gradle-build", "outputs", "apk")
    sources = {
        "setup": os.path.join(win_rel, names["setup"]),
        "debug": os.path.join(apk_dir, "debug", "CoucouAndroid-debug.apk"),
        "unsigned": os.path.join(apk_dir, "release", "CoucouAndroid-release-unsigned.apk"),
    }
    portable_base = f"AnF-Windows-{version}-portable"
    portable_dir = os.path.join(win_rel, portable_base)

    missing = []
    for key, src in sources.items():
        if os.path.isfile(src):
            shutil.copyfile(src, dest[key])
            print(f"  copied {names[key]} ({os.path.getsize(dest[key]):,} bytes)")
        else:
            missing.append(f"{names[key]} (expected at {src})")
    if os.path.isdir(portable_dir):
        shutil.make_archive(os.path.splitext(dest["portable"])[0], "zip",
                            root_dir=win_rel, base_dir=portable_base)
        print(f"  zipped {names['portable']} ({os.path.getsize(dest['portable']):,} bytes)")
    else:
        missing.append(f"{names['portable']} (expected folder {portable_dir})")

    if missing:
        print("\nMissing required artifacts:", file=sys.stderr)
        for m in missing:
            print(f"  - {m}", file=sys.stderr)
        if not args.allow_partial:
            sys.exit("error: release incomplete (use --allow-partial to package what exists)")
        print("WARNING: --allow-partial set; this release is INCOMPLETE")

    # Verification: every check ends up PASS, SKIPPED or FAIL.
    checks = {}
    have_apks = os.path.isfile(dest["debug"]) and os.path.isfile(dest["unsigned"])
    checker = os.path.join(root, "scripts", "check-android-apk.py")
    if not have_apks:
        checks["APK integrity"] = checks["16 KB alignment"] = "SKIPPED (APKs missing)"
    else:
        res = subprocess.run([sys.executable, checker, dest["debug"], dest["unsigned"]])
        if res.returncode != 0:
            sys.exit("error: check-android-apk.py failed")
        checks["APK integrity"] = "PASS"
        if args.skip_align_check:
            checks["16 KB alignment"] = "SKIPPED (--skip-align-check)"
        else:
            zipalign = find_zipalign()
            if not zipalign:
                sys.exit("error: zipalign not found (PATH or $ANDROID_HOME/build-tools/*); install it or pass --skip-align-check")
            for key in ("debug", "unsigned"):
                if subprocess.run([zipalign, "-c", "-P", "16", "4", dest[key]]).returncode != 0:
                    sys.exit(f"error: zipalign 16 KB check failed for {names[key]}")
            checks["16 KB alignment"] = "PASS"

    lines = [f"{sha256_file(dest[k])}  {names[k]}" for k in names if os.path.isfile(dest[k])]
    if not lines:
        sys.exit("error: no artifacts were packaged; not writing an empty SHA256SUMS")
    with open(os.path.join(out_dir, "SHA256SUMS"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")
    print("\nSHA256SUMS:")
    print("\n".join(f"  {l}" for l in lines))

    manifest = {
        "version": version,
        "format": "anf-release-manifest-v1",
        "artifacts": {
            k: {
                "file": names[k],
                "sha256": sha256_file(dest[k]),
                "size": os.path.getsize(dest[k]),
                "platform": "windows" if "Windows" in names[k] else "android",
                "arch": "x64" if "Windows" in names[k] else "universal",
            }
            for k in names if os.path.isfile(dest[k])
        },
    }
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, indent=2)
    print("  wrote manifest.json")

    print("\nChecks:")
    for name, status in checks.items():
        print(f"  {name}: {status}")
    if missing or any(s != "PASS" for s in checks.values()):
        print(f"\nPackaged v{version} in {out_dir} -- NOT fully verified (see MISSING/SKIPPED above).")
    else:
        print(f"\nSuccessfully packaged and verified release v{version} in:\n  {out_dir}")


if __name__ == "__main__":
    main()
