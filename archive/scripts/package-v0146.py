import os
import shutil
import hashlib
import subprocess
import sys

root = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
out_dir = os.path.join(root, 'releases', 'anf-0.1.46')
os.makedirs(out_dir, exist_ok=True)

# Sources from Gradle build
src_debug = os.path.join(root, 'android', 'gradle-build', 'outputs', 'apk', 'debug', 'CoucouAndroid-debug.apk')
src_unsigned = os.path.join(root, 'android', 'gradle-build', 'outputs', 'apk', 'release', 'CoucouAndroid-release-unsigned.apk')

dest_debug = os.path.join(out_dir, 'AnF-Android-0.1.46-debug.apk')
dest_unsigned = os.path.join(out_dir, 'AnF-Android-0.1.46-unsigned.apk')

# Copy APKs
print("Packaging Android debug APK v0.1.46...")
shutil.copyfile(src_debug, dest_debug)
print(f"Created debug APK: {os.path.getsize(dest_debug)} bytes")

print("Packaging Android unsigned APK v0.1.46...")
shutil.copyfile(src_unsigned, dest_unsigned)
print(f"Created unsigned APK: {os.path.getsize(dest_unsigned)} bytes")

# Also copy to root releases/ if needed for root-level referencing
root_debug = os.path.join(root, 'releases', 'AnF-Android-0.1.46-debug.apk')
root_unsigned = os.path.join(root, 'releases', 'AnF-Android-0.1.46-unsigned.apk')
shutil.copyfile(dest_debug, root_debug)
shutil.copyfile(dest_unsigned, root_unsigned)

# Verify with check-android-apk.py
print("Running check-android-apk.py...")
res = subprocess.run([sys.executable, os.path.join(root, 'scripts', 'check-android-apk.py'), dest_debug, dest_unsigned], check=True)

# Verify with zipalign if available
zipalign_bin = r"C:\Users\mwali\.android-sdk\build-tools\36.0.0\zipalign.exe"
if os.path.exists(zipalign_bin):
    print("Verifying 16 KB page-alignment with zipalign...")
    subprocess.run([zipalign_bin, "-c", "-P", "16", "4", dest_debug], check=True)
    subprocess.run([zipalign_bin, "-c", "-P", "16", "4", dest_unsigned], check=True)
    print("zipalign 16 KB page-alignment check: PASS")

# Generate updated SHA256SUMS for releases/anf-0.1.46
files = [
    'AnF-Windows-0.1.46-setup.exe',
    'AnF-Windows-0.1.46-portable.zip',
    'AnF-Android-0.1.46-debug.apk',
    'AnF-Android-0.1.46-unsigned.apk'
]
lines = []
for name in files:
    p = os.path.join(out_dir, name)
    if not os.path.exists(p):
        print(f"Warning: file {name} does not exist in {out_dir}")
        continue
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        while chunk := f.read(1024*1024):
            h.update(chunk)
    lines.append(f'{h.hexdigest()}  {name}')

sums_path = os.path.join(out_dir, 'SHA256SUMS')
with open(sums_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines) + '\n')

print("Updated SHA256SUMS:")
for line in lines:
    print(line)
