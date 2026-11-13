"""Offline recovery guards; generated archives only, no network."""
import hashlib,importlib.util,io,json,tempfile,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('inputs',root/'integrations/mkr-music/collect-reviewed-source-inputs.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with io.BytesIO() as buffer:
 with zipfile.ZipFile(buffer,'w') as z:z.writestr('Fixture.java','// generated source fixture')
 data=buffer.getvalue()
audit=json.dumps({'schema':1,'readyForPublication':False,'dependencies':[{'coordinate':'org.example:fixture:1','sha256':'a'*64}]}).encode()
row={'coordinate':'org.example:fixture:1','binarySha256':'a'*64,'sourceUrl':m.bounded.source_url('org.example:fixture:1'),
 'sourceArchiveName':'org.example__fixture__1-sources.jar','sourceSha256':hashlib.sha256(data).hexdigest(),'sourceBytes':len(data)}
evidence={'readyForPublication':False,'sourceCompleteDistributionPrepared':False,'runtimeAuditSha256':hashlib.sha256(audit).hexdigest(),'dependencyCount':1,'dependencies':[row]}
def refuses(action):
 try:action()
 except ValueError:return
 raise AssertionError('Unsafe source input accepted')
with tempfile.TemporaryDirectory(prefix='anf-source-input-test-') as directory:
 base=Path(directory);calls=[]
 def fetch(url,limit):calls.append((url,limit));return data
 result=m.collect(audit,evidence,base/'first',fetcher=fetch)
 assert result['inputsComplete'] and len(calls)==1 and not result['readyForPublication'] and not result['sourceCompleteDistributionPrepared']
 reused=m.collect(audit,evidence,base/'reused',reuse=base/'first')
 assert reused['artifacts'][0]['reusedVerifiedBytes'] and len(calls)==1
 refuses(lambda:m.collect(audit,evidence,base/'first',fetcher=fetch))
 refuses(lambda:m.collect(audit,evidence,base/'missing'))
 assert not (base/'missing').exists()
 for key,value in [('binarySha256','b'*64),('sourceUrl','https://example.invalid/fixture.jar'),('sourceArchiveName','../escape.jar')]:
  bad=json.loads(json.dumps(evidence));bad['dependencies'][0][key]=value
  refuses(lambda:m.collect(audit,bad,base/'invalid',fetcher=fetch));assert not (base/'invalid').exists()
 refuses(lambda:m.collect(audit+ b' ',evidence,base/'changed',fetcher=fetch))
 (base/'first'/row['sourceArchiveName']).write_bytes(b'changed')
 refuses(lambda:m.collect(audit,evidence,base/'corrupt',reuse=base/'first',fetcher=fetch));assert not (base/'corrupt').exists()
 assert len(calls)==1
print('PASS source recovery graph/URL/hash/path/cache/no-fetch/no-overwrite guards; no approval inferred')
