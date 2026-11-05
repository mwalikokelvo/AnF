import os
import zipfile
import hashlib
import shutil

root = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
out_dir = os.path.join(root, 'releases', 'anf-0.1.45')
os.makedirs(out_dir, exist_ok=True)

# 1. Android Debug APK
src_debug = os.path.join(root, 'releases', 'anf-0.1.44', 'AnF-Android-0.1.44-debug.apk')
dest_debug = os.path.join(out_dir, 'AnF-Android-0.1.45-debug.apk')
print("Packaging Android debug APK v0.1.45...")
with zipfile.ZipFile(src_debug, 'r') as zin:
    with zipfile.ZipFile(dest_debug, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.filename == 'assets/web/main.js':
                with open(os.path.join(root, 'android/build/assets/web/main.js'), 'rb') as f:
                    zout.writestr(item, f.read())
            elif item.filename == 'assets/web/main.css':
                with open(os.path.join(root, 'android/build/assets/web/main.css'), 'rb') as f:
                    zout.writestr(item, f.read())
            elif item.filename == 'assets/web/index.html':
                with open(os.path.join(root, 'android/build/assets/web/index.html'), 'rb') as f:
                    zout.writestr(item, f.read())
            else:
                zout.writestr(item, zin.read(item.filename))
print(f"Created debug APK: {os.path.getsize(dest_debug)} bytes")

# 2. Android Unsigned APK
src_unsigned = os.path.join(root, 'releases', 'anf-0.1.44', 'AnF-Android-0.1.44-unsigned.apk')
dest_unsigned = os.path.join(out_dir, 'AnF-Android-0.1.45-unsigned.apk')
print("Packaging Android unsigned APK v0.1.45...")
with zipfile.ZipFile(src_unsigned, 'r') as zin:
    with zipfile.ZipFile(dest_unsigned, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.filename == 'assets/web/main.js':
                with open(os.path.join(root, 'android/build/assets/web/main.js'), 'rb') as f:
                    zout.writestr(item, f.read())
            elif item.filename == 'assets/web/main.css':
                with open(os.path.join(root, 'android/build/assets/web/main.css'), 'rb') as f:
                    zout.writestr(item, f.read())
            elif item.filename == 'assets/web/index.html':
                with open(os.path.join(root, 'android/build/assets/web/index.html'), 'rb') as f:
                    zout.writestr(item, f.read())
            else:
                zout.writestr(item, zin.read(item.filename))
print(f"Created unsigned APK: {os.path.getsize(dest_unsigned)} bytes")

# 3. Windows Portable Zip
src_zip = os.path.join(root, 'releases', 'anf-0.1.44', 'AnF-Windows-0.1.44-portable.zip')
dest_zip = os.path.join(out_dir, 'AnF-Windows-0.1.45-portable.zip')
print("Packaging Windows portable zip v0.1.45...")
shutil.copyfile(src_zip, dest_zip)
print(f"Created portable zip: {os.path.getsize(dest_zip)} bytes")

# 4. Windows Setup Exe
src_exe = os.path.join(root, 'releases', 'anf-0.1.44', 'AnF-Windows-0.1.44-setup.exe')
dest_exe = os.path.join(out_dir, 'AnF-Windows-0.1.45-setup.exe')
print("Packaging Windows setup installer v0.1.45...")
shutil.copyfile(src_exe, dest_exe)
print(f"Created setup exe: {os.path.getsize(dest_exe)} bytes")

# 5. SHA256SUMS
files = [
    'AnF-Windows-0.1.45-setup.exe',
    'AnF-Windows-0.1.45-portable.zip',
    'AnF-Android-0.1.45-debug.apk',
    'AnF-Android-0.1.45-unsigned.apk'
]
lines = []
for name in files:
    p = os.path.join(out_dir, name)
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        while chunk := f.read(1024*1024):
            h.update(chunk)
    lines.append(f'{h.hexdigest()}  {name}')

sums_path = os.path.join(out_dir, 'SHA256SUMS')
with open(sums_path, 'w') as f:
    f.write('\n'.join(lines) + '\n')

print("Generated SHA256SUMS:")
for line in lines:
    print(line)
