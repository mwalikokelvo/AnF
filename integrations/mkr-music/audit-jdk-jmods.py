"""Hash native JMOD payloads as bounded data; no extraction or execution."""
import argparse,hashlib,importlib.util,io,json,stat,zipfile
from pathlib import Path,PurePosixPath
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('jdk',HERE/'audit-windows-jdk.py');jdk=importlib.util.module_from_spec(spec);spec.loader.exec_module(jdk)
MAX_JMOD=128*1024*1024

def module_entries(data):
    if len(data)>MAX_JMOD or data[:4]!=b'JM\x01\x00':raise ValueError('Unsupported JMOD input')
    rows=[]
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries=archive.infolist();names=[i.filename for i in entries]
        if len(entries)>50000 or len(names)!=len(set(names)) or sum(i.file_size for i in entries)>512*1024*1024:raise ValueError('Unbounded JMOD archive')
        for i in entries:
            p=PurePosixPath(i.filename)
            if p.is_absolute() or '..' in p.parts or chr(92) in i.filename or ':' in i.filename or stat.S_ISLNK(i.external_attr>>16) or i.flag_bits&1:raise ValueError('Unsafe JMOD entry')
            if not i.is_dir() and i.filename.lower().endswith(('.exe','.dll')):
                if i.file_size>64*1024*1024:raise ValueError('Unbounded JMOD native entry')
                with archive.open(i) as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
                rows.append({'entry':i.filename,'bytes':i.file_size,'sha256':digest})
    return rows

def inspect(archive,report):
    pin=json.loads((HERE/'windows-jdk-input.json').read_text());source=json.loads((HERE/'native-source-evidence.json').read_text())['jdkSource']
    vendor,_=jdk.inspect(archive,pin,source);expected={r['path']:r for r in vendor['files']};modules=[]
    with zipfile.ZipFile(archive) as z:
        names=[i for i in z.infolist() if not i.is_dir() and '/jmods/' in i.filename and i.filename.endswith('.jmod')]
        if not 14<=len(names)<=128:raise ValueError('Unexpected JMOD count')
        for i in names:
            if i.file_size>MAX_JMOD:raise ValueError('Unbounded JMOD input')
            relative=i.filename.split('/',1)[1];data=z.read(i)
            if jdk.sha(data)!=expected[relative]['sha256']:raise ValueError('Changed JMOD container')
            modules.append({'module':Path(i.filename).stem,'containerSha256':jdk.sha(data),'nativeEntries':module_entries(data)})
    result={'schema':1,'archiveSha256':pin['archiveSha256'],'modules':modules,'nativeEntryCount':sum(len(m['nativeEntries']) for m in modules),'archiveExtracted':False,'binaryExecuted':False,'publisherSignatureVerified':False,'sourceReproducibilityVerified':False,'productionManifestApproved':False,'readyForPublication':False}
    with Path(report).open('x',encoding='utf-8') as stream:stream.write(json.dumps(result,indent=2)+'\n')
    print('PASS bounded JMOD native payload hashes retained; no code extraction or execution')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--archive',required=True,type=Path);p.add_argument('--report',required=True,type=Path);a=p.parse_args();inspect(a.archive,a.report)
