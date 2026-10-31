"""Explicit public-source verification. Never reads private audio."""
import urllib.request, urllib.parse, json, pathlib, hashlib
base=pathlib.Path(__file__).resolve().parents[1]/'windows/src/workspace/assets'
entries=[]
for folder,font,license in [('lora','Lora.ttf','Lora-OFL.txt'),('atkinsonhyperlegible','AtkinsonHyperlegible-Regular.ttf','Atkinson-OFL.txt')]:
    data=json.load(urllib.request.urlopen('https://api.github.com/repos/google/fonts/commits?path=ofl/'+folder+'&per_page=1',timeout=60))
    sha=data[0]['sha'];files=json.load(urllib.request.urlopen('https://api.github.com/repos/google/fonts/contents/ofl/'+folder+'?ref='+sha,timeout=60))
    candidates=[f for f in files if f['name'].endswith('.ttf') and 'Italic' not in f['name']]
    if folder=='atkinsonhyperlegible':candidates=[f for f in candidates if f['name']==font]
    for upstream,local in [(candidates[0]['name'],font),('OFL.txt',license)]:
        url='https://raw.githubusercontent.com/google/fonts/'+sha+'/ofl/'+folder+'/'+urllib.parse.quote(upstream)
        b=urllib.request.urlopen(url,timeout=60).read();existing=(base/local).read_bytes()
        if hashlib.sha256(b).digest()!=hashlib.sha256(existing).digest():raise ValueError('Existing font differs from upstream: '+local)
        entries.append({'file':local,'source':url,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)})
(base/'provenance.json').write_text(json.dumps(entries,indent=2))
repo=json.load(urllib.request.urlopen('https://api.github.com/repos/lucaschultz/adobe-font-extractor/commits/dev',timeout=60))['sha']
(base/'extractor-review.json').write_text(json.dumps({'repository':'https://github.com/lucaschultz/adobe-font-extractor','commit':repo,'license':'MIT','copyright':'2025 Luca Schultz','reuse':'Approach reviewed; independent bounded cache copier, no upstream code copied.'},indent=2))
print('Verified all bundled fonts/licenses against immutable public source revisions.')
