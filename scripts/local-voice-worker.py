"""One bounded offline synthesis job. No requests or reference audio leave this process."""
import os, pathlib, sys, json, hashlib, socket
root = pathlib.Path(__file__).resolve().parent
os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HOME=str(root/'cache'), NUMBA_CACHE_DIR=str(root/'cache/numba'))
def no_network(*args, **kwargs):
    raise RuntimeError('Networking is disabled in local voice synthesis.')
socket.socket.connect = no_network
socket.create_connection = no_network

def generate(request):
    voice, text = request.get('voice'), request.get('text')
    if voice not in ('amazing', 'always-forever', 'burt-preview', 'serafina-preview', 'kelvin-preview') or not isinstance(text,str) or not text.strip() or len(text)>600:
        raise ValueError('Choose a registered voice and between 1 and 600 characters.')
    provenance=json.loads((root/'provenance.json').read_text())
    for item in provenance['files']:
        p=(root/item['file']).resolve()
        if root not in p.parents or p.is_symlink() or p.stat().st_size!=item['bytes'] or hashlib.sha256(p.read_bytes()).hexdigest()!=item['sha256']:
            raise ValueError('Voice runtime verification failed.')
    sys.path.insert(0,str(root/'source'))
    import torch, soundfile as sf, numpy as np
    from chatterbox.tts_nano import ChatterboxNanoTTS
    torch.set_num_threads(max(1,min(4,os.cpu_count() or 1)))
    model=ChatterboxNanoTTS.from_local(root/'model','cpu')
    with torch.inference_mode():
        wave=model.generate(text,audio_prompt_path=str(root/'references'/f'{voice}.wav')).squeeze().numpy()
    if not np.isfinite(wave).all() or len(wave)>model.sr*90 or len(wave)<model.sr//4 or float(np.max(np.abs(wave)))<0.005:
        raise ValueError('Synthesis produced invalid or overlong audio.')
    output=root/'output.wav'
    sf.write(output,wave,model.sr,subtype='PCM_16')
    print(json.dumps({'sampleRate':model.sr,'seconds':len(wave)/model.sr,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}),flush=True)
if __name__=='__main__':
    raw=sys.stdin.buffer.read(10000)
    if len(raw)>=10000: raise ValueError('Voice request exceeds limit.')
    generate(json.loads(raw))
