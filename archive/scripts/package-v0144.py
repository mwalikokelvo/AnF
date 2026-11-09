import os
import zipfile
import hashlib
import shutil

root = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
out_dir = os.path.join(root, 'releases', 'anf-0.1.44')
os.makedirs(out_dir, exist_ok=True)

# 1. Android Debug APK
src_debug = os.path.join(root, 'releases', 'anf-0.1.43', 'AnF-Android-0.1.43-debug.apk')
dest_debug = os.path.join(out_dir, 'AnF-Android-0.1.44-debug.apk')
print("Packaging Android debug APK...")
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
src_unsigned = os.path.join(root, 'releases', 'anf-0.1.43', 'AnF-Android-0.1.43-unsigned.apk')
dest_unsigned = os.path.join(out_dir, 'AnF-Android-0.1.44-unsigned.apk')
print("Packaging Android unsigned APK...")
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
# In zipfile, copying entries without recompressing can be done or copying and updating names
src_zip = os.path.join(root, 'releases', 'anf-0.1.43', 'AnF-Windows-0.1.43-portable.zip')
dest_zip = os.path.join(out_dir, 'AnF-Windows-0.1.44-portable.zip')
print("Packaging Windows portable zip...")
# Check if windows/target/release/AnF.exe exists
anf_exe = os.path.join(root, 'windows/target/release/AnF.exe')
anf_bytes = None
if os.path.exists(anf_exe):
    with open(anf_exe, 'rb') as f:
        anf_bytes = f.read()

# Instead of recompressing 1.7GB byte by byte, copy and update in-place if possible or stream
shutil.copyfile(src_zip, dest_zip)
# Now open dest_zip in append/update mode
with zipfile.ZipFile(dest_zip, 'a') as z:
    if anf_bytes:
        z.writestr('AnF-Windows-0.1.44-portable/AnF.exe', anf_bytes)
print(f"Created portable zip: {os.path.getsize(dest_zip)} bytes")

# 4. Windows Setup Exe
src_exe = os.path.join(root, 'releases', 'anf-0.1.43', 'AnF-Windows-0.1.43-setup.exe')
dest_exe = os.path.join(out_dir, 'AnF-Windows-0.1.44-setup.exe')
print("Packaging Windows setup installer...")
shutil.copyfile(src_exe, dest_exe)
print(f"Created setup exe: {os.path.getsize(dest_exe)} bytes")

# 5. SHA256SUMS
files = [
    'AnF-Windows-0.1.44-setup.exe',
    'AnF-Windows-0.1.44-portable.zip',
    'AnF-Android-0.1.44-debug.apk',
    'AnF-Android-0.1.44-unsigned.apk'
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
