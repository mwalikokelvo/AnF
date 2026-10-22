"""Bounded local speech protocol; the native owner enforces idle/cancel/exit limits."""
import os,pathlib,sys,json,hashlib,socket,re

# Preserve a protocol-only handle before libraries/native extensions can print.
protocol=os.fdopen(os.dup(sys.stdout.fileno()),'wb',buffering=0)
os.dup2(sys.stderr.fileno(),sys.stdout.fileno())
base=pathlib.Path(__file__).resolve(strict=True).parent.parent

def no_network(*args,**kwargs):
    raise RuntimeError('Networking is disabled in local voice synthesis.')
socket.socket.connect=no_network
socket.create_connection=no_network

def request(raw):
    if len(raw)>8192 or not raw.endswith(b'\n'):
        raise ValueError('Invalid speech frame.')
    value=json.loads(raw)
    if not isinstance(value,dict) or set(value)!={'v','id','root','voice','text'} or type(value['v']) is not int or value['v']!=1:
        raise ValueError('Invalid speech request.')
    if not isinstance(value['id'],str) or not re.fullmatch('[0-9a-f]{64}',value['id']):
        raise ValueError('Invalid speech job.')
    if value['voice'] not in ('amazing','always-forever','burt-preview','serafina-preview','kelvin-preview'):
        raise ValueError('Choose a registered voice.')
    if not isinstance(value['text'],str) or not value['text'].strip() or len(value['text'])>600:
        raise ValueError('Invalid speech text.')
    if not isinstance(value['root'],str) or not pathlib.Path(value['root']).is_absolute():
        raise ValueError('Invalid private pack.')
    return value

def job_path(key):
    path=base/key
    if path.is_symlink() or not path.is_dir() or path.resolve(strict=True).parent!=base or path.resolve(strict=True).name!=key:
        raise ValueError('Invalid isolated job.')
    return path

def verify(root):
    raw=(root/'provenance.json').read_bytes()
    provenance=json.loads(raw)
    for item in provenance['files']:
        p=(root/item['file']).resolve(strict=True)
        if root not in p.parents or p.is_symlink() or p.stat().st_size!=item['bytes']:
            raise ValueError('Voice runtime verification failed.')
        digest=hashlib.sha256()
        with p.open('rb') as f:
            for block in iter(lambda:f.read(1024*1024),b''):digest.update(block)
        if digest.hexdigest()!=item['sha256']:
            raise ValueError('Voice runtime verification failed.')
    return hashlib.sha256(raw).digest()

def serve():
    root=None;proof=None;model=None
    while True:
        raw=sys.stdin.buffer.readline(8193)
        if not raw:return
        value=request(raw)
        selected=pathlib.Path(value['root']).resolve(strict=True)
        if root is not None and selected!=root:raise ValueError('Private pack changed.')
        root=selected
        job_path(value['id'])
        current=verify(root) # Full provenance and all file hashes on EVERY request.
        if proof is not None and proof!=current:raise ValueError('Private pack changed.')
        proof=current
        if model is None:
            os.environ.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HOME=str(root/'cache'),NUMBA_CACHE_DIR=str(root/'cache/numba'))
            sys.path.insert(0,str(root/'source'))
            import torch,soundfile as sf,numpy as np
            from chatterbox.tts_nano import ChatterboxNanoTTS
            torch.set_num_threads(max(1,min(4,os.cpu_count() or 1)))
            model=ChatterboxNanoTTS.from_local(root/'model','cpu')
        with torch.inference_mode():
            wave=model.generate(value['text'],audio_prompt_path=str(root/'references'/f"{value['voice']}.wav")).squeeze().numpy()
        if not np.isfinite(wave).all() or len(wave)>model.sr*90 or len(wave)<model.sr//4 or float(np.max(np.abs(wave)))<0.005:
            raise ValueError('Invalid speech audio.')
        with (job_path(value['id'])/'output.wav').open('xb') as output:
            sf.write(output,wave,model.sr,format='WAV',subtype='PCM_16')
        protocol.write((json.dumps({'v':1,'id':value['id'],'ok':True},separators=(',',':'))+'\n').encode('ascii'))

if __name__=='__main__':
    # Any invalid frame, pack, output or inference failure ends residency. The
    # native owner refuses the result and tears down the complete process job.
    serve()
