"""Add explicitly licensed previews to an existing PRIVATE offline runtime."""
import argparse,pathlib,subprocess,json,shutil,hashlib,wave,math
p=argparse.ArgumentParser();p.add_argument('--destination',type=pathlib.Path,required=True);p.add_argument('--ffmpeg',type=pathlib.Path,required=True);p.add_argument('--reference',action='append',required=True,help='Registered voice ID=local input path')
a=p.parse_args();root=a.destination.resolve()
if not (root/'python/python.exe').is_file() or not (root/'ready.json').is_file():raise ValueError('An already verified local runtime is required.')
known={'burt-preview','serafina-preview','kelvin-preview'}
items=[]
for raw in a.reference:
    voice,file=raw.split('=',1)
    if voice not in known or voice in [v for v,_ in items]:raise ValueError('Unknown or duplicate preview voice.')
    file=pathlib.Path(file).resolve()
    if not file.is_file() or file.stat().st_size>50_000_000:raise ValueError('Local preview must be under 50 MB.')
    items.append((voice,file))
shutil.copy2(pathlib.Path(__file__).with_name('local-voice-worker.py'),root/'worker.py')
manifest=json.loads((root/'provenance.json').read_text());ready=json.loads((root/'ready.json').read_text());proof=ready['proof'];sources=ready.get('referencePreparation',[])
for voice,file in items:
    output=root/'references'/f'{voice}.wav'
    if output.exists():raise ValueError('Reference already exists; preserve the verified pack and use a fresh copy to replace it.')
    subprocess.run([str(a.ffmpeg.resolve()),'-nostdin','-v','error','-i',str(file),'-t','12','-vn','-ac','1','-ar','24000','-c:a','pcm_s16le',str(output)],check=True,timeout=60)
    with wave.open(str(output),'rb') as w:params=w.getparams();audio=w.readframes(w.getnframes());seconds=w.getnframes()/w.getframerate()
    if seconds<3:raise ValueError('Preview requires at least three seconds of speech.')
    repeats=math.ceil(6/seconds) if seconds<=5 else 1
    if repeats>1:
        with wave.open(str(output),'wb') as w:w.setparams(params);w.writeframes(audio*repeats)
    sources.append({'voice':voice,'originalSha256':hashlib.sha256(file.read_bytes()).hexdigest(),'originalSeconds':seconds,'referenceRepeats':repeats,'note':'Short preview is repeated only for local reference conditioning; generated speech uses new text.'})
    manifest['files'].append({'file':output.relative_to(root).as_posix(),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'bytes':output.stat().st_size})
    (root/'provenance.json').write_text(json.dumps(manifest,indent=2))
    job=subprocess.run([str(root/'python/python.exe'),str(root/'worker.py')],input=json.dumps({'voice':voice,'text':'The quiet garden welcomes a brand new story today.'}),text=True,capture_output=True,timeout=240)
    (root/f'{voice}-verification.log').write_text(job.stdout+'\n'+job.stderr);job.check_returncode()
    proof.append({'voice':voice,**json.loads(job.stdout.strip().splitlines()[-1])});shutil.move(root/'output.wav',root/f'{voice}-verification.wav')
    print('Verified new-text offline synthesis:',voice,flush=True)
ready.update(proof=proof,referencePreparation=sources);temp=root/'ready.json.part';temp.write_text(json.dumps(ready,indent=2));temp.replace(root/'ready.json')
