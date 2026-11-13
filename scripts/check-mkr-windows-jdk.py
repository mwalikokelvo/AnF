"""Synthetic archive checks only; no download, extraction or JDK execution."""
import hashlib,importlib.util,json,tempfile,zipfile,stat
from pathlib import Path
root=Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('jdk',root/'integrations/mkr-music/audit-windows-jdk.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
source={'releaseFileSha256':m.sha(b'fixture release'),'javaApiSourcesSha256':m.sha(b'fixture API'),'commit':'a'*40,'completeSourceArchiveCollected':True,'sourceArchiveEvidence':{'commit':'a'*40,'archiveSha256':'b'*64,'inventory':{'fullPinnedGitTreeMatches':True}}}
entries={'release':b'fixture release','lib/src.zip':b'fixture API','lib/modules':b'fixture image','bin/java.exe':b'not executable fixture','bin/jlink.exe':b'not executable fixture','legal/java.base/LICENSE':b'fixture legal text',**{'jmods/'+name+'.jmod':b'fixture module' for name in m.MODULES}}
def refuses(action):
 try:action()
 except ValueError:return
 raise AssertionError('Unsafe JDK inputs accepted')
with tempfile.TemporaryDirectory(prefix='anf-jdk-data-test-') as d:
 base=Path(d)
 def fixture(name,values,extra=None):
  p=base/(name+'.zip')
  with zipfile.ZipFile(p,'x') as z:
   for path,data in values.items():z.writestr('fixture-jdk/'+path,data)
   if extra:extra(z)
  return p,{'archiveSha256':hashlib.sha256(p.read_bytes()).hexdigest()}
 path,pin=fixture('valid',entries);report,notices=m.inspect(path,pin,source)
 assert report['releaseAndApiSourceHashesMatch'] and report['legalNoticeCount']==1 and len(notices)==1
 for key in ('archiveExtracted','binaryExecuted','publisherSignatureVerified','binarySourceCorrespondenceApproved','sourceCompleteDistributionPrepared','readyForPublication'):assert report[key] is False
 refuses(lambda:m.inspect(path,{'archiveSha256':'0'*64},source))
 for field in ('releaseFileSha256','javaApiSourcesSha256'):
  bad=json.loads(json.dumps(source));bad[field]='0'*64;refuses(lambda:m.inspect(path,pin,bad))
 for missing in ('jmods/java.base.jmod','lib/src.zip','legal/java.base/LICENSE'):
  values=dict(entries);del values[missing];p,q=fixture(missing.replace('/','-'),values);refuses(lambda:m.inspect(p,q,source))
 p,q=fixture('traversal',entries,lambda z:z.writestr('fixture-jdk/../escape',b'bad'));refuses(lambda:m.inspect(p,q,source))
 def link(z):
  i=zipfile.ZipInfo('fixture-jdk/link');i.create_system=3;i.external_attr=(stat.S_IFLNK|0o777)<<16;z.writestr(i,'outside')
 p,q=fixture('link',entries,link);refuses(lambda:m.inspect(p,q,source))
 bad=json.loads(json.dumps(source));bad['sourceArchiveEvidence']['commit']='c'*40;refuses(lambda:m.inspect(path,pin,bad))
print('PASS JDK archive/source/module/notice/path/link guards; fixture data never extracted or executed')
