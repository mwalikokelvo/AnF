"""One app-owned, isolated CPU voice job. Existing private packs remain compatible."""
import os,pathlib,sys,json,hashlib,socket
job=pathlib.Path(__file__).resolve().parent
def no_network(*args,**kwargs):
    raise RuntimeError('Networking is disabled in local voice synthesis.')
socket.socket.connect=no_network
socket.create_connection=no_network

def validate(request):
    if not isinstance(request,dict) or set(request)!={'root','voice','text'}:
        raise ValueError('Invalid local voice request.')
    if request['voice'] not in ('amazing','always-forever','burt-preview','serafina-preview','kelvin-preview'):
        raise ValueError('Choose a registered voice.')
    if not isinstance(request['text'],str) or not request['text'].strip() or len(request['text'])>600:
        raise ValueError('Voice text exceeds its limit.')
    if not isinstance(request['root'],str) or not pathlib.Path(request['root']).is_absolute():
        raise ValueError('Choose a local private voice pack.')
    return pathlib.Path(request['root']).resolve(strict=True)

def generate(request):
    root=validate(request)
    os.environ.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HOME=str(root/'cache'),NUMBA_CACHE_DIR=str(root/'cache/numba'))
    provenance=json.loads((root/'provenance.json').read_text())
    for item in provenance['files']:
        p=(root/item['file']).resolve()
        if root not in p.parents or p.is_symlink() or p.stat().st_size!=item['bytes'] or hashlib.sha256(p.read_bytes()).hexdigest()!=item['sha256']:
            raise ValueError('Voice runtime verification failed.')
    sys.path.insert(0,str(root/'source'))
    import torch,soundfile as sf,numpy as np
    from chatterbox.tts_nano import ChatterboxNanoTTS
    torch.set_num_threads(max(1,min(4,os.cpu_count() or 1)))
    model=ChatterboxNanoTTS.from_local(root/'model','cpu')
    with torch.inference_mode():
        wave=model.generate(request['text'],audio_prompt_path=str(root/'references'/f"{request['voice']}.wav")).squeeze().numpy()
    if not np.isfinite(wave).all() or len(wave)>model.sr*90 or len(wave)<model.sr//4 or float(np.max(np.abs(wave)))<0.005:
        raise ValueError('Synthesis produced invalid or overlong audio.')
    # The pack's shared output.wav is never read, removed or overwritten.
    with (job/'output.wav').open('xb') as output:
        sf.write(output,wave,model.sr,format='WAV',subtype='PCM_16')
    print(json.dumps({'sampleRate':model.sr,'seconds':len(wave)/model.sr}),flush=True)

if __name__=='__main__':
    raw=sys.stdin.buffer.read(8193)
    if len(raw)>8192:raise ValueError('Voice request exceeds limit.')
    generate(json.loads(raw))
