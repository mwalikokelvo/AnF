"""Inspect the exact vendor archive as data. Never extract or execute the JDK."""
import argparse,hashlib,json,re,stat,urllib.request,zipfile
from pathlib import Path,PurePosixPath
HERE=Path(__file__).resolve().parent
MAX_ARCHIVE=384*1024*1024
MODULES=('java.base','java.desktop','java.logging','java.management','java.naming','java.net.http','java.security.sasl','java.sql','java.xml','jdk.charsets','jdk.crypto.ec','jdk.httpserver','jdk.unsupported','jdk.zipfs')
def sha(data):return hashlib.sha256(data).hexdigest()
def stream_sha(stream):return hashlib.file_digest(stream,'sha256').hexdigest()
def inspect(archive,pin,source):
    archive=Path(archive)
    if not archive.is_file() or archive.is_symlink() or archive.is_junction() or archive.stat().st_size>MAX_ARCHIVE:raise ValueError('Unsafe JDK archive')
    with archive.open('rb') as stream:
        if stream_sha(stream)!=pin['archiveSha256']:raise ValueError('JDK publisher archive hash mismatch')
    rows=[];notices={}
    with zipfile.ZipFile(archive) as z:
        entries=z.infolist();names=[i.filename for i in entries]
        if len(names)!=len(set(names)) or len(names)>20000 or sum(i.file_size for i in entries)>1024*1024*1024:raise ValueError('Unexpected JDK archive inventory')
        roots=set()
        for i in entries:
            path=PurePosixPath(i.filename)
            if path.is_absolute() or '..' in path.parts or chr(92) in i.filename or ':' in i.filename or any(ord(c)<32 for c in i.filename) or stat.S_ISLNK(i.external_attr>>16) or i.flag_bits&1:raise ValueError('Unsafe JDK archive entry')
            roots.add(path.parts[0])
        if len(roots)!=1:raise ValueError('Unexpected JDK archive roots')
        root=next(iter(roots))+'/'
        required=['release','lib/src.zip','lib/modules','bin/java.exe','bin/jlink.exe']+['jmods/'+m+'.jmod' for m in MODULES]
        if any(root+p not in names for p in required):raise ValueError('Incomplete Windows JDK inputs')
        release=z.read(root+'release')
        if len(release)>65536 or sha(release)!=source['releaseFileSha256']:raise ValueError('Reviewed JDK release differs')
        with z.open(root+'lib/src.zip') as stream:
            if stream_sha(stream)!=source['javaApiSourcesSha256']:raise ValueError('Reviewed JDK API sources differ')
        evidence=source['sourceArchiveEvidence']
        if not source['completeSourceArchiveCollected'] or evidence['commit']!=source['commit'] or not evidence['inventory']['fullPinnedGitTreeMatches']:raise ValueError('Incomplete JDK source evidence')
        for i in entries:
            if i.is_dir():continue
            relative=i.filename[len(root):]
            with z.open(i) as stream:digest=stream_sha(stream)
            rows.append({'path':relative,'bytes':i.file_size,'sha256':digest})
            if relative.startswith('legal/'):
                if i.file_size>1048576:raise ValueError('Oversized JDK notice')
                notices[relative]=z.read(i)
        if not notices:raise ValueError('JDK legal notices missing')
    report={'schema':1,'archiveSha256':pin['archiveSha256'],'archiveBytes':archive.stat().st_size,'files':rows,'requiredModules':list(MODULES),'reviewedSourceCommit':source['commit'],'sourceArchiveSha256':evidence['archiveSha256'],'releaseAndApiSourceHashesMatch':True,'legalNoticeCount':len(notices),'archiveExtracted':False,'binaryExecuted':False,'publisherSignatureVerified':False,'binarySourceCorrespondenceApproved':False,'sourceCompleteDistributionPrepared':False,'readyForPublication':False}
    return report,notices

def fetch(url,target):
    if not re.fullmatch(r'https://download\.visualstudio\.microsoft\.com/download/pr/[A-Za-z0-9/-]+/microsoft-jdk-21\.0\.12\.1-windows-x64\.zip',url):raise ValueError('Unreviewed JDK host or path')
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):raise ValueError('Unexpected JDK redirect')
    with urllib.request.build_opener(NoRedirect()).open(url,timeout=30) as response,Path(target).open('xb') as output:
        if response.status!=200:raise ValueError('Unexpected JDK response')
        total=0
        while True:
            chunk=response.read(1024*1024)
            if not chunk:break
            total+=len(chunk)
            if total>MAX_ARCHIVE:raise ValueError('JDK download exceeds bound')
            output.write(chunk)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True,type=Path);args=parser.parse_args()
    pin=json.loads((HERE/'windows-jdk-input.json').read_text());source=json.loads((HERE/'native-source-evidence.json').read_text())['jdkSource']
    args.output.mkdir(parents=True,exist_ok=False);archive=args.output/'vendor-jdk.zip'
    fetch(pin['archiveUrl'],archive);report,notices=inspect(archive,pin,source)
    reports=args.output/'reports';reports.mkdir()
    for name,data in notices.items():
        target=reports/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    (reports/'jdk-provenance.json').write_text(json.dumps(report,indent=2)+'\n')
    print('PASS exact publisher archive/source hashes and legal/module inventory; no binary execution or publication approval')
