"""Create a verified PRIVATE ZIP64 pack. Private audio must never enter public releases."""
import argparse,pathlib,json,hashlib,zipfile,wave
p=argparse.ArgumentParser();p.add_argument('--source',type=pathlib.Path,required=True);p.add_argument('--destination',type=pathlib.Path,required=True)
a=p.parse_args();root=a.source.resolve();out=a.destination.resolve()
if out==root or root in out.parents or out.exists():raise ValueError('Choose a new destination outside the runtime.')
ready=json.loads((root/'ready.json').read_text());expected={'amazing','always-forever','burt-preview','serafina-preview','kelvin-preview'}
if not ready.get('offline') or {v['voice'] for v in ready['proof']}!=expected:raise ValueError('All five genuine offline synthesis proofs are required.')
for proof in ready['proof']:
    f=root/f"{proof['voice']}-verification.wav"
    if hashlib.sha256(f.read_bytes()).hexdigest()!=proof['sha256']:raise ValueError('Proof WAV hash mismatch.')
    with wave.open(str(f),'rb') as w:
        if w.getframerate()!=proof['sampleRate'] or abs(w.getnframes()/w.getframerate()-proof['seconds'])>0.0001:raise ValueError('Proof WAV metadata mismatch.')
for item in json.loads((root/'provenance.json').read_text())['files']:
    f=(root/item['file']).resolve()
    if root not in f.parents or f.is_symlink() or f.stat().st_size!=item['bytes'] or hashlib.sha256(f.read_bytes()).hexdigest()!=item['sha256']:raise ValueError('Runtime manifest mismatch.')
files=[];total=0
for f in root.rglob('*'):
    if f.is_symlink():raise ValueError('Runtime symlinks are not packageable.')
    if not f.is_file() or 'cache' in f.relative_to(root).parts or '__pycache__' in f.relative_to(root).parts or f.name in ('output.wav','ready.json.part'):continue
    files.append(f);total+=f.stat().st_size
    if len(files)>100000 or total>10_000_000_000:raise ValueError('Private runtime exceeds package bounds.')
out.parent.mkdir(parents=True,exist_ok=True);part=out.with_suffix(out.suffix+'.part')
with zipfile.ZipFile(part,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True) as z:
    for f in files:z.write(f,'local-voice/'+f.relative_to(root).as_posix())
part.replace(out)
with out.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
out.with_suffix(out.suffix+'.sha256').write_text(sha+'  '+out.name+'\n')
print(json.dumps({'file':str(out),'sha256':sha,'bytes':out.stat().st_size,'uncompressedBytes':total,'files':len(files),'private':True}),flush=True)
