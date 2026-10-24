import hashlib, json, os, pathlib, sys, zipfile
root=pathlib.Path(__file__).resolve().parent
output=root/(sys.argv[1] if len(sys.argv)>1 else 'AF-0.2.0-development-checkpoint-2026-10-13.zip')
assert output.resolve().parent == root.resolve()
excluded={'node_modules','dist','build','gradle-build','target','.git','.gradle','.dart_tool','.android','.ios','vendor','__pycache__'}
def io(path): return pathlib.Path('\\\\?\\'+str(path.resolve())) if os.name=='nt' else path
with zipfile.ZipFile(output,'x',compression=zipfile.ZIP_DEFLATED) as archive:
    for source,prefix in [(root/'af/work/coucou','af/work/coucou'),(root/'spotube/spotube-master','spotube/spotube-master')]:
        for path in source.rglob('*'):
            relative=path.relative_to(source)
            if any(part in excluded for part in relative.parts): continue
            if path.name in {'.env','env.g.dart','local.properties'} or path.suffix in {'.jks','.keystore'}: continue
            if io(path).is_file(): archive.write(io(path),f'{prefix}/{relative.as_posix()}')
    for name in ['provision-android.py','prepare-music.py','prepare-android-music-module.py','Build-Android-Development.ps1','Build-Windows-Development.ps1','Build-Android-Music.ps1','android-commandline-javac.gradle','verify-android-artifact.py','package-development-checkpoint.py','verify-frontend.ps1']:
        archive.write(root/name,name)
    archive.write(root.parent/'Project-Continuity.txt','Project-Continuity.txt')
    for document in sorted(root.parent.glob('AF-*.md')):
        if document.is_file(): archive.write(document,document.name)
    for path in (root/'verification').glob('*'):
        if path.name == 'combined-apk-dex-classes.txt': continue
        if path.suffix in {'.log','.json','.txt'}: archive.write(path,'verification/'+path.name)
    for folder in sorted((root/'verification').iterdir()):
        if not folder.is_dir(): continue
        for path in folder.glob('*'):
            if path.is_file() and (path.suffix in {'.log','.json','.txt'} or path.name in {'browser-proof.png','browser-proof.jpg'}): archive.write(path,'verification/'+folder.name+'/'+path.name)
    for path in (root/'tool-downloads').glob('*'):
        if path.suffix in {'.json','.xml','.sha256'} and path.name!='flutter-releases.json': archive.write(path,'tool-downloads/'+path.name)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert not any(name.endswith(('.jks','.keystore','/.env','/env.g.dart')) for name in archive.namelist())
digest=hashlib.sha256(output.read_bytes()).hexdigest()
(root/'verification'/(output.stem+'-sha256.txt')).write_text(f'{digest}  {output.name}\n')
print(json.dumps({'sourceOnly':True,'path':str(output),'bytes':output.stat().st_size,'sha256':digest}))
