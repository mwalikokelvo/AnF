"""Isolated Windows source rebuild evidence; never modifies shipped binaries."""
import argparse, hashlib, json, os, subprocess, urllib.request, zipfile
from pathlib import Path, PurePosixPath

HERE = Path(__file__).resolve().parent

def fetch_exact(url, target, digest, limit):
    # Frozen public source/toolchain URLs only; no redirects, credentials or retries.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            raise ValueError('Redirect refused')
    opener = urllib.request.build_opener(NoRedirect())
    with opener.open(url, timeout=60) as response:
        data = response.read(limit + 1)
    if len(data) > limit or hashlib.sha256(data).hexdigest() != digest:
        raise ValueError('Archive size/hash mismatch')
    with target.open('xb') as stream: stream.write(data)

def unpack(archive, target):
    with zipfile.ZipFile(archive) as z:
        entries = z.infolist()
        if len(entries) > 50000 or sum(i.file_size for i in entries) > 600*1024*1024:
            raise ValueError('Expanded archive exceeds bound')
        for i in entries:
            name = i.orig_filename
            if (name.startswith('/') or '\\' in name or ':' in name or
                any(p == '..' for p in PurePosixPath(name).parts) or
                any(ord(c)<32 for c in name) or (i.external_attr >> 16) & 0o170000 == 0o120000):
                raise ValueError('Unsafe archive entry')
        z.extractall(target)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    if os.name != 'nt' or os.environ.get('GITHUB_ACTIONS') != 'true':
        raise ValueError('Explicit hosted Windows engineering QA only')
    out=args.output.resolve();out.mkdir(parents=True,exist_ok=False)
    evidence=json.loads((HERE/'native-source-evidence.json').read_text(encoding='utf-8'))
    roots=[]
    for index, row in enumerate(evidence['sourceArchives']):
        archive=out/row['archiveName']
        fetch_exact(row['archiveUrl'],archive,row['archiveSha256'],8*1024*1024)
        folder=out/f'source-{index}';unpack(archive,folder)
        children=list(folder.iterdir());assert len(children)==1 and children[0].is_dir()
        roots.append(children[0])
    assert len(roots)==3
    import shutil
    for origin, name in zip(roots[1:],['quickjs','c-vector']):
        dest=roots[0]/'quickjs/native'/name
        if dest.exists():
            assert not any(dest.iterdir());dest.rmdir()
        shutil.copytree(origin,dest)
    zigzip=out/'zig.zip'
    fetch_exact('https://ziglang.org/download/0.12.0/zig-windows-x86_64-0.12.0.zip',
        zigzip,'2199eb4c2000ddb1fba85ba78f1fcf9c1fb8b3e57658f6a627a8e513131893f5',80*1024*1024)
    unpack(zigzip,out/'zig')
    zig=out/'zig/zig-windows-x86_64-0.12.0'
    env=dict(os.environ);env['PATH']=str(zig)+os.pathsep+env['PATH']
    native=roots[0]/'quickjs/native';build=out/'build'
    subprocess.run(['cmake','-S',str(native),'-B',str(build),'-G','Ninja',
        '-DCMAKE_BUILD_TYPE=MinSizeRel','-DTARGET_PLATFORM=windows_x64',
        '-DBUILD_WITH_JNI=ON','-DLIBRARY_TYPE=shared',
        '-DPLATFORM_JAVA_HOME='+env['JAVA_HOME']],env=env,check=True,timeout=180)
    subprocess.run(['cmake','--build',str(build),'--parallel','2'],env=env,check=True,timeout=900)
    dll=build/'libquickjs.dll';assert dll.is_file()
    result={'schema':1,'reviewedSourceCommit':evidence['sourceArchives'][0]['commit'],
        'rebuiltDll':str(dll),'rebuiltDllSha256':hashlib.sha256(dll.read_bytes()).hexdigest(),
        'zigVersion':'0.12.0','sourceRecipe':'MinSizeRel/windows_x64/shared/JNI',
        'publishedBinaryMatch':None,'runtimeSmokePassed':False,'readyForPublication':False}
    (out/'rebuild-evidence.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    with open(os.environ['GITHUB_ENV'],'a',encoding='utf-8') as f:
        f.write('ANF_MKR_REBUILT_QUICKJS='+str(dll)+'\n')
    print('Built isolated source candidate; binary comparison/JNI acceptance still required.')

if __name__=='__main__': main()
