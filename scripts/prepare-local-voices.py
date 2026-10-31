"""Explicit provisioning only. Downloads public pinned model/code; never uploads audio/text."""
import argparse, concurrent.futures, hashlib, json, pathlib, urllib.request

MODEL='71ccd1d0081b430592cea481f4307e764e07bc64'
SOURCE='647b4e895d3483995e5a6546999aa5e50490b92b'
LICENSE_SOURCE='5de7a54aa4e5e2baadb0182dde554908b48b85c2'
BASE='https://huggingface.co/'
def api(url):
    with urllib.request.urlopen(url,timeout=60) as r:return json.load(r)
def provision(root):
    root.mkdir(parents=True,exist_ok=True)
    jobs=[]
    for item in api(BASE+f'api/spaces/ResembleAI/chatterbox-nano-demo/tree/{SOURCE}?recursive=true&limit=1000'):
        p=item['path']
        if item['type']=='file' and p.startswith('chatterbox/') and p.endswith('.py'):
            jobs.append((BASE+f'spaces/ResembleAI/chatterbox-nano-demo/resolve/{SOURCE}/'+p,root/'source'/p,item))
    names={'ve.safetensors','t3_nano_v1.safetensors','s3gen_meanflow.safetensors','added_tokens.json','merges.txt','special_tokens_map.json','tokenizer_config.json','vocab.json'}
    for item in api(BASE+f'api/models/ResembleAI/chatterbox-nano/tree/{MODEL}'):
        if item['path'] in names:jobs.append((BASE+f'ResembleAI/chatterbox-nano/resolve/{MODEL}/'+item['path'],root/'model'/item['path'],item))
    def fetch(job):
        url,dest,info=job; dest.parent.mkdir(parents=True,exist_ok=True)
        if not dest.exists() or dest.stat().st_size!=info['size']:
            part=dest.with_suffix(dest.suffix+'.part')
            with urllib.request.urlopen(url,timeout=120) as r,part.open('wb') as out:
                total=0
                while b:=r.read(1024*1024):
                    total+=len(b)
                    if total>info['size']:raise ValueError('Download exceeded pinned size')
                    out.write(b)
            if total!=info['size']:raise ValueError('Truncated download')
            part.replace(dest)
        content=dest.read_bytes(); sha=hashlib.sha256(content).hexdigest()
        expected=info.get('lfs',{}).get('oid')
        actual=sha if expected else hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()
        if actual!=(expected or info['oid']):raise ValueError('Upstream content hash mismatch: '+dest.name)
        print('Verified',dest.name,flush=True)
        return {'file':dest.relative_to(root).as_posix(),'sha256':sha,'bytes':len(content)}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:files=list(pool.map(fetch,jobs))
    license_info=api(f'https://api.github.com/repos/resemble-ai/chatterbox/contents/LICENSE?ref={LICENSE_SOURCE}')
    license_job=(f'https://raw.githubusercontent.com/resemble-ai/chatterbox/{LICENSE_SOURCE}/LICENSE',root/'licenses/Chatterbox-MIT.txt',{'size':license_info['size'],'oid':license_info['sha']})
    files.append(fetch(license_job))
    # Only import the selected reviewed engine, avoiding unrelated multilingual dependencies.
    (root/'source/chatterbox/__init__.py').write_text('# Local Nano-only entry point. Upstream MIT attribution in licenses.\n',encoding='utf-8')
    (root/'provenance.json').write_text(json.dumps({'model':MODEL,'source':SOURCE,'files':files},indent=2),encoding='utf-8')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--destination',type=pathlib.Path,required=True)
    provision(p.parse_args().destination.resolve())
