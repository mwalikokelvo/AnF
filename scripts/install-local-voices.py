"""Create a relocatable PRIVATE voice sidecar. Provision public assets first.
Run with the prepared CPU venv; outputs contain licensed dependencies and private references.
Never include this directory in public releases or Git.
"""
import argparse, pathlib, shutil, sys, subprocess, json, hashlib
p=argparse.ArgumentParser();p.add_argument('--assets',type=pathlib.Path,required=True);p.add_argument('--destination',type=pathlib.Path,required=True);p.add_argument('--ffmpeg',type=pathlib.Path,required=True);p.add_argument('--amazing',type=pathlib.Path,required=True);p.add_argument('--always-forever',type=pathlib.Path,required=True)
a=p.parse_args();dest=a.destination.resolve()
if dest.exists():raise ValueError('Choose a new empty destination to preserve existing voices.')
dest.mkdir(parents=True)
for name in ('source','model'):shutil.copytree(a.assets/name,dest/name)
if (a.assets/'licenses').exists():shutil.copytree(a.assets/'licenses',dest/'licenses')
shutil.copy2(a.assets/'provenance.json',dest/'provenance.json')
shutil.copy2(pathlib.Path(__file__).with_name('local-voice-worker.py'),dest/'worker.py')
# Full base interpreter + venv packages removes the original venv's absolute home dependency.
shutil.copytree(sys.base_prefix,dest/'python',ignore=shutil.ignore_patterns('__pycache__','site-packages'))
shutil.copytree(pathlib.Path(sys.prefix)/'Lib/site-packages',dest/'python/Lib/site-packages',ignore=shutil.ignore_patterns('__pycache__'))
(dest/'references').mkdir()
for voice,file in [('amazing',a.amazing),('always-forever',a.always_forever)]:
    subprocess.run([str(a.ffmpeg.resolve()),'-nostdin','-v','error','-i',str(file.resolve()),'-ss','5','-t','12','-vn','-ac','1','-ar','24000','-c:a','pcm_s16le',str(dest/'references'/f'{voice}.wav')],check=True,timeout=60)
manifest=json.loads((dest/'provenance.json').read_text())
# Include the adapted package initializer and private references in the local integrity manifest.
for item in manifest['files']:
    f=dest/item['file'];item.update(sha256=hashlib.sha256(f.read_bytes()).hexdigest(),bytes=f.stat().st_size)
for f in (dest/'references').glob('*.wav'):
    manifest['files'].append({'file':f.relative_to(dest).as_posix(),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'bytes':f.stat().st_size})
(dest/'provenance.json').write_text(json.dumps(manifest,indent=2))
proof=[]
for voice in ('amazing','always-forever'):
    job=subprocess.run([str(dest/'python/python.exe'),str(dest/'worker.py')],input=json.dumps({'voice':voice,'text':'The quiet garden welcomes a brand new story today.'}),text=True,capture_output=True,timeout=240)
    (dest/f'{voice}-verification.log').write_text(job.stdout+'\n'+job.stderr)
    job.check_returncode();proof.append({'voice':voice,**json.loads(job.stdout.strip().splitlines()[-1])})
    shutil.move(dest/'output.wav',dest/f'{voice}-verification.wav')
(dest/'ready.json').write_text(json.dumps({'engine':'Chatterbox Nano CPU','offline':True,'proof':proof},indent=2))
print('Both local voices synthesized new text offline:',dest)
